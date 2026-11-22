import crypto from 'node:crypto';
import { PersistentStore } from '../store.ts';
import { BillingWebhookEventRecord, SaaSSubscription } from '../types.ts';
import { evaluateOrganizationEntitlements } from './entitlements.ts';

export interface PaymentEventPayload {
  id: string;
  type:
    | 'checkout.session.completed'
    | 'customer.subscription.created'
    | 'customer.subscription.updated'
    | 'customer.subscription.deleted'
    | 'invoice.paid'
    | 'invoice.payment_succeeded'
    | 'invoice.payment_failed'
    | string;
  data: {
    object: {
      id?: string;
      subscription?: string;
      customer?: string;
      status?: string;
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
  checkoutUrl: string | null;
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
    checkoutUrl: null,
    subscription: sub,
    requiresWebhookConfirmation: true,
  };
}

/**
 * Real Stripe Checkout Session creation against https://api.stripe.com/v1/checkout/sessions
 * when STRIPE_SECRET_KEY is configured. Never trusts frontend prices — always reads price from
 * server-side CommercialPlan or configured STRIPE_PRICE_<PLANCODE>.
 */
export async function createLiveStripeCheckoutSession(
  store: PersistentStore,
  params: {
    organizationId: string;
    planCode: string;
    actorUserId: string;
    successUrl?: string;
    cancelUrl?: string;
    fetchImpl?: typeof fetch;
  }
): Promise<{
  mode: 'stripe_live_configured' | 'sandbox_pending_keys';
  checkoutSessionId: string;
  checkoutUrl: string | null;
  subscription: SaaSSubscription;
  requiresWebhookConfirmation: true;
  blockedReason?: string;
}> {
  const base = createSaaSCheckoutSession(store, {
    organizationId: params.organizationId,
    planCode: params.planCode,
    actorUserId: params.actorUserId,
  });

  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secretKey) {
    return {
      ...base,
      blockedReason: 'STRIPE_SECRET_KEY não configurada no servidor (modo sandbox).',
    };
  }

  const state = store.getState();
  const plan = state.commercialPlans.find((p) => p.code === params.planCode && p.isActive)!;
  const stripePriceEnv = process.env[`STRIPE_PRICE_${plan.code}`]?.trim();
  const appUrl = (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
  const successUrl = params.successUrl || `${appUrl}/?billing=success&session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = params.cancelUrl || `${appUrl}/?billing=canceled`;

  const body = new URLSearchParams();
  body.set('mode', 'subscription');
  body.set('success_url', successUrl);
  body.set('cancel_url', cancelUrl);
  body.set('client_reference_id', params.organizationId);
  body.set('metadata[organizationId]', params.organizationId);
  body.set('metadata[planCode]', plan.code);
  body.set('metadata[subscriptionId]', base.subscription.id);
  body.set('subscription_data[metadata][organizationId]', params.organizationId);
  body.set('subscription_data[metadata][planCode]', plan.code);

  if (stripePriceEnv) {
    body.set('line_items[0][price]', stripePriceEnv);
    body.set('line_items[0][quantity]', '1');
  } else {
    body.set('line_items[0][price_data][currency]', 'brl');
    body.set('line_items[0][price_data][unit_amount]', String(Math.round(plan.recurringPrice * 100)));
    body.set('line_items[0][price_data][recurring][interval]', plan.recurrence === 'Anual' ? 'year' : 'month');
    body.set('line_items[0][price_data][product_data][name]', `${plan.name} (NER Agency OS)`);
    body.set('line_items[0][quantity]', '1');
  }

  const doFetch = params.fetchImpl || fetch;
  const resp = await doFetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(`STRIPE_API_ERROR:${resp.status}:${errText.slice(0, 200)}`);
  }

  const sessionData = (await resp.json()) as { id: string; url?: string | null };
  store.audit(params.organizationId, params.actorUserId, 'BILLING_STRIPE_LIVE_SESSION_CREATED', 'Subscription', base.subscription.id, {
    checkoutSessionId: sessionData.id,
    planCode: plan.code,
  });

  return {
    mode: 'stripe_live_configured',
    checkoutSessionId: sessionData.id,
    checkoutUrl: sessionData.url || null,
    subscription: base.subscription,
    requiresWebhookConfirmation: true,
  };
}

export async function createStripePortalSession(
  store: PersistentStore,
  params: {
    organizationId: string;
    actorUserId: string;
    returnUrl?: string;
    fetchImpl?: typeof fetch;
  }
): Promise<{ ok: true; url: string } | { ok: false; status: number; error: string }> {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secretKey) {
    return {
      ok: false,
      status: 503,
      error: 'Portal do assinante Stripe requer STRIPE_SECRET_KEY configurada no ambiente.',
    };
  }
  const sub = store.getState().subscriptions.find((s) => s.organizationId === params.organizationId);
  if (!sub?.externalCustomerId) {
    return {
      ok: false,
      status: 400,
      error: 'Organização ainda não possui customer_id vinculado no Stripe. Conclua um checkout primeiro.',
    };
  }

  const appUrl = (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
  const body = new URLSearchParams();
  body.set('customer', sub.externalCustomerId);
  body.set('return_url', params.returnUrl || `${appUrl}/?tab=ops-billing`);

  const doFetch = params.fetchImpl || fetch;
  const resp = await doFetch('https://api.stripe.com/v1/billing_portal/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });
  if (!resp.ok) {
    return { ok: false, status: 502, error: 'Falha ao criar sessão do Portal Stripe.' };
  }
  const data = (await resp.json()) as { url: string };
  store.audit(params.organizationId, params.actorUserId, 'BILLING_PORTAL_SESSION_CREATED', 'Subscription', sub.id, {});
  return { ok: true, url: data.url };
}

export async function cancelOrganizationSubscription(
  store: PersistentStore,
  params: {
    organizationId: string;
    actorUserId: string;
    reason?: string;
    fetchImpl?: typeof fetch;
  }
): Promise<{ ok: true; subscription: SaaSSubscription; stripeRemoteCanceled: boolean } | { ok: false; status: number; error: string }> {
  const sub = store.getState().subscriptions.find((s) => s.organizationId === params.organizationId);
  if (!sub) {
    return { ok: false, status: 404, error: 'Nenhuma assinatura encontrada para esta organização.' };
  }

  let stripeRemoteCanceled = false;
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (secretKey && sub.externalSubId) {
    const doFetch = params.fetchImpl || fetch;
    const resp = await doFetch(`https://api.stripe.com/v1/subscriptions/${encodeURIComponent(sub.externalSubId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${secretKey}` },
    });
    if (!resp.ok) {
      return { ok: false, status: 502, error: 'Falha ao cancelar assinatura no Stripe.' };
    }
    stripeRemoteCanceled = true;
  }

  sub.status = 'canceled';
  sub.updatedAt = new Date().toISOString();
  store.audit(params.organizationId, params.actorUserId, 'BILLING_SUBSCRIPTION_CANCELED', 'Subscription', sub.id, {
    reason: params.reason || 'Cancelamento administrativo',
    stripeRemoteCanceled,
  });

  return { ok: true, subscription: sub, stripeRemoteCanceled };
}

function mapStripeSubscriptionStatus(status?: string): SaaSSubscription['status'] | null {
  switch (status) {
    case 'active':
      return 'active';
    case 'trialing':
      return 'trialing';
    case 'past_due':
    case 'unpaid':
      return 'past_due';
    case 'canceled':
    case 'incomplete_expired':
      return 'canceled';
    case 'incomplete':
      return 'incomplete';
    default:
      return null;
  }
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
  const subId = metadata.subscriptionId || obj.subscription || (event.type.startsWith('customer.subscription.') ? obj.id : undefined);

  let sub =
    state.subscriptions.find(
      (s) => (orgId && s.organizationId === orgId) || (subId && (s.id === subId || s.externalSubId === subId))
    ) || null;

  const now = new Date().toISOString();
  let summary = `Evento ${event.type} recebido`;

  // Allow customer.subscription.created to provision a subscription record if orgId is provided
  if (!sub && event.type === 'customer.subscription.created' && orgId) {
    const plan =
      state.commercialPlans.find((p) => p.code === metadata.planCode) ||
      state.commercialPlans.find((p) => p.code === 'NER_BUSINESS_GROWTH') ||
      state.commercialPlans[0];
    if (plan) {
      sub = {
        id: `sub-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
        organizationId: orgId,
        planCode: plan.code,
        planName: `${plan.name} (SaaS)`,
        provider: 'stripe',
        externalSubId: obj.id || obj.subscription || null,
        externalCustomerId: obj.customer || null,
        status: mapStripeSubscriptionStatus(obj.status) || 'incomplete',
        amountMonthly: plan.recurringPrice,
        currentPeriodEnd: obj.current_period_end ? new Date(obj.current_period_end * 1000).toISOString() : null,
        updatedAt: now,
      };
      state.subscriptions.push(sub);
    }
  }

  if (sub) {
    if (
      event.type === 'checkout.session.completed' ||
      event.type === 'invoice.paid' ||
      event.type === 'invoice.payment_succeeded'
    ) {
      const paidOk =
        event.type === 'invoice.paid' || event.type === 'invoice.payment_succeeded'
          ? obj.amount_paid === undefined || obj.amount_paid > 0
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
    } else if (
      event.type === 'customer.subscription.created' ||
      event.type === 'customer.subscription.updated'
    ) {
      const mapped = mapStripeSubscriptionStatus(obj.status);
      if (mapped) sub.status = mapped;
      if (metadata.planCode) {
        const plan = state.commercialPlans.find((p) => p.code === metadata.planCode);
        if (plan) {
          sub.planCode = plan.code;
          sub.planName = `${plan.name} (SaaS)`;
          sub.amountMonthly = plan.recurringPrice;
        }
      }
      if (obj.id && event.type.startsWith('customer.subscription.')) sub.externalSubId = obj.id;
      if (obj.customer) sub.externalCustomerId = obj.customer;
      if (obj.current_period_end) {
        sub.currentPeriodEnd = new Date(obj.current_period_end * 1000).toISOString();
      }
      sub.updatedAt = now;
      summary = `Assinatura ${sub.id} sincronizada via ${event.type} (status: ${sub.status})`;
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
  return evaluateOrganizationEntitlements(store, organizationId);
}
