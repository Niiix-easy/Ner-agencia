import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  KeyRound,
  Lock,
  RefreshCw,
  Save,
  ShieldCheck,
  Trash2,
  Wifi,
  XCircle,
} from 'lucide-react';
import { apiFetch } from '../lib/api';

type AdProviderId = 'meta_ads' | 'google_ads' | 'tiktok_ads';

interface PublicFieldState {
  key: string;
  label: string;
  placeholder: string;
  envVar: string;
  required: boolean;
  helperText?: string;
  value: string;
  source: 'encrypted_db' | 'env' | 'none';
}

interface SecretFieldState {
  key: string;
  label: string;
  placeholder: string;
  envVar: string;
  required: boolean;
  helperText?: string;
  configured: boolean;
  source: 'encrypted_db' | 'env' | 'none';
  mask: string | null;
}

interface ProviderCredentialDTO {
  provider: AdProviderId;
  displayName: string;
  platformLabel: string;
  description: string;
  organizationId: string;
  enabled: boolean;
  configured: boolean;
  credentialSource: 'encrypted_db' | 'env' | 'mixed' | 'none';
  status: 'CONFIGURADO' | 'PENDENTE' | 'ERRO';
  publicFields: PublicFieldState[];
  secretFields: SecretFieldState[];
  hasStoredRecord: boolean;
  lastTestedAt: string | null;
  lastTestStatus: 'ok' | 'error' | 'config_only' | null;
  lastTestMessage: string | null;
  updatedAt: string | null;
}

interface VaultResponse {
  encryptionKeyConfigured: boolean;
  organizationId: string;
  providers: ProviderCredentialDTO[];
}

interface Props {
  activeOrgId: string;
  onRefresh?: () => void;
  onNotify: (msg: string, isError?: boolean) => void;
}

const SOURCE_LABELS: Record<ProviderCredentialDTO['credentialSource'], string> = {
  encrypted_db: 'Cofre Criptografado',
  env: 'Variável de Ambiente',
  mixed: 'Cofre + Env',
  none: 'Não Configurado',
};

export function AdIntegrationsVaultPanel({ activeOrgId, onRefresh, onNotify }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [encryptionKeyConfigured, setEncryptionKeyConfigured] = useState(false);
  const [providers, setProviders] = useState<ProviderCredentialDTO[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<AdProviderId>('meta_ads');

  // Form state for active provider (secret inputs are strictly write-only and cleared after save)
  const [enabledDraft, setEnabledDraft] = useState(true);
  const [publicDrafts, setPublicDrafts] = useState<Record<string, string>>({});
  const [secretDrafts, setSecretDrafts] = useState<Record<string, string>>({});
  const [clearSecretKeys, setClearSecretKeys] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [testingMode, setTestingMode] = useState<'none' | 'config' | 'live'>('none');
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  const hydrateDrafts = useCallback((prov: ProviderCredentialDTO | undefined) => {
    if (!prov) return;
    setEnabledDraft(prov.enabled);
    const pub: Record<string, string> = {};
    for (const f of prov.publicFields) {
      pub[f.key] = f.source === 'encrypted_db' ? f.value : '';
    }
    setPublicDrafts(pub);
    setSecretDrafts({});
    setClearSecretKeys([]);
    setConfirmRevoke(false);
  }, []);

  const loadVault = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q = activeOrgId ? `?organizationId=${encodeURIComponent(activeOrgId)}` : '';
      const data = await apiFetch<VaultResponse>(`/api/integrations/ad-credentials${q}`);
      setEncryptionKeyConfigured(Boolean(data.encryptionKeyConfigured));
      setProviders(data.providers || []);
      const active =
        (data.providers || []).find((p) => p.provider === selectedProvider) || data.providers?.[0];
      hydrateDrafts(active);
    } catch (err: any) {
      setError(err?.message || 'Não foi possível carregar o cofre de integrações de anúncios.');
    } finally {
      setLoading(false);
    }
  }, [activeOrgId, selectedProvider, hydrateDrafts]);

  useEffect(() => {
    loadVault();
  }, [activeOrgId]);

  const currentProvider = providers.find((p) => p.provider === selectedProvider) || providers[0];

  const handleSelectProvider = (providerId: AdProviderId) => {
    setSelectedProvider(providerId);
    const target = providers.find((p) => p.provider === providerId);
    hydrateDrafts(target);
  };

  const handleToggleClearSecret = (key: string) => {
    setClearSecretKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
    setSecretDrafts((prev) => ({ ...prev, [key]: '' }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentProvider) return;
    setSaving(true);
    try {
      const secretsToSend: Record<string, string> = {};
      for (const [k, v] of Object.entries(secretDrafts)) {
        if (v && v.trim()) {
          secretsToSend[k] = v.trim();
        }
      }

      const res = await apiFetch<{ success: boolean; provider: ProviderCredentialDTO }>(
        `/api/integrations/ad-credentials/${currentProvider.provider}`,
        {
          method: 'PUT',
          body: JSON.stringify({
            organizationId: activeOrgId,
            enabled: enabledDraft,
            publicConfig: publicDrafts,
            secrets: secretsToSend,
            clearSecrets: clearSecretKeys,
          }),
        }
      );

      setProviders((prev) =>
        prev.map((p) => (p.provider === res.provider.provider ? res.provider : p))
      );
      hydrateDrafts(res.provider);
      onNotify(
        `Credenciais de ${res.provider.platformLabel} salvas com criptografia AES-256-GCM.`
      );
      onRefresh?.();
    } catch (err: any) {
      onNotify(err?.message || 'Falha ao salvar credenciais.', true);
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async (verifyLive: boolean) => {
    if (!currentProvider) return;
    setTestingMode(verifyLive ? 'live' : 'config');
    try {
      const res = await apiFetch<{
        ok: boolean;
        mode: string;
        message: string;
        sanitized: ProviderCredentialDTO;
      }>(`/api/integrations/ad-credentials/${currentProvider.provider}/test`, {
        method: 'POST',
        body: JSON.stringify({
          organizationId: activeOrgId,
          verifyLive,
        }),
      });
      setProviders((prev) =>
        prev.map((p) => (p.provider === res.sanitized.provider ? res.sanitized : p))
      );
      onNotify(res.message, !res.ok);
    } catch (err: any) {
      onNotify(err?.message || 'Erro ao validar credenciais.', true);
      await loadVault();
    } finally {
      setTestingMode('none');
    }
  };

  const handleRevokeAll = async () => {
    if (!currentProvider) return;
    setSaving(true);
    try {
      const q = activeOrgId ? `?organizationId=${encodeURIComponent(activeOrgId)}` : '';
      const res = await apiFetch<{
        success: boolean;
        deleted: boolean;
        provider: ProviderCredentialDTO;
      }>(`/api/integrations/ad-credentials/${currentProvider.provider}${q}`, {
        method: 'DELETE',
      });
      setProviders((prev) =>
        prev.map((p) => (p.provider === res.provider.provider ? res.provider : p))
      );
      hydrateDrafts(res.provider);
      onNotify(
        res.deleted
          ? `Credenciais criptografadas de ${res.provider.platformLabel} revogadas e removidas do banco.`
          : `Nenhum registro salvo encontrado para ${res.provider.platformLabel}.`
      );
      onRefresh?.();
    } catch (err: any) {
      onNotify(err?.message || 'Erro ao revogar credenciais.', true);
    } finally {
      setSaving(false);
      setConfirmRevoke(false);
    }
  };

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-bold text-white text-base flex items-center gap-2">
            <Lock className="w-4 h-4 text-cyan-400" />
            Cofre Centralizado de Credenciais Ads (Meta Ads, Google Ads & TikTok Ads)
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Tokens e segredos são criptografados no servidor via AES-256-GCM com{' '}
            <code className="text-cyan-300">NER_AI_ENCRYPTION_KEY</code>, isolados por organização e
            nunca expostos ao frontend.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`text-[11px] px-2.5 py-1 rounded-lg border font-mono flex items-center gap-1.5 ${
              encryptionKeyConfigured
                ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
            }`}
          >
            <KeyRound className="w-3.5 h-3.5" />
            {encryptionKeyConfigured
              ? 'NER_AI_ENCRYPTION_KEY: Ativa'
              : 'NER_AI_ENCRYPTION_KEY: Ausente'}
          </span>
          <button
            type="button"
            onClick={loadVault}
            disabled={loading}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
            title="Atualizar status do cofre"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {!loading && !encryptionKeyConfigured && (
        <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200 flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold text-amber-300">
              Chave mestre NER_AI_ENCRYPTION_KEY não configurada no servidor
            </div>
            <p className="text-amber-200/80 mt-0.5">
              Para gravar novos tokens criptografados no banco de dados, configure a variável de
              ambiente <code className="font-mono text-amber-100">NER_AI_ENCRYPTION_KEY</code>{' '}
              (mínimo 32 bytes / 64 caracteres hex) no servidor. Credenciais via variáveis de
              ambiente continuam operando em modo leitura.
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300 flex items-center justify-between">
          <span>{error}</span>
          <button
            type="button"
            onClick={loadVault}
            className="px-2.5 py-1 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-200"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {loading ? (
        <div className="py-8 text-center text-xs text-slate-400">
          Carregando cofre de integrações...
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {providers.map((p) => {
              const isSelected = currentProvider?.provider === p.provider;
              const configuredBadge =
                p.status === 'CONFIGURADO'
                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                  : p.status === 'ERRO'
                  ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                  : 'bg-slate-800 text-amber-300 border-slate-700';

              return (
                <button
                  key={p.provider}
                  type="button"
                  onClick={() => handleSelectProvider(p.provider)}
                  className={`text-left p-3.5 rounded-xl border transition-all space-y-1.5 ${
                    isSelected
                      ? 'bg-slate-950 border-cyan-500/60 shadow-lg'
                      : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-sm text-white">{p.platformLabel}</span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded border font-mono ${configuredBadge}`}
                    >
                      {p.status}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Origem: <span className="text-slate-200">{SOURCE_LABELS[p.credentialSource]}</span>
                  </div>
                  <div className="text-[10px] font-mono text-slate-500">
                    {p.secretFields.filter((s) => s.configured).length}/{p.secretFields.length}{' '}
                    segredos configurados
                  </div>
                </button>
              );
            })}
          </div>

          {currentProvider && (
            <form
              onSubmit={handleSave}
              className="bg-slate-950/80 border border-slate-800 rounded-xl p-5 space-y-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 pb-3">
                <div>
                  <div className="text-sm font-bold text-white">{currentProvider.displayName}</div>
                  <p className="text-xs text-slate-400 mt-0.5">{currentProvider.description}</p>
                </div>
                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enabledDraft}
                    onChange={(e) => setEnabledDraft(e.target.checked)}
                    className="rounded border-slate-700 bg-slate-900 text-cyan-500"
                  />
                  Integração habilitada
                </label>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Identificadores Públicos */}
                <div className="space-y-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Identificadores Públicos da Conta
                  </div>
                  {currentProvider.publicFields.map((field) => (
                    <div key={field.key} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <label className="text-slate-200 font-medium">
                          {field.label}
                          {field.required && <span className="text-cyan-400 ml-1">*</span>}
                        </label>
                        {field.source === 'env' && (
                          <span className="text-[10px] font-mono text-emerald-400">
                            Fallback Env ({field.envVar})
                          </span>
                        )}
                      </div>
                      <input
                        type="text"
                        value={publicDrafts[field.key] ?? ''}
                        onChange={(e) =>
                          setPublicDrafts((prev) => ({ ...prev, [field.key]: e.target.value }))
                        }
                        placeholder={
                          field.source === 'env' && field.value
                            ? `Ativo via env: ${field.value}`
                            : field.placeholder
                        }
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white font-mono placeholder:text-slate-500 focus:border-cyan-500/60 focus:outline-none"
                      />
                      {field.helperText && (
                        <div className="text-[10px] text-slate-500">{field.helperText}</div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Segredos Criptografados (Write-Only) */}
                <div className="space-y-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Tokens & Segredos Criptografados (Somente Gravação)
                  </div>
                  {currentProvider.secretFields.map((field) => {
                    const markedForClear = clearSecretKeys.includes(field.key);
                    return (
                      <div key={field.key} className="space-y-1">
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <label className="text-slate-200 font-medium">
                            {field.label}
                            {field.required && <span className="text-cyan-400 ml-1">*</span>}
                          </label>
                          <div className="flex items-center gap-2">
                            {field.configured && !markedForClear ? (
                              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                                {field.mask || '••••••••'}
                              </span>
                            ) : markedForClear ? (
                              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-500/15 text-rose-300">
                                Será removido ao salvar
                              </span>
                            ) : (
                              <span className="text-[10px] font-mono text-slate-500">
                                Não salvo
                              </span>
                            )}
                            {field.source === 'encrypted_db' && (
                              <button
                                type="button"
                                onClick={() => handleToggleClearSecret(field.key)}
                                className="text-[10px] text-rose-400 hover:text-rose-300 underline"
                              >
                                {markedForClear ? 'Desfazer' : 'Limpar'}
                              </button>
                            )}
                          </div>
                        </div>
                        <input
                          type="password"
                          autoComplete="new-password"
                          disabled={markedForClear}
                          value={secretDrafts[field.key] ?? ''}
                          onChange={(e) =>
                            setSecretDrafts((prev) => ({ ...prev, [field.key]: e.target.value }))
                          }
                          placeholder={
                            markedForClear
                              ? 'Segredo marcado para remoção'
                              : field.configured
                              ? 'Deixe em branco para manter o token criptografado atual'
                              : field.placeholder
                          }
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white font-mono placeholder:text-slate-500 focus:border-cyan-500/60 focus:outline-none disabled:opacity-50"
                        />
                        {field.helperText && (
                          <div className="text-[10px] text-slate-500">{field.helperText}</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {currentProvider.lastTestMessage && (
                <div
                  className={`p-3 rounded-lg border text-xs flex items-start gap-2 ${
                    currentProvider.lastTestStatus === 'error'
                      ? 'bg-rose-500/10 border-rose-500/30 text-rose-200'
                      : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                  }`}
                >
                  {currentProvider.lastTestStatus === 'error' ? (
                    <XCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <div>{currentProvider.lastTestMessage}</div>
                    {currentProvider.lastTestedAt && (
                      <div className="text-[10px] opacity-75 mt-0.5 font-mono">
                        Última verificação:{' '}
                        {new Date(currentProvider.lastTestedAt).toLocaleString('pt-BR')}
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-800">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5"
                  >
                    <Save className="w-3.5 h-3.5" />
                    {saving ? 'Criptografando...' : 'Salvar no Cofre'}
                  </button>
                  <button
                    type="button"
                    disabled={testingMode !== 'none'}
                    onClick={() => handleTest(false)}
                    className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 text-xs flex items-center gap-1.5"
                  >
                    <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
                    {testingMode === 'config' ? 'Validando...' : 'Validar Cofre'}
                  </button>
                  <button
                    type="button"
                    disabled={testingMode !== 'none'}
                    onClick={() => handleTest(true)}
                    className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 text-xs flex items-center gap-1.5"
                  >
                    <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                    {testingMode === 'live' ? 'Testando API...' : 'Testar Conexão API'}
                  </button>
                </div>

                {currentProvider.hasStoredRecord && (
                  <div className="flex items-center gap-2">
                    {!confirmRevoke ? (
                      <button
                        type="button"
                        onClick={() => setConfirmRevoke(true)}
                        className="px-3 py-2 rounded-lg bg-rose-600/15 hover:bg-rose-600/25 text-rose-300 text-xs flex items-center gap-1.5"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Revogar Credenciais
                      </button>
                    ) : (
                      <>
                        <span className="text-[11px] text-rose-300">Confirmar remoção?</span>
                        <button
                          type="button"
                          onClick={handleRevokeAll}
                          disabled={saving}
                          className="px-2.5 py-1.5 rounded bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold"
                        >
                          Sim, revogar
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmRevoke(false)}
                          className="px-2.5 py-1.5 rounded bg-slate-800 text-slate-300 text-xs"
                        >
                          Cancelar
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </form>
          )}
        </>
      )}
    </div>
  );
}
