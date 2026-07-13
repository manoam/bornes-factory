import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Search,
  ChevronLeft,
  ChevronRight,
  Plus,
  ClipboardList,
  Wrench,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import OperatorAvatar from '../components/OperatorAvatar';
import BorneCell from '../components/BorneCell';
import PriorityBadge from '../components/PriorityBadge';

type Status = 'DRAFT' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
type Priority = 'NORMAL' | 'HIGH' | 'URGENT';

interface DisRow {
  id: string;
  borneInternalNumber: string;
  sourceApp: string;
  status: Status;
  priority: Priority;
  reason: string | null;
  operatorName: string | null;
  createdByName: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  componentsCount: number;
  borneGamme: string | null;
  borneParc: string | null;
  borneEnseigne: string | null;
}

interface ListResponse {
  success: boolean;
  data: DisRow[];
  stats: Record<Status, number>;
  pagination: { total: number; limit: number; offset: number };
}

const STATUS_META: Record<Status, { label: string; cls: string }> = {
  DRAFT: { label: 'Brouillon', cls: 'bg-slate-100 text-slate-700' },
  IN_PROGRESS: { label: 'En cours', cls: 'bg-amber-100 text-amber-800' },
  COMPLETED: { label: 'Terminé', cls: 'bg-emerald-100 text-emerald-800' },
  CANCELLED: { label: 'Annulé', cls: 'bg-rose-100 text-rose-800' },
};

const STATUS_KPIS: { status: Status; label: string; Icon: typeof ClipboardList; color: string }[] = [
  { status: 'DRAFT', label: 'Brouillons', Icon: ClipboardList, color: 'text-slate-600' },
  { status: 'IN_PROGRESS', label: 'En cours', Icon: Wrench, color: 'text-amber-600' },
  { status: 'COMPLETED', label: 'Terminés', Icon: CheckCircle2, color: 'text-emerald-600' },
  { status: 'CANCELLED', label: 'Annulés', Icon: XCircle, color: 'text-rose-600' },
];

const PAGE_SIZE = 50;

export default function DisassembliesList() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const [selectedStatuses, setSelectedStatuses] = useState<Set<Status>>(new Set());
  const [search, setSearch] = useState('');
  const [mine, setMine] = useState(false);
  const [offset, setOffset] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);

  const queryString = useMemo(() => {
    const sp = new URLSearchParams();
    if (selectedStatuses.size > 0) sp.set('status', Array.from(selectedStatuses).join(','));
    if (mine) sp.set('mine', 'true');
    if (search.trim()) sp.set('search', search.trim());
    sp.set('limit', String(PAGE_SIZE));
    sp.set('offset', String(offset));
    return sp.toString();
  }, [selectedStatuses, mine, search, offset]);

  const listQ = useQuery({
    queryKey: ['disassemblies', queryString],
    queryFn: async () => {
      const res = await api.get<ListResponse>(`/disassemblies?${queryString}`);
      return res.data;
    },
  });

  const createM = useMutation({
    mutationFn: async (payload: { borneInternalNumber: string; reason?: string }) => {
      const res = await api.post<{ success: boolean; data: { id: string } }>(
        '/disassemblies',
        payload,
      );
      return res.data.data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['disassemblies'] });
      setCreateOpen(false);
      window.location.href = `/disassemblies/${data.id}`;
    },
  });

  const toggleStatus = (s: Status) => {
    setOffset(0);
    setSelectedStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  };

  const hasFilters = selectedStatuses.size > 0 || mine || search.trim().length > 0;
  const stats = listQ.data?.stats;
  const rows = listQ.data?.data || [];
  const total = listQ.data?.pagination.total ?? 0;
  const pageStart = offset + 1;
  const pageEnd = Math.min(offset + PAGE_SIZE, total);

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Démontages</h1>
          <p className="text-[13px] text-[--k-muted]">
            Bornes en fin de vie démontées pour récupérer les pièces.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[--k-primary] text-white px-3 py-2 text-[13px] font-medium"
        >
          <Plus className="h-4 w-4" />
          Nouveau démontage
        </button>
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {STATUS_KPIS.map(({ status, label, Icon, color }) => {
          const active = selectedStatuses.has(status);
          return (
            <button
              key={status}
              type="button"
              onClick={() => toggleStatus(status)}
              className={`rounded-xl border bg-[--k-surface] p-3 flex items-center gap-3 text-left transition ${
                active
                  ? 'border-[--k-primary] ring-2 ring-[--k-primary]/30'
                  : 'border-[--k-border] hover:border-[--k-primary]/50'
              }`}
            >
              <Icon className={`h-6 w-6 ${color}`} />
              <div>
                <div className="text-[10px] uppercase tracking-wide text-[--k-muted]">
                  {label}
                </div>
                <div className="text-lg font-semibold tabular-nums">
                  {stats?.[status] ?? '—'}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <section className="rounded-xl border border-[--k-border] bg-[--k-surface] p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[--k-muted]" />
            <input
              type="text"
              placeholder="N° borne ou motif…"
              value={search}
              onChange={(e) => {
                setOffset(0);
                setSearch(e.target.value);
              }}
              className="input-field !pl-10"
            />
          </div>
          {user && (
            <label className="inline-flex items-center gap-2 text-[13px] px-3 py-2 rounded-lg border border-[--k-border] cursor-pointer">
              <input
                type="checkbox"
                checked={mine}
                onChange={(e) => {
                  setOffset(0);
                  setMine(e.target.checked);
                }}
              />
              Mes démontages
            </label>
          )}
          {hasFilters && (
            <button
              type="button"
              onClick={() => {
                setSelectedStatuses(new Set());
                setMine(false);
                setSearch('');
                setOffset(0);
              }}
              className="text-[12px] text-[--k-muted] hover:text-[--k-text]"
            >
              Réinitialiser
            </button>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-[--k-border] bg-[--k-surface] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] table-zebra">
            <thead>
              <tr className="border-b border-[--k-border] text-left text-[11px] uppercase tracking-wide text-[--k-muted]">
                <th className="px-4 py-2">Borne</th>
                <th className="px-4 py-2">Motif</th>
                <th className="px-4 py-2">Priorité</th>
                <th className="px-4 py-2">Opérateur</th>
                <th className="px-4 py-2">Créé par</th>
                <th className="px-4 py-2 text-right">Récup.</th>
                <th className="px-4 py-2">Créé le</th>
                <th className="px-4 py-2">État</th>
              </tr>
            </thead>
            <tbody>
              {listQ.isLoading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-[--k-muted]">
                    Chargement…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-[--k-muted] italic">
                    Aucun démontage{hasFilters ? ' pour ces filtres' : ''}.
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const meta = STATUS_META[r.status];
                  return (
                    <tr key={r.id}>
                      <td className="px-4 py-2">
                        <BorneCell
                          internalNumber={r.borneInternalNumber}
                          chantierLink={`/disassemblies/${r.id}`}
                          sourceApp={r.sourceApp}
                          gamme={r.borneGamme}
                          parc={r.borneParc}
                          enseigne={r.borneEnseigne}
                        />
                      </td>
                      <td className="px-4 py-2 max-w-[300px]">
                        <div className="truncate text-[--k-text]">
                          {r.reason || <span className="italic text-[--k-muted]">—</span>}
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        <PriorityBadge priority={r.priority} />
                      </td>
                      <td className="px-4 py-2 max-w-[180px]">
                        <OperatorAvatar name={r.operatorName} size="sm" />
                      </td>
                      <td className="px-4 py-2 max-w-[180px]">
                        <OperatorAvatar name={r.createdByName} size="sm" />
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {r.componentsCount}
                      </td>
                      <td className="px-4 py-2 text-[--k-muted]">
                        <div className="flex items-center gap-1.5">
                          <OperatorAvatar name={r.createdByName} size="xs" showName={false} />
                          {new Date(r.createdAt).toLocaleDateString('fr-FR')}
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${meta.cls}`}
                        >
                          {meta.label}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {total > 0 && (
          <div className="flex items-center justify-between border-t border-[--k-border] px-4 py-2 text-[12px] text-[--k-muted]">
            <span>
              {pageStart}–{pageEnd} sur {total}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                className="inline-flex items-center gap-1 rounded-lg border border-[--k-border] px-2 py-1 disabled:opacity-50"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Précédent
              </button>
              <button
                type="button"
                disabled={pageEnd >= total}
                onClick={() => setOffset(offset + PAGE_SIZE)}
                className="inline-flex items-center gap-1 rounded-lg border border-[--k-border] px-2 py-1 disabled:opacity-50"
              >
                Suivant
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </section>

      {createOpen && (
        <CreateModal
          onClose={() => setCreateOpen(false)}
          onSubmit={(payload) => createM.mutate(payload)}
          submitting={createM.isPending}
          error={
            (createM.error as { response?: { data?: { error?: string } } } | null)?.response
              ?.data?.error || null
          }
        />
      )}
    </div>
  );
}

function CreateModal({
  onClose,
  onSubmit,
  submitting,
  error,
}: {
  onClose: () => void;
  onSubmit: (payload: { borneInternalNumber: string; reason?: string }) => void;
  submitting: boolean;
  error: string | null;
}) {
  const [internal, setInternal] = useState('');
  const [reason, setReason] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-[--k-surface] rounded-xl w-full max-w-md shadow-xl">
        <div className="px-4 py-3 border-b border-[--k-border] flex items-center justify-between">
          <h2 className="font-semibold">Nouveau démontage</h2>
          <button onClick={onClose} className="text-[--k-muted]" type="button">
            ×
          </button>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <label className="block text-[12px] font-medium text-[--k-muted] mb-1">
              N° interne de la borne
            </label>
            <input
              autoFocus
              className="input-field font-mono"
              placeholder="ex : K001, S401, C100"
              value={internal}
              onChange={(e) => setInternal(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-[12px] font-medium text-[--k-muted] mb-1">
              Motif du démontage
            </label>
            <textarea
              className="input-field py-2 min-h-[70px]"
              placeholder="ex : fin de contrat, HS irréparable, cannibalisation…"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          {error && (
            <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-[12px] text-rose-700">
              {error}
            </div>
          )}
        </div>
        <div className="px-4 py-3 border-t border-[--k-border] flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[--k-border] px-3 py-2 text-[13px]"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={() =>
              onSubmit({
                borneInternalNumber: internal.trim(),
                reason: reason.trim() || undefined,
              })
            }
            disabled={!internal.trim() || submitting}
            className="rounded-lg bg-[--k-primary] text-white px-3 py-2 text-[13px] font-medium disabled:opacity-50"
          >
            {submitting ? 'Création…' : 'Créer'}
          </button>
        </div>
      </div>
    </div>
  );
}
