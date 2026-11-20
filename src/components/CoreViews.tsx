import React, { useState, useEffect } from 'react';
import { Users, Building2, Key, Activity, Plus, ShieldAlert, CheckCircle2, Ban, Download } from 'lucide-react';
import { apiFetch } from '../lib/api';

export function UsersManagementView({
  usersList,
  organizations,
  clients,
  activeOrgId,
  currentUser,
  onRefresh,
  onNotify,
}: any) {
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'Comercial',
    clientId: '',
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/users', {
        method: 'POST',
        body: JSON.stringify({ ...form, organizationId: activeOrgId }),
      });
      setShowModal(false);
      setForm({ name: '', email: '', password: '', role: 'Comercial', clientId: '' });
      onNotify('Usuário criado com hash scrypt e vinculado à organização.');
      onRefresh();
    } catch (err: any) {
      onNotify(err.message, true);
    }
  };

  const toggleStatus = async (u: any) => {
    try {
      const next = u.status === 'Ativo' ? 'Inativo' : 'Ativo';
      await apiFetch(`/api/users/${u.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: next }),
      });
      onNotify(`Usuário ${u.name} atualizado para ${next}.`);
      onRefresh();
    } catch (err: any) {
      onNotify(err.message, true);
    }
  };

  const activeOrg = organizations.find((o: any) => o.id === activeOrgId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <Users className="w-6 h-6 text-cyan-400" /> NER Core • Gestão de Usuários
          </h2>
          <p className="text-sm text-slate-400">
            Usuários isolados na organização: <span className="text-cyan-400 font-medium">{activeOrg?.name || activeOrgId}</span>
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs"
        >
          <Plus className="w-4 h-4" /> Novo Usuário
        </button>
      </div>

      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-950 border-b border-slate-800 text-slate-400 uppercase font-semibold">
            <tr>
              <th className="p-4">Usuário</th>
              <th className="p-4">E-mail</th>
              <th className="p-4">Perfil RBAC</th>
              <th className="p-4">Status</th>
              <th className="p-4 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {usersList.map((u: any) => (
              <tr key={u.id} className="hover:bg-slate-800/30">
                <td className="p-4 font-semibold text-white">{u.name}</td>
                <td className="p-4 text-slate-300 font-mono">{u.email}</td>
                <td className="p-4">
                  <span className="px-2.5 py-1 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                    {u.role}
                  </span>
                </td>
                <td className="p-4">
                  <span
                    className={`px-2.5 py-1 rounded-full border ${
                      u.status === 'Ativo'
                        ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                        : 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                    }`}
                  >
                    {u.status}
                  </span>
                </td>
                <td className="p-4 text-right">
                  {u.id !== currentUser?.id && (
                    <button
                      onClick={() => toggleStatus(u)}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs"
                    >
                      {u.status === 'Ativo' ? 'Desativar' : 'Reativar'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <form onSubmit={handleCreate} className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-4">
            <h3 className="text-lg font-bold text-white">Cadastrar Usuário</h3>
            <input
              type="text"
              required
              placeholder="Nome completo"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white"
            />
            <input
              type="email"
              required
              placeholder="E-mail"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white"
            />
            <input
              type="password"
              required
              minLength={8}
              placeholder="Senha inicial (mín. 8 caracteres)"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white"
            />
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white"
            >
              <option value="Administrador">Administrador</option>
              <option value="Gestor de Tráfego">Gestor de Tráfego</option>
              <option value="Comercial">Comercial</option>
              <option value="Criativo">Criativo</option>
              <option value="Financeiro">Financeiro</option>
              <option value="Cliente">Cliente</option>
            </select>
            {form.role === 'Cliente' && (
              <select
                required
                value={form.clientId}
                onChange={(e) => setForm({ ...form, clientId: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white"
              >
                <option value="">Selecione o cliente vinculado...</option>
                {clients.map((c: any) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 rounded-lg bg-slate-800 text-xs">
                Cancelar
              </button>
              <button type="submit" className="px-4 py-2 rounded-lg bg-cyan-600 text-white text-xs font-semibold">
                Salvar Usuário
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export function OrganizationsView({ organizations, currentUser, onRefresh, onNotify }: any) {
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: '', legalName: '', document: '', slug: '' });
  const isSuperAdmin = currentUser?.role === 'Super Admin';

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/organizations', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      setShowModal(false);
      setForm({ name: '', legalName: '', document: '', slug: '' });
      onNotify('Nova organização multi-tenant criada.');
      onRefresh();
    } catch (err: any) {
      onNotify(err.message, true);
    }
  };

  const toggleStatus = async (org: any) => {
    try {
      const next = org.status === 'Ativo' ? 'Suspenso' : 'Ativo';
      await apiFetch(`/api/organizations/${org.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: next }),
      });
      onNotify(`Organização ${org.name} alterada para ${next}.`);
      onRefresh();
    } catch (err: any) {
      onNotify(err.message, true);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <Building2 className="w-6 h-6 text-cyan-400" /> NER Core • Organizações (Multi-Tenant)
          </h2>
          <p className="text-sm text-slate-400">Isolamento lógico estrito por organizationId em todas as camadas de API.</p>
        </div>
        {isSuperAdmin && (
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs"
          >
            <Plus className="w-4 h-4" /> Nova Organização
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {organizations.map((org: any) => (
          <div key={org.id} className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-bold text-white text-base">{org.name}</h3>
                <p className="text-xs text-slate-400">{org.legalName}</p>
              </div>
              <span
                className={`text-xs px-2.5 py-1 rounded-full border ${
                  org.status === 'Ativo'
                    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                    : 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                }`}
              >
                {org.status}
              </span>
            </div>
            <div className="text-xs text-slate-400 flex items-center justify-between pt-2 border-t border-slate-800">
              <span>Slug: <code className="text-cyan-400">{org.slug}</code></span>
              <span>Doc: {org.document}</span>
            </div>
            {isSuperAdmin && (
              <div className="pt-2 flex justify-end">
                <button
                  onClick={() => toggleStatus(org)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 flex items-center gap-1.5"
                >
                  {org.status === 'Ativo' ? <Ban className="w-3.5 h-3.5 text-rose-400" /> : <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                  {org.status === 'Ativo' ? 'Suspender Tenant' : 'Reativar Tenant'}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <form onSubmit={handleCreate} className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 space-y-4">
            <h3 className="text-lg font-bold text-white">Nova Organização</h3>
            <input
              type="text"
              required
              placeholder="Nome Fantasia"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white"
            />
            <input
              type="text"
              required
              placeholder="Razão Social"
              value={form.legalName}
              onChange={(e) => setForm({ ...form, legalName: e.target.value })}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white"
            />
            <input
              type="text"
              required
              placeholder="CNPJ"
              value={form.document}
              onChange={(e) => setForm({ ...form, document: e.target.value })}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white"
            />
            <input
              type="text"
              required
              placeholder="Slug (ex: ner-sul)"
              value={form.slug}
              onChange={(e) => setForm({ ...form, slug: e.target.value })}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white"
            />
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 rounded-lg bg-slate-800 text-xs">
                Cancelar
              </button>
              <button type="submit" className="px-4 py-2 rounded-lg bg-cyan-600 text-white text-xs font-semibold">
                Criar Organização
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export function RbacView({ roles, permissions }: any) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
          <Key className="w-6 h-6 text-cyan-400" /> NER Core • Matriz RBAC & Permissões
        </h2>
        <p className="text-sm text-slate-400">
          Controle de acesso verificado no backend ({roles.length} perfis e {permissions.length} permissões granulares).
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {roles.map((r: any) => (
          <div key={r.id} className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-white text-sm">{r.name}</h3>
              <span className="text-xs font-mono text-cyan-400">{r.permissions?.includes('*') ? 'Acesso Total (*)' : `${r.permissionsCount} permissões`}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(r.permissions || []).slice(0, 14).map((p: string) => (
                <span key={p} className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-300">
                  {p}
                </span>
              ))}
              {(r.permissions || []).length > 14 && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-cyan-300">
                  +{r.permissions.length - 14} outras
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AuditLogsView({ auditLogs, clients = [], currentUser, onRefresh, onNotify }: any) {
  const [selectedClientId, setSelectedClientId] = useState<string>(clients[0]?.id || '');
  const [confirmAnon, setConfirmAnon] = useState(false);
  const [busyLgpd, setBusyLgpd] = useState(false);

  useEffect(() => {
    setSelectedClientId((prev) => (clients.some((c: any) => c.id === prev) ? prev : (clients[0]?.id || '')));
    setConfirmAnon(false);
  }, [clients]);

  const canAnonymize = ['Super Admin', 'Administrador'].includes(currentUser?.role);

  const handleExportLgpd = async () => {
    if (!selectedClientId) return;
    setBusyLgpd(true);
    try {
      const payload = await apiFetch<any>(`/api/lgpd/clients/${selectedClientId}/export`);
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `lgpd-export-${selectedClientId}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      onNotify?.('Pacote LGPD exportado com sucesso.');
      onRefresh?.();
    } catch (err: any) {
      onNotify?.(err.message, true);
    } finally {
      setBusyLgpd(false);
    }
  };

  const handleAnonymizeLgpd = async () => {
    if (!selectedClientId) return;
    setBusyLgpd(true);
    try {
      await apiFetch(`/api/lgpd/clients/${selectedClientId}/anonymize`, { method: 'POST' });
      setConfirmAnon(false);
      onNotify?.('Dados pessoais do cliente anonimizados conforme LGPD e sessões revogadas.');
      onRefresh?.();
    } catch (err: any) {
      onNotify?.(err.message, true);
    } finally {
      setBusyLgpd(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
          <Activity className="w-6 h-6 text-cyan-400" /> NER Core • Trilha de Auditoria & Governança LGPD
        </h2>
        <p className="text-sm text-slate-400">Registro imutável de ações sensíveis, exportação de portabilidade e anonimização LGPD.</p>
      </div>

      {clients.length > 0 && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <h3 className="font-bold text-white text-sm">Direitos do Titular (LGPD Art. 18)</h3>
            <p className="text-xs text-slate-400">Exporte o dossiê completo em JSON ou execute anonimização irreversível preservando integridade fiscal.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={selectedClientId}
              onChange={(e) => {
                setSelectedClientId(e.target.value);
                setConfirmAnon(false);
              }}
              className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white"
            >
              {clients.map((c: any) => (
                <option key={c.id} value={c.id}>{c.name} ({c.email})</option>
              ))}
            </select>
            <button
              type="button"
              disabled={busyLgpd || !selectedClientId}
              onClick={handleExportLgpd}
              className="px-3 py-2 rounded-lg bg-cyan-600/20 hover:bg-cyan-600/30 border border-cyan-500/30 text-xs text-cyan-300 font-semibold flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" /> Exportar Dados JSON
            </button>
            {canAnonymize && (
              confirmAnon ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={busyLgpd}
                    onClick={handleAnonymizeLgpd}
                    className="px-3 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-xs text-white font-semibold"
                  >
                    Confirmar Anonimização
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmAnon(false)}
                    className="px-3 py-2 rounded-lg bg-slate-800 text-xs text-slate-300"
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={busyLgpd || !selectedClientId}
                  onClick={() => setConfirmAnon(true)}
                  className="px-3 py-2 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-xs text-rose-300 font-semibold"
                >
                  Anonimizar Titular
                </button>
              )
            )}
          </div>
        </div>
      )}

      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-950 border-b border-slate-800 text-slate-400 uppercase font-semibold">
            <tr>
              <th className="p-4">Timestamp</th>
              <th className="p-4">Ação</th>
              <th className="p-4">Recurso</th>
              <th className="p-4">Ator (User ID)</th>
              <th className="p-4">Metadados</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {auditLogs.map((log: any) => (
              <tr key={log.id} className="hover:bg-slate-800/30">
                <td className="p-4 font-mono text-slate-400">{new Date(log.createdAt).toLocaleString('pt-BR')}</td>
                <td className="p-4 font-mono font-semibold text-cyan-400">{log.action}</td>
                <td className="p-4 text-white">{log.resource} ({log.resourceId})</td>
                <td className="p-4 font-mono text-slate-300">{log.userId}</td>
                <td className="p-4 font-mono text-[11px] text-slate-400">{JSON.stringify(log.metadata)}</td>
              </tr>
            ))}
            {auditLogs.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-slate-500">
                  <ShieldAlert className="w-5 h-5 mx-auto mb-2" />
                  Nenhum registro de auditoria nesta organização.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
