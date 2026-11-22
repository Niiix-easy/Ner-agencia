import crypto from 'node:crypto';
import { PersistentStore, hashPassword, hashToken } from '../store.ts';

const RESET_TOKEN_TTL_MS = 30 * 60 * 1000; // 30 minutes
const resetRateLimiter = new Map<string, { count: number; resetAt: number }>();

export function resetPasswordRateLimiter(): void {
  resetRateLimiter.clear();
}

function allowResetRequest(key: string): boolean {
  const now = Date.now();
  const entry = resetRateLimiter.get(key);
  if (!entry || entry.resetAt <= now) {
    resetRateLimiter.set(key, { count: 1, resetAt: now + 15 * 60 * 1000 });
    return true;
  }
  if (entry.count >= 5) return false;
  entry.count += 1;
  return true;
}

export interface PasswordResetRequestResult {
  accepted: boolean;
  rateLimited?: boolean;
  message: string;
  deliveryMode: 'email_provider_sent' | 'pending_email_provider' | 'noop_unknown_email';
  testOnlyToken?: string;
}

export async function requestPasswordReset(
  store: PersistentStore,
  params: {
    email: string;
    ip?: string;
    appBaseUrl?: string;
  }
): Promise<PasswordResetRequestResult> {
  const normalizedEmail = String(params.email || '').trim().toLowerCase();
  const rateKey = `${params.ip || 'local'}:${normalizedEmail}`;
  if (!allowResetRequest(rateKey)) {
    return {
      accepted: false,
      rateLimited: true,
      message: 'Muitas solicitações de recuperação de senha. Aguarde alguns minutos.',
      deliveryMode: 'noop_unknown_email',
    };
  }

  const genericMessage = 'Se o e-mail estiver cadastrado, enviaremos um link seguro de redefinição válido por 30 minutos.';
  const state = store.getState();
  const user = state.users.find((u) => u.email.toLowerCase() === normalizedEmail && u.status === 'Ativo');
  if (!user) {
    return {
      accepted: true,
      message: genericMessage,
      deliveryMode: 'noop_unknown_email',
    };
  }

  const now = new Date();
  const nowIso = now.toISOString();

  // Invalidate previous unused tokens for this user
  for (const t of state.passwordResetTokens) {
    if (t.userId === user.id && !t.usedAt) {
      t.usedAt = nowIso;
    }
  }

  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(now.getTime() + RESET_TOKEN_TTL_MS).toISOString();

  state.passwordResetTokens.unshift({
    id: `prt-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
    userId: user.id,
    tokenHash,
    expiresAt,
    usedAt: null,
    requestedIp: params.ip || null,
    createdAt: nowIso,
  });

  if (state.passwordResetTokens.length > 200) {
    state.passwordResetTokens.length = 200;
  }

  const baseUrl = (params.appBaseUrl || process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
  const resetLink = `${baseUrl}/?resetToken=${encodeURIComponent(rawToken)}`;

  let deliveryMode: PasswordResetRequestResult['deliveryMode'] = 'pending_email_provider';

  // Real outbound email dispatch via Resend API when configured
  const resendKey = process.env.RESEND_API_KEY?.trim();
  const fromEmail = process.env.MAIL_FROM?.trim() || 'NER Agency OS <no-reply@neragency.com>';
  if (resendKey) {
    try {
      const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [user.email],
          subject: 'Redefinição de senha — NER Agency OS',
          html: `<p>Olá ${user.name},</p><p>Recebemos uma solicitação de redefinição de senha. Clique no link abaixo (válido por 30 minutos):</p><p><a href="${resetLink}">${resetLink}</a></p><p>Se você não solicitou, ignore esta mensagem.</p>`,
        }),
      });
      if (resp.ok) {
        deliveryMode = 'email_provider_sent';
      }
    } catch {
      deliveryMode = 'pending_email_provider';
    }
  }

  store.audit(user.organizationId, user.id, 'AUTH_PASSWORD_RESET_REQUESTED', 'User', user.id, {
    deliveryMode,
    expiresAt,
  });

  return {
    accepted: true,
    message: genericMessage,
    deliveryMode,
    // Token is NEVER returned in production; only returned in explicit test mode for E2E verification
    testOnlyToken: process.env.NODE_ENV === 'test' ? rawToken : undefined,
  };
}

export function confirmPasswordReset(
  store: PersistentStore,
  params: {
    token: string;
    newPassword: string;
  }
): { ok: true; userId: string; revokedSessions: number } | { ok: false; status: number; error: string } {
  const token = String(params.token || '').trim();
  const newPassword = String(params.newPassword || '');

  if (!token || token.length < 32) {
    return { ok: false, status: 400, error: 'Token de redefinição inválido ou ausente.' };
  }
  if (newPassword.length < 8 || !/[a-zA-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
    return {
      ok: false,
      status: 400,
      error: 'A nova senha deve ter no mínimo 8 caracteres contendo letras e números.',
    };
  }

  const state = store.getState();
  const tokenHash = hashToken(token);
  const record = state.passwordResetTokens.find((t) => t.tokenHash === tokenHash);

  if (!record) {
    return { ok: false, status: 400, error: 'Token de redefinição inválido ou não encontrado.' };
  }
  if (record.usedAt) {
    return { ok: false, status: 400, error: 'Este token de redefinição já foi utilizado.' };
  }
  if (new Date(record.expiresAt).getTime() <= Date.now()) {
    return { ok: false, status: 400, error: 'Token de redefinição expirado. Solicite um novo link.' };
  }

  const user = state.users.find((u) => u.id === record.userId);
  if (!user || user.status !== 'Ativo') {
    return { ok: false, status: 403, error: 'Conta indisponível para redefinição de senha.' };
  }

  const nowIso = new Date().toISOString();
  let revokedSessions = 0;

  store.runTransaction((txState) => {
    const txUser = txState.users.find((u) => u.id === user.id)!;
    const txToken = txState.passwordResetTokens.find((t) => t.id === record.id)!;
    txUser.passwordHash = hashPassword(newPassword);
    txToken.usedAt = nowIso;

    // Revoke ALL active sessions for this user on password reset
    for (const ses of txState.sessions) {
      if (ses.userId === user.id && !ses.revokedAt) {
        ses.revokedAt = nowIso;
        revokedSessions += 1;
      }
    }
  });

  store.audit(user.organizationId, user.id, 'AUTH_PASSWORD_RESET_COMPLETED', 'User', user.id, {
    revokedSessions,
  });

  return { ok: true, userId: user.id, revokedSessions };
}
