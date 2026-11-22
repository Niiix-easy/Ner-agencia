import React, { useEffect, useState } from 'react';
import { Lock, Mail, ArrowRight, ShieldCheck, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { apiFetch } from '../lib/api';

interface GoogleTokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
}

interface GoogleTokenClient {
  requestAccessToken: (overrideConfig?: { prompt?: string }) => void;
}

interface GoogleAccountsOAuth2 {
  initTokenClient: (config: {
    client_id: string;
    scope: string;
    callback: (response: GoogleTokenResponse) => void;
    error_callback?: (error: { type?: string; message?: string }) => void;
  }) => GoogleTokenClient;
}

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: GoogleAccountsOAuth2;
      };
    };
  }
}

interface AuthProvidersResponse {
  local: boolean;
  google: {
    enabled: boolean;
    clientId: string | null;
    allowAutoProvision: boolean;
  };
}

interface LoginScreenProps {
  onLoginSuccess: (payload: { user: any; permissions: string[]; token: string }) => void;
}

const GIS_SCRIPT_ID = 'google-identity-services-sdk';
const GIS_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

let gisLoadPromise: Promise<void> | null = null;

function loadGoogleIdentityScript(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Ambiente sem navegador.'));
  }
  if (window.google?.accounts?.oauth2) {
    return Promise.resolve();
  }
  if (gisLoadPromise) {
    return gisLoadPromise;
  }

  gisLoadPromise = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(GIS_SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      if (window.google?.accounts?.oauth2) {
        resolve();
        return;
      }
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener(
        'error',
        () => {
          gisLoadPromise = null;
          reject(new Error('Não foi possível carregar o Google Identity Services.'));
        },
        { once: true }
      );
      return;
    }

    const script = document.createElement('script');
    script.id = GIS_SCRIPT_ID;
    script.src = GIS_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (window.google?.accounts?.oauth2) {
        resolve();
      } else {
        gisLoadPromise = null;
        reject(new Error('SDK Google Identity carregado sem suporte a OAuth2.'));
      }
    };
    script.onerror = () => {
      gisLoadPromise = null;
      reject(new Error('Falha ao carregar o SDK do Google. Verifique sua conexão ou bloqueador de scripts.'));
    };
    document.head.appendChild(script);
  });

  return gisLoadPromise;
}

function GoogleLogoIcon() {
  return (
    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.3h6.44a5.5 5.5 0 0 1-2.39 3.61v3h3.87c2.26-2.08 3.57-5.15 3.57-8.64z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.07 7.93-2.91l-3.87-3c-1.07.72-2.44 1.15-4.06 1.15-3.12 0-5.77-2.11-6.72-4.95H1.28v3.1A11.99 11.99 0 0 0 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.29A7.2 7.2 0 0 1 4.9 12c0-.79.14-1.56.38-2.29V6.61H1.28A12 12 0 0 0 0 12c0 1.94.46 3.77 1.28 5.39l4-3.1z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.76 0 3.34.61 4.59 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0A11.99 11.99 0 0 0 1.28 6.61l4 3.1C6.23 6.86 8.88 4.75 12 4.75z"
      />
    </svg>
  );
}

const DEMO_PROFILES = [
  { label: 'Super Admin (Matriz)', email: 'maycon@neragency.com', role: 'Super Admin' },
  { label: 'Gestor de Tráfego', email: 'carlos@neragency.com', role: 'Gestor de Tráfego' },
  { label: 'Comercial', email: 'ana@neragency.com', role: 'Comercial' },
  { label: 'Admin Filial SP', email: 'marcos@nersp.com', role: 'Administrador' },
  { label: 'Cliente TechFlow', email: 'lucas@techflow.io', role: 'Cliente' },
];

export function LoginScreen({ onLoginSuccess }: LoginScreenProps) {
  const initialToken =
    typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('resetToken') || '' : '';
  const [mode, setMode] = useState<'login' | 'forgot' | 'reset'>(initialToken ? 'reset' : 'login');
  const [email, setEmail] = useState('maycon@neragency.com');
  const [password, setPassword] = useState('NerAgency@2026');
  const [resetToken, setResetToken] = useState(initialToken);
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forgotMessage, setForgotMessage] = useState<string | null>(null);
  const [providersLoaded, setProvidersLoaded] = useState(false);
  const [googleConfig, setGoogleConfig] = useState<{
    enabled: boolean;
    clientId: string | null;
    allowAutoProvision: boolean;
  }>({
    enabled: false,
    clientId: null,
    allowAutoProvision: false,
  });

  useEffect(() => {
    let active = true;
    apiFetch<AuthProvidersResponse>('/api/auth/providers')
      .then((res) => {
        if (!active) return;
        const cfg = res?.google || { enabled: false, clientId: null, allowAutoProvision: false };
        setGoogleConfig(cfg);
        setProvidersLoaded(true);
        if (cfg.enabled && cfg.clientId) {
          loadGoogleIdentityScript().catch(() => {
            // Will surface cleanly if user clicks Google login
          });
        }
      })
      .catch(() => {
        if (active) setProvidersLoaded(true);
      });

    return () => {
      active = false;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setForgotMessage(null);
    setLoading(true);
    try {
      if (mode === 'forgot') {
        const res = await apiFetch<{ message: string; emailDelivery?: string }>('/api/auth/forgot-password', {
          method: 'POST',
          body: JSON.stringify({ email }),
        });
        setForgotMessage(res.message);
      } else if (mode === 'reset') {
        const res = await apiFetch<{ message: string }>('/api/auth/reset-password', {
          method: 'POST',
          body: JSON.stringify({ token: resetToken.trim(), newPassword }),
        });
        setForgotMessage(res.message || 'Senha redefinida com sucesso! Faça login com a nova senha.');
        setNewPassword('');
        setResetToken('');
        setMode('login');
      } else {
        const res = await apiFetch<{ user: any; permissions: string[]; token: string }>('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email, password }),
        });
        sessionStorage.setItem('ner_token', res.token);
        onLoginSuccess(res);
      }
    } catch (err: any) {
      setError(err.message || 'Falha ao autenticar.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError(null);
    setForgotMessage(null);

    if (!googleConfig.enabled || !googleConfig.clientId) {
      setError(
        'Login com Google aguardando configuração do servidor. Defina GOOGLE_CLIENT_ID nas variáveis de ambiente e autorize esta origem no Google Cloud Console.'
      );
      return;
    }

    setGoogleLoading(true);
    try {
      await loadGoogleIdentityScript();
      const oauth2 = window.google?.accounts?.oauth2;
      if (!oauth2) {
        throw new Error('Serviço Google Identity indisponível no navegador.');
      }

      const tokenClient = oauth2.initTokenClient({
        client_id: googleConfig.clientId,
        scope: 'openid email profile',
        callback: async (tokenResponse: GoogleTokenResponse) => {
          if (tokenResponse.error || !tokenResponse.access_token) {
            setError(
              tokenResponse.error === 'access_denied'
                ? 'Acesso com Google cancelado pelo usuário.'
                : tokenResponse.error_description || 'Falha na autenticação com o Google.'
            );
            setGoogleLoading(false);
            return;
          }

          try {
            // Pass Google access token purely in-memory via Authorization Bearer header (never persisted)
            const response = await fetch('/api/auth/google', {
              method: 'POST',
              credentials: 'include',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${tokenResponse.access_token}`,
              },
              body: JSON.stringify({}),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
              throw new Error(data.error || `Erro HTTP ${response.status} ao validar conta Google.`);
            }
            sessionStorage.setItem('ner_token', data.token);
            onLoginSuccess(data);
          } catch (err: any) {
            setError(err?.message || 'Não foi possível concluir o login com Google.');
          } finally {
            setGoogleLoading(false);
          }
        },
        error_callback: (err) => {
          if (err?.type === 'popup_failed_to_open') {
            setError('O popup do Google foi bloqueado pelo navegador. Permita popups para continuar.');
          } else if (err?.type !== 'popup_closed') {
            setError(err?.message || 'Não foi possível abrir o login com Google.');
          }
          setGoogleLoading(false);
        },
      });

      tokenClient.requestAccessToken({ prompt: 'select_account' });
    } catch (err: any) {
      setError(err?.message || 'Erro ao iniciar autenticação com Google.');
      setGoogleLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl space-y-6">
        <div className="flex items-center space-x-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-cyan-600 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-900/40">
            <span className="font-black text-white text-lg tracking-wider">NER</span>
          </div>
          <div>
            <h1 className="font-bold text-lg text-white tracking-tight">NER AGENCY OS</h1>
            <p className="text-xs text-slate-400">Acesso Autenticado & Multi-Tenant RBAC</p>
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {forgotMessage && (
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{forgotMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode !== 'reset' && (
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">E-mail Corporativo</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
                  placeholder="nome@neragency.com"
                />
              </div>
            </div>
          )}

          {mode === 'login' && (
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Senha</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
                  placeholder="••••••••"
                />
              </div>
            </div>
          )}

          {mode === 'reset' && (
            <>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Token de Redefinição (uso único)</label>
                <input
                  type="text"
                  required
                  value={resetToken}
                  onChange={(e) => setResetToken(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-cyan-500"
                  placeholder="Cole o token recebido por e-mail"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Nova Senha (mín. 8 caracteres, letras + números)</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
                    placeholder="Nova senha forte"
                  />
                </div>
              </div>
            </>
          )}

          <button
            type="submit"
            disabled={loading || googleLoading}
            className="w-full py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-all"
          >
            {loading
              ? 'Validando...'
              : mode === 'login'
                ? 'Entrar na Plataforma'
                : mode === 'forgot'
                  ? 'Solicitar Token de Redefinição'
                  : 'Confirmar Nova Senha'}
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        {mode === 'login' && (
          <div className="space-y-2.5">
            <div className="relative flex items-center justify-center">
              <div className="w-full border-t border-slate-800" />
              <span className="bg-slate-900 px-3 text-[11px] uppercase tracking-wider text-slate-500 shrink-0">
                ou continue com
              </span>
              <div className="w-full border-t border-slate-800" />
            </div>

            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={loading || googleLoading || !providersLoaded}
              className="w-full py-2.5 px-4 rounded-xl bg-white hover:bg-slate-100 disabled:opacity-60 text-slate-900 border border-slate-200 text-sm font-semibold flex items-center justify-center gap-2.5 transition-all shadow-sm"
            >
              {googleLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-slate-700" />
                  <span>Conectando ao Google...</span>
                </>
              ) : (
                <>
                  <GoogleLogoIcon />
                  <span>Entrar com o Google</span>
                </>
              )}
            </button>

            {providersLoaded && !googleConfig.enabled && (
              <p className="text-[11px] text-slate-500 text-center">
                Requer <span className="font-mono text-slate-400">GOOGLE_CLIENT_ID</span> configurado no servidor.
              </p>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs pt-1">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setMode(mode === 'login' ? 'forgot' : 'login');
                setError(null);
                setForgotMessage(null);
              }}
              className="text-cyan-400 hover:text-cyan-300"
            >
              {mode === 'login' ? 'Esqueci minha senha' : 'Voltar para o login'}
            </button>
            {mode !== 'reset' && (
              <button
                type="button"
                onClick={() => {
                  setMode('reset');
                  setError(null);
                  setForgotMessage(null);
                }}
                className="text-slate-400 hover:text-cyan-300"
              >
                Já tenho token
              </button>
            )}
          </div>
          <span className="text-slate-500 flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" /> Sessão HttpOnly
          </span>
        </div>

        <div className="pt-4 border-t border-slate-800 space-y-2">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            Perfis de Teste (Ambiente Dev / Demo)
          </div>
          <div className="grid grid-cols-1 gap-1.5">
            {DEMO_PROFILES.map((p) => (
              <button
                key={p.email}
                type="button"
                onClick={() => {
                  setMode('login');
                  setEmail(p.email);
                  setPassword('NerAgency@2026');
                  setError(null);
                }}
                className="text-left px-3 py-2 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-xs flex items-center justify-between transition-all"
              >
                <span className="text-slate-200 font-medium">{p.label}</span>
                <span className="text-[10px] font-mono text-cyan-400">{p.email}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
