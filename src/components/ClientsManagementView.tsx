import React, { useEffect, useMemo, useState } from 'react';
import {
  Archive,
  Building2,
  CheckCircle2,
  Edit3,
  Eye,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  X,
} from 'lucide-react';
import { apiFetch, formatCurrencyBRL } from '../lib/api';

interface ClientsManagementViewProps {
  clients: any[];
  activeOrgId: string;
  onRefresh: () => void;
  onNotify: (msg: string, isError?: boolean) => void;
}

export function ClientsManagementView({
  clients,
  activeOrgId,
  onRefresh,
  onNotify,
}: ClientsManagementViewProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [healthFilter, setHealthFilter] = useState('all');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [localList, setLocalList] = useState<any[]>(clients);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 8;

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    legalName: '',
    document: '',
    email: '',
    phone: '',
    website: '',
    segment: 'Tecnologia / B2B',
    category: 'Pequena Empresa',
    status: 'Ativo',
    health: 'Bom',
    mrr: '0',
    manager: '',
  });

  const [selectedDetails, setSelectedDetails] = useState<any | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  const loadClients = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        organizationId: activeOrgId,
        includeArchived: String(includeArchived),
      });
      if (search.trim()) params.set('search', search.trim());
      if (statusFilter !== 'all') params.set('status', statusFilter);
      const data = await apiFetch<any[]>(`/api/clients?${params.toString()}`);
      setLocalList(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar clientes.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLocalList(clients);
  }, [clients]);

  useEffect(() => {
    void loadClients();
    setPage(1);
  }, [activeOrgId, includeArchived, statusFilter]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return localList.filter((c) => {
      if (healthFilter !== 'all' && c.health !== healthFilter) return false;
      if (!q) return true;
      return [c.name, c.legalName, c.email, c.segment, c.document, c.manager]
        .some((v) => String(v || '').toLowerCase().includes(q));
    });
  }, [localList, search, healthFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

  const openCreate = () => {
    setEditingId(null);
    setForm({
      name: '',
      legalName: '',
      document: '',
      email: '',
      phone: '',
      website: '',
      segment: 'Tecnologia / B2B',
      category: 'Pequena Empresa',
      status: 'Ativo',
      health: 'Bom',
      mrr: '0',
      manager: '',
    });
    setShowForm(true);
  };

  const openEdit = (c: any) => {
    setEditingId(c.id);
    setForm({
      name: c.name || '',
      legalName: c.legalName || '',
      document: c.document || '',
      email: c.email || '',
      phone: c.phone || '',
      website: c.website || '',
      segment: c.segment || 'Geral',
      category: c.category || 'Pequena Empresa',
      status: c.status || 'Ativo',
      health: c.health || 'Bom',
      mrr: String(c.mrr ?? 0),
      manager: c.manager || '',
    });
    setShowForm(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form,
        mrr: Math.max(0, Number(form.mrr) || 0),
        organizationId: activeOrgId,
      };
      if (editingId) {
        await apiFetch(`/api/clients/${editingId}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        onNotify('Cliente atualizado com sucesso.');
      } else {
        await apiFetch('/api/clients', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        onNotify('Cliente cadastrado com sucesso.');
      }
      setShowForm(false);
      await loadClients();
      onRefresh();
    } catch (err: any) {
      onNotify(err.message || 'Erro ao salvar cliente.', true);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (c: any) => {
    const nextStatus = c.status === 'Ativo' ? 'Inativo' : 'Ativo';
    try {
      await apiFetch(`/api/clients/${c.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
      onNotify(`Cliente ${c.name} alterado para ${nextStatus}.`);
      await loadClients();
      onRefresh();
    } catch (err: any) {
      onNotify(err.message, true);
    }
  };

  const handleArchive = async (c: any, restore = false) => {
    try {
      await apiFetch(`/api/clients/${c.id}/archive`, {
        method: 'PATCH',
        body: JSON.stringify({ restore, reason: restore ? 'Reativação administrativa' : 'Arquivamento controlado' }),
      });
      onNotify(restore ? `Cliente ${c.name} restaurado.` : `Cliente ${c.name} arquivado com auditoria.`);
      await loadClients();
      onRefresh();
    } catch (err: any) {
      onNotify(err.message, true);
    }
  };

  const openDetails = async (c: any) => {
    setLoadingDetails(true);
    try {
      const details = await apiFetch<any>(`/api/clients/${c.id}/details`);
      setSelectedDetails(details);
    } catch (err: any) {
      onNotify(err.message || 'Erro ao carregar detalhes do cliente.', true);
    } finally {
      setLoadingDetails(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <Building2 className="w-6 h-6 text-cyan-400" /> Gestão de Clientes
          </h2>
          <p className="text-sm text-slate-400">
            Cadastro completo, status operacional, saúde de conta, histórico auditado e arquivamento seguro.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void loadClients()}
            className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-300 hover:text-white flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Atualizar
          </button>
          <button
            onClick={openCreate}
            className="px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" /> Novo Cliente
          </button>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Buscar por nome, razão social, e-mail, CNPJ ou segmento..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white"
        >
          <option value="all">Todos os status</option>
          <option value="Ativo">Ativo</option>
          <option value="Em Onboarding">Em Onboarding</option>
          <option value="Inativo">Inativo</option>
        </select>
        <select
          value={healthFilter}
          onChange={(e) => setHealthFilter(e.target.value)}
          className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white"
        >
          <option value="all">Toda saúde</option>
          <option value="Excelente">Excelente</option>
          <option value="Bom">Bom</option>
          <option value="Atenção">Atenção</option>
          <option value="Novo">Novo</option>
        </select>
        <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(e) => setIncludeArchived(e.target.checked)}
            className="rounded border-slate-700"
          />
          Mostrar arquivados
        </label>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      {/* Create / Edit Form */}
      {showForm && (
        <form onSubmit={handleSave} className="bg-slate-900 border border-cyan-500/30 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white">
              {editingId ? 'Editar Cliente' : 'Cadastrar Novo Cliente'}
            </h3>
            <button type="button" onClick={() => setShowForm(false)} className="text-slate-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <input required placeholder="Nome Fantasia *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white" />
            <input placeholder="Razão Social" value={form.legalName} onChange={(e) => setForm({ ...form, legalName: e.target.value })} className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white" />
            <input placeholder="CNPJ / Documento" value={form.document} onChange={(e) => setForm({ ...form, document: e.target.value })} className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white" />
            <input required type="email" placeholder="E-mail de contato *" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white" />
            <input placeholder="Telefone / WhatsApp" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white" />
            <input placeholder="Website (https://...)" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white" />
            <input placeholder="Segmento" value={form.segment} onChange={(e) => setForm({ ...form, segment: e.target.value })} className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white" />
            <input type="number" min={0} step="0.01" placeholder="MRR (R$)" value={form.mrr} onChange={(e) => setForm({ ...form, mrr: e.target.value })} className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white" />
            <input placeholder="Gestor Responsável" value={form.manager} onChange={(e) => setForm({ ...form, manager: e.target.value })} className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white" />
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white">
              <option value="Ativo">Ativo</option>
              <option value="Em Onboarding">Em Onboarding</option>
              <option value="Inativo">Inativo</option>
            </select>
            <select value={form.health} onChange={(e) => setForm({ ...form, health: e.target.value })} className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white">
              <option value="Excelente">Excelente</option>
              <option value="Bom">Bom</option>
              <option value="Atenção">Atenção</option>
              <option value="Novo">Novo</option>
            </select>
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white">
              <option value="Microempresa">Microempresa</option>
              <option value="Pequena Empresa">Pequena Empresa</option>
              <option value="Média Empresa">Média Empresa</option>
              <option value="Grande Empresa">Grande Empresa</option>
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg bg-slate-800 text-xs text-slate-300">
              Cancelar
            </button>
            <button disabled={saving} type="submit" className="px-4 py-2 rounded-lg bg-cyan-500 text-slate-950 font-semibold text-xs">
              {saving ? 'Salvando...' : editingId ? 'Salvar Alterações' : 'Cadastrar Cliente'}
            </button>
          </div>
        </form>
      )}

      {/* Table */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden">
        {loading && localList.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">Carregando clientes...</div>
        ) : paginated.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">
            Nenhum cliente encontrado para os filtros aplicados.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/70 text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="px-4 py-3">Cliente / Razão Social</th>
                  <th className="px-4 py-3">Segmento</th>
                  <th className="px-4 py-3">MRR</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Saúde</th>
                  <th className="px-4 py-3">Gestor</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {paginated.map((c) => (
                  <tr key={c.id} className={`hover:bg-slate-800/30 ${c.archivedAt ? 'opacity-60' : ''}`}>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-white">{c.name}</div>
                      <div className="text-[11px] text-slate-400">{c.email} • {c.document || 'Sem documento'}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-300">{c.segment}</td>
                    <td className="px-4 py-3 font-mono text-emerald-400">{formatCurrencyBRL(c.mrr)}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                        c.archivedAt
                          ? 'bg-slate-800 text-slate-400'
                          : c.status === 'Ativo'
                            ? 'bg-emerald-500/15 text-emerald-300'
                            : c.status === 'Em Onboarding'
                              ? 'bg-cyan-500/15 text-cyan-300'
                              : 'bg-rose-500/15 text-rose-300'
                      }`}>
                        {c.archivedAt ? 'Arquivado' : c.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-300">{c.health}</td>
                    <td className="px-4 py-3 text-slate-400">{c.manager || '—'}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <button onClick={() => void openDetails(c)} title="Detalhes" className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-cyan-300">
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => openEdit(c)} title="Editar" className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200">
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        {!c.archivedAt && (
                          <button onClick={() => void handleToggleStatus(c)} title="Ativar/Suspender" className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-amber-300">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {c.archivedAt ? (
                          <button onClick={() => void handleArchive(c, true)} title="Restaurar" className="p-1.5 rounded bg-slate-800 hover:bg-emerald-900/50 text-emerald-300">
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>
                        ) : (
                          <button onClick={() => void handleArchive(c, false)} title="Arquivar" className="p-1.5 rounded bg-slate-800 hover:bg-rose-900/50 text-rose-300">
                            <Archive className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="px-4 py-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <span>{filtered.length} cliente(s) • Página {page} de {totalPages}</span>
          <div className="flex gap-2">
            <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="px-2.5 py-1 rounded bg-slate-800 disabled:opacity-40 text-white">
              Anterior
            </button>
            <button disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} className="px-2.5 py-1 rounded bg-slate-800 disabled:opacity-40 text-white">
              Próxima
            </button>
          </div>
        </div>
      </div>

      {/* Detailed Client Modal / Drawer */}
      {(selectedDetails || loadingDetails) && (
        <div className="bg-slate-900 border border-slate-700 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white">
              {loadingDetails ? 'Carregando detalhes...' : `Ficha Detalhada — ${selectedDetails.client.name}`}
            </h3>
            <button onClick={() => setSelectedDetails(null)} className="text-slate-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
          {selectedDetails && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                <div className="text-slate-400">Projetos</div>
                <div className="text-xl font-bold text-white mt-1">{selectedDetails.projects.length}</div>
              </div>
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                <div className="text-slate-400">Contratos</div>
                <div className="text-xl font-bold text-cyan-400 mt-1">{selectedDetails.contracts.length}</div>
              </div>
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                <div className="text-slate-400">Faturas</div>
                <div className="text-xl font-bold text-emerald-400 mt-1">{selectedDetails.receivables.length}</div>
              </div>
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                <div className="text-slate-400">Chamados</div>
                <div className="text-xl font-bold text-amber-300 mt-1">{selectedDetails.tickets.length}</div>
              </div>
              <div className="md:col-span-4 p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
                <div className="font-semibold text-slate-200 mb-2">Histórico de Auditoria Recente</div>
                {selectedDetails.auditHistory.length === 0 ? (
                  <div className="text-slate-500">Nenhum evento registrado ainda.</div>
                ) : (
                  selectedDetails.auditHistory.slice(0, 6).map((a: any) => (
                    <div key={a.id} className="flex justify-between text-[11px] text-slate-400 border-b border-slate-900 pb-1">
                      <span className="font-mono text-cyan-300">{a.action}</span>
                      <span>{new Date(a.createdAt).toLocaleString('pt-BR')}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
