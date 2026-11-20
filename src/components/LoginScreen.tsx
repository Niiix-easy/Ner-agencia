import React, { useState } from 'react';
import { Lock, Mail, ArrowRight, ShieldCheck, AlertCircle, CheckCircle2 } from 'lucide-react';
import { apiFetch } from '../lib/api';

interface LoginScreenProps {
  onLoginSuccess: (payload: { user: any; permissions: string[]; token: string }) => void;
}

const DEMO_PROFILES = [
  { label: 'Super Admin (Matriz)', email: 'maycon@neragency.com', role: 'Super Admin' },
  { label: 'Gestor de Tráfego', email: 'carlos@neragency.com', role: 'Gestor de Tráfego' },
  { label: 'Comercial', email: 'ana@neragency.com', role: 'Comercial' },
  { label: 'Admin Filial SP', email: 'marcos@nersp.com', role: 'Administrador' },
  { label: 'Cliente TechFlow', email: 'lucas@techflow.io', role: 'Cliente' },
];

export function LoginScreen({ onLoginSuccess }: LoginScreenProps) {
  const [mode, setMode] = useState<'login' | 'forgot'>('login');
  const [email, setEmail] = useState('maycon@neragency.com');
  const [password, setPassword] = useState('NerAgency@2026');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forgotMessage, setForgotMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setForgotMessage(null);
    setLoading(true);
    try {
      if (mode === 'forgot') {
        const res = await apiFetch<{ message: string }>('/api/auth/forgot-password', {
          method: 'POST',
          body: JSON.stringify({ email }),
        });
        setForgotMessage(res.message);
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
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
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

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-all"
          >
            {loading ? 'Validando...' : mode === 'login' ? 'Entrar na Plataforma' : 'Solicitar Redefinição'}
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        <div className="flex items-center justify-between text-xs pt-1">
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
