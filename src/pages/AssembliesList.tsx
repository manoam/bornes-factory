import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Search,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  PlayCircle,
  Beaker,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import OperatorAvatar from '../components/OperatorAvatar';

type Status = 'DRAFT' | 'IN_PROGRESS' | 'TESTING' | 'COMPLETED' | 'CANCELLED';

interface AssemblyRow {
  id: string;
  internalNumber: string | null;
  status: Status;
  operatorId: string | null;
  operatorName: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  productionOrder: { id: string; model: string; quantity: number };
  componentsInstalled: number;
  componentsRequired: number | null;
}

interface ListResponse {
  success: boolean;
  data: AssemblyRow[];
  stats: Record<Status, number>;
  pagination: { total: number; limit: number; offset: number };
}

interface AvailableModel {
  id: string;
  name: string;
  itemCount: number;
}

const STATUS_META: Record<Status, { label: string; cls: string }> = {
  DRAFT: { label: 'Brouillon', cls: 'bg-slate-100 text-slate-700' },
  IN_PROGRESS: { label: 'En cours', cls: 'bg-amber-100 text-amber-800' },
  TESTING: { label: 'En test', cls: 'bg-blue-100 text-blue-800' },
  COMPLETED: { label: 'Terminé', cls: 'bg-emerald-100 text-emerald-800' },
  CANCELLED: { label: 'Annulé', cls: 'bg-rose-100 text-rose-800' },
};

const STATUS_KPIS: { status: Status; label: string; Icon: typeof ClipboardList; color: string }[] = [
  { status: 'DRAFT', label: 'Brouillons', Icon: ClipboardList, color: 'text-slate-600' },
  { status: 'IN_PROGRESS', label: 'En cours', Icon: PlayCircle, color: 'text-amber-600' },
  { status: 'TESTING', label: 'En test', Icon: Beaker, color: 'text-blue-600' },
  { status: 'COMPLETED', label: 'Terminés', Icon: CheckCircle2, color: 'text-emerald-600' },
  { status: 'CANCELLED', label: 'Annulés', Icon: XCircle, color: 'text-rose-600' },
];

const PAGE_SIZE = 50;

export default function AssembliesList() {
  const { user } = useAuth();

  // Multi-select des statuts par chips. État local — pas dans l'URL pour
  // garder la page simple. Pour persister entre tabs il faudrait des
  // searchParams, on verra si besoin.
  const [selectedStatuses, setSelectedStatuses] = useState<Set<Status>>(new Set());
  const [model, setModel] = useState<string>('');
  const [mine, setMine] = useState(false);
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);

  const queryString = useMemo(() => {
    const sp = new URLSearchParams();
    if (selectedStatuses.size > 0) sp.set('status', Array.from(selectedStatuses).join(','));
    if (model) sp.set('model', model);
    if (mine) sp.set('mine', 'true');
    if (search.trim()) sp.set('search', search.trim());
    sp.set('limit', String(PAGE_SIZE));
    sp.set('offset', String(offset));
    return sp.toString();
  }, [selectedStatuses, model, mine, search, offset]);

  const listQ = useQuery({
    queryKey: ['assemblies-list', queryString],
    queryFn: async () => {
      const res = await api.get<ListResponse>(`/assembly-orders?${queryString}`);
      return res.data;
    },
  });

  const modelsQ = useQuery({
    queryKey: ['available-models'],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: AvailableModel[] }>(
        '/production-orders/available-models',
      );
      return res.data.data;
    },
    staleTime: 60_000,
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

  const resetFilters = () => {
    setSelectedStatuses(new Set());
    setModel('');
    setMine(false);
    setSearch('');
    setOffset(0);
  };

  const hasFilters =
    selectedStatuses.size > 0 || !!model || mine || search.trim().length > 0;

  const stats = listQ.data?.stats;
  const rows = listQ.data?.data || [];
  const total = listQ.data?.pagination.total ?? 0;
  const pageStart = offset + 1;
  const pageEnd = Math.min(offset + PAGE_SIZE, total);

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold">Assemblages</h1>
        <p className="text-[13px] text-[--k-muted]">
          Toutes les bornes en cours ou terminées. Cliquez sur une ligne pour
          ouvrir la fiche.
        </p>
      </header>

      {/* KPIs — toujours visibles, chacun cliquable pour filtrer */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
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

      {/* Filtres */}
      <section className="rounded-xl border border-[--k-border] bg-[--k-surface] p-3 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[--k-muted]" />
            <input
              type="text"
              placeholder="N° interne ou modèle…"
              value={search}
              onChange={(e) => {
                setOffset(0);
                setSearch(e.target.value);
              }}
              className="input-field !pl-10"
            />
          </div>

          <select
            className="input-field max-w-[220px]"
            value={model}
            onChange={(e) => {
              setOffset(0);
              setModel(e.target.value);
            }}
          >
            <option value="">Tous les modèles</option>
            {(modelsQ.data || []).map((m) => (
              <option key={m.id} value={m.name}>
                {m.name}
              </option>
            ))}
          </select>

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
              Mon atelier
            </label>
          )}

          {hasFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="text-[12px] text-[--k-muted] hover:text-[--k-text]"
            >
              Réinitialiser
            </button>
          )}
        </div>
      </section>

      {/* Liste */}
      <section className="rounded-xl border border-[--k-border] bg-[--k-surface] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-[--k-border] text-left text-[11px] uppercase tracking-wide text-[--k-muted]">
                <th className="px-4 py-2">N° interne</th>
                <th className="px-4 py-2">Modèle</th>
                <th className="px-4 py-2">Statut</th>
                <th className="px-4 py-2">Opérateur</th>
                <th className="px-4 py-2 text-right">Composants</th>
                <th className="px-4 py-2">Démarré</th>
                <th className="px-4 py-2">Terminé</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[--k-border]">
              {listQ.isLoading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-[--k-muted]">
                    Chargement…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-[--k-muted] italic">
                    Aucun assemblage{hasFilters ? ' pour ces filtres' : ''}.
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const meta = STATUS_META[r.status];
                  return (
                    <tr key={r.id} className="hover:bg-[--k-surface-2]/40">
                      <td className="px-4 py-2 font-mono">
                        <Link
                          to={`/assemblies/${r.id}`}
                          className="text-[--k-primary] hover:underline"
                        >
                          {r.internalNumber || (
                            <span className="text-[--k-muted] italic">non attribué</span>
                          )}
                        </Link>
                      </td>
                      <td className="px-4 py-2">
                        <div className="font-medium truncate max-w-[200px]">
                          {r.productionOrder.model}
                        </div>
                        <Link
                          to={`/production-orders/${r.productionOrder.id}`}
                          className="text-[11px] text-[--k-muted] hover:text-[--k-primary]"
                        >
                          OF de {r.productionOrder.quantity} bornes
                        </Link>
                      </td>
                      <td className="px-4 py-2">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${meta.cls}`}
                        >
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-4 py-2 max-w-[180px]">
                        <OperatorAvatar name={r.operatorName} size="sm" />
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {r.componentsRequired != null
                          ? `${r.componentsInstalled} / ${r.componentsRequired}`
                          : `${r.componentsInstalled}`}
                      </td>
                      <td className="px-4 py-2 text-[--k-muted]">
                        {r.startedAt
                          ? new Date(r.startedAt).toLocaleDateString('fr-FR')
                          : '—'}
                      </td>
                      <td className="px-4 py-2 text-[--k-muted]">
                        {r.completedAt
                          ? new Date(r.completedAt).toLocaleDateString('fr-FR')
                          : '—'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
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
    </div>
  );
}
