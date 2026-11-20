import crypto from 'node:crypto';
import { PersistentStore } from '../store.ts';
import { BillingWebhookEventRecord, SaaSSubscription } from '../types.ts';

export interface PaymentEventPayload {
  id: string;
  type:
    | 'checkout.session.completed'
    | 'invoice.payment_succeeded'
    | 'invoice.payment_failed'
    | 'customer.subscription.deleted'
    | string;
  data: {
    object: {
      id?: string;
      subscription?: string;
      customer?: string;
      payment_status?: string;
      amount_paid?: number;
      current_period_end?: number;
      metadata?: {
        organizationId?: string;
        planCode?: string;
        subscriptionId?: string;
      };
    };
  };
}

export interface PaymentProviderAdapter {
  readonly providerName: 'stripe';
  verifySignature(rawBody: Buffer | string, signatureHeader: string | undefined, secret: string): boolean;
  parseEvent(rawBody: Buffer | string): PaymentEventPayload;
}

export class StripePaymentAdapter implements PaymentProviderAdapter {
  public readonly providerName = 'stripe' as const;

  public verifySignature(
    rawBody: Buffer | string,
    signatureHeader: string | undefined,
    secret: string
  ): boolean {
    if (!signatureHeader || !secret) return false;

    const parts = signatureHeader.split(',').map((p) => p.trim());
    let timestamp = '';
    const v1Signatures: string[] = [];

    for (const part of parts) {
      const [k, v] = part.split('=');
      if (k === 't') timestamp = v;
      if (k === 'v1' && v) v1Signatures.push(v);
    }

    if (!timestamp || v1Signatures.length === 0) return false;

    const tsNum = Number(timestamp);
    if (!Number.isFinite(tsNum)) return false;
    // Reject signatures older than 5 minutes (replay protection)
    const nowSec = Math.floor(Date.now() / 1000);
    if (Math.abs(nowSec - tsNum) > 300) return false;

    const payloadStr = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : rawBody;
    const signedPayload = `${timestamp}.${payloadStr}`;
    const expectedHmac = crypto
      .createHmac('sha256', secret)
      .update(signedPayload, 'utf8')
      .digest('hex');

    const expectedBuf = Buffer.from(expectedHmac, 'hex');
    return v1Signatures.some((sig) => {
      if (!/^[a-f0-9]+$/i.test(sig)) return false;
      const actualBuf = Buffer.from(sig, 'hex');
      if (actualBuf.length !== expectedBuf.length) return false;
      return crypto.timingSafeEqual(actualBuf, expectedBuf);
    });
  }

  public parseEvent(rawBody: Buffer | string): PaymentEventPayload {
    const payloadStr = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : rawBody;
    return JSON.parse(payloadStr) as PaymentEventPayload;
  }
}

export function buildStripeSignatureHeader(rawPayload: string, secret: string, timestampSec?: number): string {
  const ts = timestampSec ?? Math.floor(Date.now() / 1000);
  const sig = crypto
    .createHmac('sha256', secret)
    .update(`${ts}.${rawPayload}`, 'utf8')
    .digest('hex');
  return `t=${ts},v1=${sig}`;
}

export function createSaaSCheckoutSession(
  store: PersistentStore,
  params: {
    organizationId: string;
    planCode: string;
    actorUserId: string;
  }
): {
  mode: 'stripe_live_configured' | 'sandbox_pending_keys';
  checkoutSessionId: string;
  subscription: SaaSSubscription;
  requiresWebhookConfirmation: true;
} {
  const state = store.getState();
  const plan = state.commercialPlans.find((p) => p.code === params.planCode && p.isActive);
  if (!plan) {
    throw new Error('SAAS_PLAN_NOT_FOUND');
  }

  const now = new Date().toISOString();
  let sub = state.subscriptions.find((s) => s.organizationId === params.organizationId);
  if (!sub) {
    sub = {
      id: `sub-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
      organizationId: params.organizationId,
      planCode: plan.code,
      planName: `${plan.name} (SaaS)`,
      provider: 'stripe',
      externalSubId: null,
      externalCustomerId: null,
      status: 'incomplete',
      amountMonthly: plan.recurringPrice,
      currentPeriodEnd: null,
      updatedAt: now,
    };
    state.subscriptions.push(sub);
  } else {
    // Crucial business rule: initiating checkout NEVER marks subscription active before confirmed payment webhook
    sub.planCode = plan.code;
    sub.planName = `${plan.name} (SaaS)`;
    sub.amountMonthly = plan.recurringPrice;
    sub.status = 'incomplete';
    sub.updatedAt = now;
  }

  const checkoutSessionId = `cs_${process.env.STRIPE_SECRET_KEY ? 'live' : 'sandbox'}_${crypto.randomBytes(6).toString('hex')}`;

  store.audit(params.organizationId, params.actorUserId, 'BILLING_CHECKOUT_INITIATED', 'Subscription', sub.id, {
    planCode: plan.code,
    statusAfterInit: sub.status,
    checkoutSessionId,
  });
  store.save();

  return {
    mode: process.env.STRIPE_SECRET_KEY ? 'stripe_live_configured' : 'sandbox_pending_keys',
    checkoutSessionId,
    subscription: sub,
    requiresWebhookConfirmation: true,
  };
}

export function processPaymentWebhook(
  store: PersistentStore,
  event: PaymentEventPayload
): {
  duplicate: boolean;
  record: BillingWebhookEventRecord;
  subscription: SaaSSubscription | null;
} {
  const state = store.getState();
  const existing = state.billingWebhookEvents.find((e) => e.eventId === event.id && e.status === 'processed');
  if (existing) {
    return {
      duplicate: true,
      record: existing,
      subscription: state.subscriptions.find((s) => s.organizationId === existing.organizationId) || null,
    };
  }

  const obj = event.data?.object || {};
  const metadata = obj.metadata || {};
  const orgId = metadata.organizationId;
  const subId = metadata.subscriptionId || obj.subscription;

  const sub = state.subscriptions.find(
    (s) => (orgId && s.organizationId === orgId) || (subId && (s.id === subId || s.externalSubId === subId))
  ) || null;

  const now = new Date().toISOString();
  let summary = `Evento ${event.type} recebido`;

  if (sub) {
    if (event.type === 'checkout.session.completed' || event.type === 'invoice.payment_succeeded') {
      const paidOk =
        event.type === 'invoice.payment_succeeded'
          ? (obj.amount_paid === undefined || obj.amount_paid > 0)
          : obj.payment_status === 'paid' || obj.payment_status === undefined;

      if (paidOk) {
        sub.status = 'active';
        if (metadata.planCode) {
          const plan = state.commercialPlans.find((p) => p.code === metadata.planCode);
          if (plan) {
            sub.planCode = plan.code;
            sub.planName = `${plan.name} (SaaS)`;
            sub.amountMonthly = plan.recurringPrice;
          }
        }
        if (obj.subscription) sub.externalSubId = obj.subscription;
        if (obj.customer) sub.externalCustomerId = obj.customer;
        const periodEndMs = obj.current_period_end
          ? obj.current_period_end * 1000
          : Date.now() + 30 * 24 * 60 * 60 * 1000;
        sub.currentPeriodEnd = new Date(periodEndMs).toISOString();
        sub.updatedAt = now;
        summary = `Assinatura ${sub.id} ativada após confirmação real (${event.type})`;
      } else {
        summary = `Evento ${event.type} sem confirmação de pagamento (status mantido: ${sub.status})`;
      }
    } else if (event.type === 'invoice.payment_failed') {
      sub.status = 'past_due';
      sub.updatedAt = now;
      summary = `Pagamento falhou; assinatura ${sub.id} marcada como past_due`;
    } else if (event.type === 'customer.subscription.deleted') {
      sub.status = 'canceled';
      sub.updatedAt = now;
      summary = `Assinatura ${sub.id} cancelada via webhook`;
    }
  } else {
    summary = `Evento ${event.type} processado sem assinatura correspondente no escopo`;
  }

  const record: BillingWebhookEventRecord = {
    id: `wh-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
    provider: 'stripe',
    eventId: event.id,
    eventType: event.type,
    organizationId: sub?.organizationId || orgId,
    status: 'processed',
    summary,
    processedAt: now,
  };
  state.billingWebhookEvents.unshift(record);

  if (sub) {
    store.audit(sub.organizationId, 'stripe-webhook', 'BILLING_WEBHOOK_PROCESSED', 'Subscription', sub.id, {
      eventId: event.id,
      eventType: event.type,
      subscriptionStatus: sub.status,
    });
  } else {
    store.save();
  }

  return {
    duplicate: false,
    record,
    subscription: sub,
  };
}

export function getOrganizationEntitlements(store: PersistentStore, organizationId: string) {
  const state = store.getState();
  const sub = state.subscriptions.find((s) => s.organizationId === organizationId);
  const plan = sub ? state.commercialPlans.find((p) => p.code === sub.planCode) : null;
  const active = sub ? sub.status === 'active' || sub.status === 'trialing' : false;

  const orgUsers = state.users.filter((u) => u.organizationId === organizationId && u.status === 'Ativo').length;
  const orgWebPages = state.webPages.filter((w) => w.organizationId === organizationId);

  return {
    subscriptionStatus: sub?.status || 'none',
    planCode: sub?.planCode || 'NONE',
    planName: sub?.planName || 'Sem Assinatura Ativa',
    isEntitled: active,
    limits: active && plan ? plan.limits : { landingPages: 0, sites: 0, users: 1, storageGb: 0 },
    usage: {
      users: orgUsers,
      landingPages: orgWebPages.filter((w) => w.pageType.includes('Landing Page')).length,
      sites: orgWebPages.filter((w) => w.pageType === 'Site Institucional' || w.pageType === 'E-commerce').length,
    },
  };
}
