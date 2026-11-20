import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { PersistentStore, hashPassword, hashToken, verifyPassword } from '../store.ts';
import { ROLE_PERMISSIONS, RoleName, User } from '../types.ts';

export interface AuthContext {
  user: Omit<User, 'passwordHash'>;
  organizationId: string;
  clientId: string | null;
  permissions: string[];
  sessionId: string;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
      rawBody?: Buffer;
    }
  }
}

export const SESSION_COOKIE_NAME = 'ner_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

// Sliding-window failed login limiter
const failedLoginAttempts = new Map<string, { count: number; resetAt: number }>();

export function resetLoginRateLimiter(): void {
  failedLoginAttempts.clear();
}

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const entry = failedLoginAttempts.get(key);
  if (!entry || entry.resetAt <= now) {
    return true;
  }
  return entry.count < 8;
}

function recordFailedLogin(key: string): void {
  const now = Date.now();
  const entry = failedLoginAttempts.get(key);
  if (!entry || entry.resetAt <= now) {
    failedLoginAttempts.set(key, { count: 1, resetAt: now + 10 * 60 * 1000 });
  } else {
    entry.count += 1;
  }
}

export function clearFailedLogin(key: string): void {
  failedLoginAttempts.delete(key);
}

export function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (!cookieHeader) return result;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) {
      try {
        result[k] = decodeURIComponent(v);
      } catch {
        result[k] = v;
      }
    }
  }
  return result;
}

export function extractSessionToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token) return token;
  }
  const cookies = parseCookies(req.headers.cookie);
  if (cookies[SESSION_COOKIE_NAME]) {
    return cookies[SESSION_COOKIE_NAME];
  }
  return null;
}

export function sanitizeUser(user: User): Omit<User, 'passwordHash'> {
  const { passwordHash: _removed, ...safe } = user;
  return safe;
}

export function hasPermission(permissions: string[], required: string): boolean {
  if (permissions.includes('*')) return true;
  return permissions.includes(required);
}

export function createAuthMiddleware(store: PersistentStore) {
  return function attachAuth(req: Request, _res: Response, next: NextFunction): void {
    const token = extractSessionToken(req);
    if (!token) {
      next();
      return;
    }

    const tokenHash = hashToken(token);
    const state = store.getState();
    const session = state.sessions.find((s) => s.tokenHash === tokenHash);
    if (!session || session.revokedAt) {
      next();
      return;
    }
    if (new Date(session.expiresAt).getTime() <= Date.now()) {
      next();
      return;
    }

    const user = state.users.find((u) => u.id === session.userId);
    if (!user || user.status !== 'Ativo') {
      next();
      return;
    }

    const permissions = ROLE_PERMISSIONS[user.role as RoleName] || [];
    req.auth = {
      user: sanitizeUser(user),
      organizationId: user.organizationId,
      clientId: user.clientId ?? null,
      permissions,
      sessionId: session.id,
    };
    next();
  };
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.auth) {
    res.status(401).json({ error: 'Autenticação obrigatória.' });
    return;
  }
  next();
}

export function requirePermission(permission: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.auth) {
      res.status(401).json({ error: 'Autenticação obrigatória.' });
      return;
    }
    if (!hasPermission(req.auth.permissions, permission)) {
      res.status(403).json({ error: `Acesso negado. Permissão requerida: ${permission}` });
      return;
    }
    next();
  };
}

/**
 * Resolves the active organizationId for the current request.
 * - Super Admin may query/target another organization via `requestedOrgId`.
 * - Non-Super Admin users are strictly locked to their own `req.auth.organizationId`.
 *   If they explicitly request a different `organizationId`, returns `null` so the route responds 403.
 */
export function resolveScopedOrg(
  req: Request,
  requestedOrgId?: string | null
): { allowed: boolean; organizationId: string } {
  if (!req.auth) {
    return { allowed: false, organizationId: '' };
  }
  const userOrg = req.auth.organizationId;
  const isSuperAdmin = req.auth.user.role === 'Super Admin';
  const cleanRequested = requestedOrgId && requestedOrgId.trim() ? requestedOrgId.trim() : null;

  if (!cleanRequested) {
    return { allowed: true, organizationId: userOrg };
  }
  if (cleanRequested === userOrg) {
    return { allowed: true, organizationId: userOrg };
  }
  if (isSuperAdmin) {
    return { allowed: true, organizationId: cleanRequested };
  }
  return { allowed: false, organizationId: userOrg };
}

export function canAccessResourceOrg(req: Request, resourceOrgId: string): boolean {
  if (!req.auth) return false;
  if (req.auth.user.role === 'Super Admin') return true;
  return req.auth.organizationId === resourceOrgId;
}

export function canAccessClientResource(req: Request, resourceOrgId: string, resourceClientId?: string | null): boolean {
  if (!canAccessResourceOrg(req, resourceOrgId)) return false;
  if (!req.auth) return false;
  if (req.auth.user.role === 'Cliente') {
    return Boolean(req.auth.clientId && resourceClientId && req.auth.clientId === resourceClientId);
  }
  return true;
}

export function issueSession(store: PersistentStore, user: User): { token: string; expiresAt: string } {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS).toISOString();
  const state = store.getState();

  state.sessions.push({
    id: `ses-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
    userId: user.id,
    organizationId: user.organizationId,
    tokenHash,
    expiresAt,
    revokedAt: null,
    createdAt: now.toISOString(),
  });

  // Prune old expired/revoked sessions to keep store clean
  if (state.sessions.length > 200) {
    state.sessions = state.sessions.slice(-150);
  }
  store.save();
  return { token, expiresAt };
}

export function handleLogin(store: PersistentStore, req: Request, res: Response): void {
  const { email, password } = req.body || {};
  if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) {
    res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();
  const rateKey = `${req.ip || 'local'}:${normalizedEmail}`;
  if (!checkRateLimit(rateKey)) {
    res.status(429).json({ error: 'Muitas tentativas de login. Aguarde alguns minutos.' });
    return;
  }

  const state = store.getState();
  const user = state.users.find((u) => u.email.toLowerCase() === normalizedEmail);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    recordFailedLogin(rateKey);
    res.status(401).json({ error: 'Credenciais inválidas.' });
    return;
  }

  if (user.status !== 'Ativo') {
    res.status(403).json({ error: 'Usuário inativo. Contate o administrador.' });
    return;
  }

  const org = state.organizations.find((o) => o.id === user.organizationId);
  if (org && org.status === 'Suspenso' && user.role !== 'Super Admin') {
    res.status(403).json({ error: 'Organização suspensa. Contate o suporte.' });
    return;
  }

  clearFailedLogin(rateKey);
  const { token, expiresAt } = issueSession(store, user);
  store.audit(user.organizationId, user.id, 'AUTH_LOGIN_SUCCESS', 'Session', user.id, {
    role: user.role,
  });

  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_TTL_MS,
  });

  res.json({
    success: true,
    token,
    expiresAt,
    user: sanitizeUser(user),
    permissions: ROLE_PERMISSIONS[user.role as RoleName] || [],
  });
}

export function handleLogout(store: PersistentStore, req: Request, res: Response): void {
  const token = extractSessionToken(req);
  if (token) {
    const tokenHash = hashToken(token);
    const session = store.getState().sessions.find((s) => s.tokenHash === tokenHash);
    if (session && !session.revokedAt) {
      session.revokedAt = new Date().toISOString();
      store.audit(session.organizationId, session.userId, 'AUTH_LOGOUT', 'Session', session.id, {});
    }
  }
  res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
  res.json({ success: true });
}

export interface GoogleIdentityProfile {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
  picture?: string | null;
}

export type GoogleTokenVerifier = (params: {
  idToken?: string;
  accessToken?: string;
  expectedClientId: string;
}) => Promise<GoogleIdentityProfile>;

const SAFE_AUTO_PROVISION_ROLES = new Set<RoleName>([
  'Criativo',
  'Comercial',
  'Gestor de Tráfego',
  'Financeiro',
]);

export function getGoogleAuthConfig(): {
  enabled: boolean;
  clientId: string | null;
  allowAutoProvision: boolean;
  defaultRole: RoleName;
} {
  const clientId = (process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || '').trim() || null;
  const allowAutoProvision = String(process.env.GOOGLE_AUTH_ALLOW_AUTO_PROVISION || 'false').toLowerCase() === 'true';
  const rawDefaultRole = (process.env.GOOGLE_AUTH_DEFAULT_ROLE || 'Criativo').trim() as RoleName;
  const defaultRole: RoleName = SAFE_AUTO_PROVISION_ROLES.has(rawDefaultRole) ? rawDefaultRole : 'Criativo';
  return {
    enabled: Boolean(clientId),
    clientId,
    allowAutoProvision,
    defaultRole,
  };
}

export async function verifyGoogleTokenDefault(params: {
  idToken?: string;
  accessToken?: string;
  expectedClientId: string;
}): Promise<GoogleIdentityProfile> {
  const { idToken, accessToken, expectedClientId } = params;

  if (idToken) {
    const res = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`
    );
    if (!res.ok) {
      throw new Error('Token Google (ID Token) inválido ou expirado.');
    }
    const payload: any = await res.json();
    const validIss =
      payload.iss === 'https://accounts.google.com' || payload.iss === 'accounts.google.com';
    if (!validIss || payload.aud !== expectedClientId) {
      throw new Error('Token Google com audiência ou emissor inválido.');
    }
    const expSec = Number(payload.exp || 0);
    if (expSec > 0 && expSec * 1000 <= Date.now()) {
      throw new Error('Token Google expirado.');
    }
    const emailVerified = payload.email_verified === true || payload.email_verified === 'true';
    if (!payload.sub || !payload.email || !emailVerified) {
      throw new Error('Conta Google sem e-mail verificado.');
    }
    return {
      sub: String(payload.sub),
      email: String(payload.email).trim().toLowerCase(),
      emailVerified: true,
      name: String(payload.name || payload.email.split('@')[0]),
      picture: payload.picture ? String(payload.picture) : null,
    };
  }

  if (accessToken) {
    // 1. Validate token audience & expiry against Google tokeninfo
    const infoRes = await fetch(
      `https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${encodeURIComponent(accessToken)}`
    );
    if (!infoRes.ok) {
      throw new Error('Token de acesso Google inválido ou expirado.');
    }
    const tokenInfo: any = await infoRes.json();
    if (tokenInfo.aud !== expectedClientId) {
      throw new Error('Token de acesso Google não corresponde ao Client ID configurado.');
    }
    if (Number(tokenInfo.expires_in || 0) <= 0) {
      throw new Error('Token de acesso Google expirado.');
    }

    // 2. Fetch verified user identity profile from Google userinfo
    const profileRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!profileRes.ok) {
      throw new Error('Não foi possível obter o perfil autenticado do Google.');
    }
    const profile: any = await profileRes.json();
    const emailVerified = profile.email_verified === true || profile.email_verified === 'true';
    if (!profile.sub || !profile.email || !emailVerified) {
      throw new Error('Conta Google sem e-mail verificado.');
    }
    return {
      sub: String(profile.sub),
      email: String(profile.email).trim().toLowerCase(),
      emailVerified: true,
      name: String(profile.name || profile.email.split('@')[0]),
      picture: profile.picture ? String(profile.picture) : null,
    };
  }

  throw new Error('Credencial Google ausente.');
}

export async function handleGoogleLogin(
  store: PersistentStore,
  req: Request,
  res: Response,
  verifier: GoogleTokenVerifier = verifyGoogleTokenDefault
): Promise<void> {
  const cfg = getGoogleAuthConfig();
  if (!cfg.enabled || !cfg.clientId) {
    res.status(503).json({
      error: 'Login com Google não configurado no servidor. Defina GOOGLE_CLIENT_ID nas variáveis de ambiente.',
    });
    return;
  }

  const authHeader = req.headers.authorization;
  const bearerAccessToken =
    authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : undefined;
  const bodyCredential = typeof req.body?.credential === 'string' ? req.body.credential.trim() : undefined;
  const bodyAccessToken = typeof req.body?.accessToken === 'string' ? req.body.accessToken.trim() : undefined;

  const idToken = bodyCredential || undefined;
  const accessToken = bearerAccessToken || bodyAccessToken || undefined;

  if (!idToken && !accessToken) {
    res.status(400).json({ error: 'Token Google obrigatório (credential ou Bearer accessToken).' });
    return;
  }

  const rateKey = `${req.ip || 'local'}:google_oauth`;
  if (!checkRateLimit(rateKey)) {
    res.status(429).json({ error: 'Muitas tentativas de login com Google. Aguarde alguns minutos.' });
    return;
  }

  let profile: GoogleIdentityProfile;
  try {
    profile = await verifier({
      idToken,
      accessToken,
      expectedClientId: cfg.clientId,
    });
  } catch (err: any) {
    recordFailedLogin(rateKey);
    res.status(401).json({ error: err?.message || 'Falha ao validar credenciais do Google.' });
    return;
  }

  if (!profile.emailVerified || !profile.email || !profile.sub) {
    recordFailedLogin(rateKey);
    res.status(401).json({ error: 'Conta Google sem e-mail verificado.' });
    return;
  }

  const normalizedEmail = profile.email.trim().toLowerCase();
  const state = store.getState();

  let user = state.users.find(
    (u) =>
      (u.googleSub && u.googleSub === profile.sub) ||
      u.email.toLowerCase() === normalizedEmail
  );

  let autoProvisioned = false;
  if (!user) {
    if (!cfg.allowAutoProvision) {
      res.status(403).json({
        error: `Conta Google (${normalizedEmail}) verificada, mas ainda não cadastrada no NER AGENCY OS. Solicite o cadastro ao administrador em NER Core → Usuários.`,
      });
      return;
    }

    const defaultOrg =
      state.organizations.find((o) => o.status === 'Ativo') || state.organizations[0];
    if (!defaultOrg) {
      res.status(500).json({ error: 'Nenhuma organização ativa disponível para provisionamento.' });
      return;
    }

    const nowIso = new Date().toISOString();
    user = {
      id: `usr-g-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
      organizationId: defaultOrg.id,
      clientId: null,
      name: profile.name || normalizedEmail.split('@')[0],
      email: normalizedEmail,
      passwordHash: hashPassword(crypto.randomBytes(24).toString('hex')),
      role: cfg.defaultRole,
      status: 'Ativo',
      emailVerifiedAt: nowIso,
      googleSub: profile.sub,
      avatarUrl: profile.picture || null,
      authProvider: 'google',
      createdAt: nowIso,
    };
    state.users.push(user);
    autoProvisioned = true;
    store.audit(user.organizationId, user.id, 'AUTH_GOOGLE_USER_PROVISIONED', 'User', user.id, {
      email: user.email,
      role: user.role,
    });
  } else {
    if (user.status !== 'Ativo') {
      res.status(403).json({ error: 'Usuário inativo. Contate o administrador.' });
      return;
    }
    const org = state.organizations.find((o) => o.id === user!.organizationId);
    if (org && org.status === 'Suspenso' && user.role !== 'Super Admin') {
      res.status(403).json({ error: 'Organização suspensa. Contate o suporte.' });
      return;
    }
    if (!user.googleSub) user.googleSub = profile.sub;
    if (!user.emailVerifiedAt) user.emailVerifiedAt = new Date().toISOString();
    if (profile.picture && !user.avatarUrl) user.avatarUrl = profile.picture;
  }

  clearFailedLogin(rateKey);
  const { token, expiresAt } = issueSession(store, user);
  store.audit(user.organizationId, user.id, 'AUTH_GOOGLE_LOGIN_SUCCESS', 'Session', user.id, {
    role: user.role,
    autoProvisioned,
  });

  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_TTL_MS,
  });

  res.json({
    success: true,
    token,
    expiresAt,
    provider: 'google',
    autoProvisioned,
    user: sanitizeUser(user),
    permissions: ROLE_PERMISSIONS[user.role as RoleName] || [],
  });
}
