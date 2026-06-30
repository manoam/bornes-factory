import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Search,
  CheckCircle2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  RefreshCcw,
  ExternalLink,
} from 'lucide-react';
import api from '../services/api';
import OperatorAvatar from '../components/OperatorAvatar';

interface BorneParc {
  id: number;
  numero_formated: string;
  numero_serie: string | null;
  gamme_nom: string | null;
  etat_nom: string | null;
  parc_nom: string | null;
  localisation: string | null;
  antenne_ville: string | null;
  client_enseigne: string | null;
  sortie_atelier: string | null;
}

interface ProducedRow {
  id: string;
  internalNumber: string | null;
  operatorName: string | null;
  completedAt: string | null;
  startedAt: string | null;
  componentsInstalled: number;
  productionOrder: { id: string; model: string };
  parcMatch: {
    found: boolean;
    borne: BorneParc | null;
    error: string | null;
  };
}

interface ListResponse {
  success: boolean;
  data: ProducedRow[];
  pagination: { total: number; limit: number; offset: number };
  bornesSync: {
    configured: boolean;
    snapshotCount: number;
    snapshotError: string | null;
  };
}

interface AvailableModel {
  id: string;
  name: string;
}

const PAGE_SIZE = 50;

export default function ProducedBornes() {
  const [search, setSearch] = useState('');
  const [model, setModel] = useState('');
  const [syncFilter, setSyncFilter] = useState<'all' | 'matched' | 'unmatched'>('all');
  const [offset, setOffset] = useState(0);

  const queryString = useMemo(() => {
    const sp = new URLSearchParams();
    if (search.trim()) sp.set('search', search.trim());
    if (model) sp.set('model', model);
    if (syncFilter !== 'all') sp.set('sync', syncFilter);
    sp.set('limit', String(PAGE_SIZE));
    sp.set('offset', String(offset));
    return sp.toString();
  }, [search, model, syncFilter, offset]);

  const listQ = useQuery({
    queryKey: ['produced-bornes', queryString],
    queryFn: async () => {
      const res = await api.get<ListResponse>(`/produced-bornes?${queryString}`);
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

  const rows = listQ.data?.data || [];
  const total = listQ.data?.pagination.total ?? 0;
  const pageStart = offset + 1;
  const pageEnd = Math.min(offset + PAGE_SIZE, total);
  const sync = listQ.data?.bornesSync;

  const hasFilters =
    !!search.trim() || !!model || syncFilter !== 'all';

  // Pour les KPIs on récupère les comptes brut (matched / unmatched) sur le
  // total — c'est juste un visuel rapide donc on prend le snapshot d'ici.
  const counts = useMemo(() => {
    if (!rows.length) return { matched: 0, unmatched: 0 };
    let m = 0;
    for (const r of rows) if (r.parcMatch.found) m++;
    return { matched: m, unmatched: rows.length - m };
  }, [rows]);

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold">Bornes produites</h1>
        <p className="text-[13px] text-[--k-muted]">
          Bornes validées en atelier. Le statut « parc » indique si elles
          apparaissent bien dans l'app Bornes du collègue.
        </p>
      </header>

      {/* Bannière sync */}
      {sync && (
        <div
          className={`rounded-xl border px-4 py-3 text-[13px] ${
            sync.snapshotError
              ? 'border-rose-200 bg-rose-50 text-rose-800'
              : 'border-[--k-border] bg-[--k-surface] text-[--k-text]'
          }`}
        >
          {sync.snapshotError ? (
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <div className="font-medium">API Bornes injoignable</div>
                <div className="text-[12px] mt-0.5">{sync.snapshotError}</div>
                <div className="text-[11px] mt-1 italic opacity-80">
                  Le matching est désactivé tant que l'API ne répond pas.
                </div>
              </div>
            </div>
          ) : sync.configured ? (
            <div className="flex items-center gap-2">
              <RefreshCcw className="h-4 w-4" />
              <span>
                <strong className="tabular-nums">{sync.snapshotCount}</strong> bornes
                indexées côté parc (cache 60s)
              </span>
            </div>
          ) : (
            <div className="text-[--k-muted]">
              Configuration API Bornes absente (BORNES_API_URL / BORNES_WS_TOKEN).
            </div>
          )}
        </div>
      )}

      {/* Filtres */}
      <section className="rounded-xl border border-[--k-border] bg-[--k-surface] p-3">
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

          <div className="inline-flex rounded-lg border border-[--k-border] overflow-hidden">
            {(['all', 'matched', 'unmatched'] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => {
                  setOffset(0);
                  setSyncFilter(v);
                }}
                className={`px-3 py-2 text-[12px] ${
                  syncFilter === v
                    ? 'bg-[--k-primary] text-white'
                    : 'bg-[--k-surface] text-[--k-text] hover:bg-[--k-surface-2]'
                }`}
              >
                {v === 'all' ? 'Toutes' : v === 'matched' ? 'Dans le parc' : 'Hors parc'}
              </button>
            ))}
          </div>

          {hasFilters && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setModel('');
                setSyncFilter('all');
                setOffset(0);
              }}
              className="text-[12px] text-[--k-muted] hover:text-[--k-text]"
            >
              Réinitialiser
            </button>
          )}
        </div>

        {/* Mini stats sur la page courante */}
        {rows.length > 0 && (
          <div className="mt-2 text-[11px] text-[--k-muted]">
            Page : {counts.matched} dans le parc · {counts.unmatched} hors parc
          </div>
        )}
      </section>

      {/* Liste */}
      <section className="rounded-xl border border-[--k-border] bg-[--k-surface] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-[--k-border] text-left text-[11px] uppercase tracking-wide text-[--k-muted]">
                <th className="px-4 py-2">N° interne</th>
                <th className="px-4 py-2">Modèle Factory</th>
                <th className="px-4 py-2">Validé</th>
                <th className="px-4 py-2">Opérateur</th>
                <th className="px-4 py-2 text-right">Composants</th>
                <th className="px-4 py-2">Parc Bornes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[--k-border]">
              {listQ.isLoading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-[--k-muted]">
                    Chargement…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-[--k-muted] italic">
                    Aucune borne produite{hasFilters ? ' pour ces filtres' : ''}.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="hover:bg-[--k-surface-2]/40 align-top">
                    <td className="px-4 py-2 font-mono">
                      <Link
                        to={`/produced-bornes/${r.id}`}
                        className="text-[--k-primary] hover:underline"
                      >
                        {r.internalNumber || (
                          <span className="text-[--k-muted] italic">—</span>
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
                        OF parent
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-[--k-muted]">
                      {r.completedAt
                        ? new Date(r.completedAt).toLocaleDateString('fr-FR')
                        : '—'}
                    </td>
                    <td className="px-4 py-2 max-w-[180px]">
                      <OperatorAvatar name={r.operatorName} size="sm" />
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {r.componentsInstalled}
                    </td>
                    <td className="px-4 py-2">
                      <ParcStatus row={r} />
                    </td>
                  </tr>
                ))
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
    </div>
  );
}

function ParcStatus({ row }: { row: ProducedRow }) {
  const m = row.parcMatch;
  if (m.error) {
    return (
      <span className="inline-flex items-center gap-1 text-[12px] text-[--k-muted]">
        <AlertCircle className="h-3.5 w-3.5" />
        Sync indispo
      </span>
    );
  }
  if (!m.found || !m.borne) {
    return (
      <span className="inline-flex items-center gap-1 text-[12px] text-rose-700">
        <AlertCircle className="h-3.5 w-3.5" />
        Non trouvé
      </span>
    );
  }
  const b = m.borne;
  return (
    <div className="text-[12px]">
      <div className="inline-flex items-center gap-1 text-emerald-700 font-medium">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Dans le parc
      </div>
      <div className="text-[--k-muted] mt-0.5">
        {b.gamme_nom && <span>{b.gamme_nom}</span>}
        {b.parc_nom && <span> · {b.parc_nom}</span>}
        {b.etat_nom && <span> · {b.etat_nom}</span>}
      </div>
      {(b.antenne_ville || b.client_enseigne) && (
        <div className="text-[--k-muted] flex items-center gap-1">
          <ExternalLink className="h-3 w-3" />
          {b.client_enseigne || b.antenne_ville}
        </div>
      )}
    </div>
  );
}
