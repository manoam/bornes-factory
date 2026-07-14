import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ClipboardList,
  Wrench,
  CheckCircle2,
  PackageCheck,
  AlertCircle,
  Plus,
  Factory,
  Loader2,
} from 'lucide-react';
import api from '../services/api';

// ─── Types ───────────────────────────────────────────────────────────────

interface DashboardData {
  production: {
    ordersOpen: number;
    inWorkshop: number;
    completed: number;
    byStatus: Record<string, number>;
  };
  parc: {
    producedTotal: number;
    syncedInParc: number;
    notInParc: number;
    syncError: string | null;
  };
  cadence30d: { date: string; count: number }[];
  myInProgress: {
    id: string;
    internalNumber: string | null;
    status: 'IN_PROGRESS' | 'TESTING';
    startedAt: string | null;
    productionOrder: { id: string; model: string };
  }[];
}

// ─── Page ────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: DashboardData }>(
        '/dashboard/stats',
      );
      return res.data.data;
    },
  });

  if (isLoading || !data) {
    return (
      <div className="p-6 flex items-center gap-2 text-[--k-muted]">
        <Loader2 className="h-4 w-4 animate-spin" />
        Chargement du tableau de bord…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold">Tableau de bord</h1>
        <p className="text-[13px] text-[--k-muted]">
          Vue d'ensemble de la production et du parc.
        </p>
      </header>

      {/* KPIs Production */}
      <section className="space-y-2">
        <h2 className="text-[11px] uppercase tracking-wide text-[--k-muted] font-semibold">
          Production
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Kpi
            label="Ordres ouverts"
            value={data.production.ordersOpen}
            Icon={ClipboardList}
            color="text-blue-700"
            bg="bg-blue-50"
            to="/assemblies"
          />
          <Kpi
            label="En atelier"
            value={data.production.inWorkshop}
            Icon={Wrench}
            color="text-amber-700"
            bg="bg-amber-50"
            to="/assemblies?status=IN_PROGRESS,TESTING"
          />
          <Kpi
            label="Terminés"
            value={data.production.completed}
            Icon={CheckCircle2}
            color="text-emerald-700"
            bg="bg-emerald-50"
            to="/assemblies?status=COMPLETED"
          />
        </div>
      </section>

      {/* KPIs Parc */}
      <section className="space-y-2">
        <h2 className="text-[11px] uppercase tracking-wide text-[--k-muted] font-semibold">
          Parc
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Kpi
            label="Bornes produites"
            value={data.parc.producedTotal}
            Icon={PackageCheck}
            color="text-indigo-700"
            bg="bg-indigo-50"
            to="/produced-bornes"
          />
          <Kpi
            label="Synchronisées"
            value={data.parc.syncedInParc}
            Icon={CheckCircle2}
            color="text-emerald-700"
            bg="bg-emerald-50"
            to="/produced-bornes?sync=matched"
          />
          <Kpi
            label="Hors parc"
            value={data.parc.notInParc}
            Icon={AlertCircle}
            color={data.parc.notInParc > 0 ? 'text-rose-700' : 'text-slate-600'}
            bg={data.parc.notInParc > 0 ? 'bg-rose-50' : 'bg-slate-50'}
            to="/produced-bornes?sync=unmatched"
            warning={data.parc.notInParc > 0}
          />
        </div>
        {data.parc.syncError && (
          <div className="text-[11px] text-amber-700 italic">
            ⚠ {data.parc.syncError} — le matching parc est en attente.
          </div>
        )}
      </section>

      {/* Raccourcis */}
      <section className="flex flex-wrap gap-2">
        <QuickAction to="/assemblies" Icon={Plus} label="Nouvelle commande" primary />
        <QuickAction to="/assemblies?mine=true" Icon={Wrench} label="Mon atelier" />
        <QuickAction to="/produced-bornes" Icon={PackageCheck} label="Bornes produites" />
      </section>

      {/* Cadence 30j */}
      <CadenceSection cadence={data.cadence30d} />

      {/* Mes assemblages en cours */}
      {data.myInProgress.length > 0 && (
        <MyInProgressSection items={data.myInProgress} />
      )}

      {/* Derniers ordres (via une query dédiée) */}
      <RecentOrders />
    </div>
  );
}

// ─── KPI card ────────────────────────────────────────────────────────────

function Kpi({
  label,
  value,
  Icon,
  color,
  bg,
  to,
  warning = false,
}: {
  label: string;
  value: number;
  Icon: typeof ClipboardList;
  color: string;
  bg: string;
  to?: string;
  warning?: boolean;
}) {
  const content = (
    <div
      className={`rounded-xl border ${warning ? 'border-rose-200' : 'border-[--k-border]'} bg-[--k-surface] p-4 flex items-center gap-3 transition ${to ? 'hover:border-[--k-primary]/60 hover:shadow-sm cursor-pointer' : ''}`}
    >
      <div className={`shrink-0 h-10 w-10 rounded-lg ${bg} flex items-center justify-center`}>
        <Icon className={`h-5 w-5 ${color}`} />
      </div>
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wide text-[--k-muted] font-semibold">
          {label}
        </div>
        <div className={`text-2xl font-bold tabular-nums ${color}`}>{value}</div>
      </div>
    </div>
  );
  if (to) return <Link to={to}>{content}</Link>;
  return content;
}

// ─── Quick action button ─────────────────────────────────────────────────

function QuickAction({
  to,
  Icon,
  label,
  primary = false,
}: {
  to: string;
  Icon: typeof Plus;
  label: string;
  primary?: boolean;
}) {
  return (
    <Link
      to={to}
      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-medium border transition ${
        primary
          ? 'bg-[--k-primary] text-white border-[--k-primary] hover:brightness-110'
          : 'bg-[--k-surface] text-[--k-text] border-[--k-border] hover:bg-[--k-surface-2]'
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </Link>
  );
}

// ─── Cadence sparkline ───────────────────────────────────────────────────

function CadenceSection({ cadence }: { cadence: { date: string; count: number }[] }) {
  const total = cadence.reduce((s, d) => s + d.count, 0);
  const max = Math.max(1, ...cadence.map((d) => d.count));

  const firstLabel = useMemo(() => {
    const d = new Date(cadence[0]?.date || Date.now());
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
  }, [cadence]);
  const lastLabel = useMemo(() => {
    const d = new Date(cadence[cadence.length - 1]?.date || Date.now());
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
  }, [cadence]);

  return (
    <section className="rounded-xl border border-[--k-border] bg-[--k-surface] p-4">
      <div className="flex items-baseline justify-between mb-3">
        <div>
          <h2 className="text-[14px] font-semibold">Cadence 30 jours</h2>
          <p className="text-[12px] text-[--k-muted]">
            {total} borne{total > 1 ? 's' : ''} validée{total > 1 ? 's' : ''} sur la période
          </p>
        </div>
      </div>

      <div className="flex items-end gap-[3px] h-16">
        {cadence.map((d) => {
          const h = d.count === 0 ? 4 : Math.max(4, Math.round((d.count / max) * 64));
          return (
            <div
              key={d.date}
              className={`flex-1 rounded-t ${
                d.count === 0 ? 'bg-[--k-surface-2]' : 'bg-[--k-primary]/70 hover:bg-[--k-primary]'
              } transition`}
              style={{ height: `${h}px` }}
              title={`${new Date(d.date).toLocaleDateString('fr-FR')} · ${d.count} borne${d.count > 1 ? 's' : ''}`}
            />
          );
        })}
      </div>

      <div className="flex justify-between mt-2 text-[10px] text-[--k-muted] tabular-nums">
        <span>{firstLabel}</span>
        <span>{lastLabel}</span>
      </div>
    </section>
  );
}

// ─── My in-progress ──────────────────────────────────────────────────────

function MyInProgressSection({
  items,
}: {
  items: DashboardData['myInProgress'];
}) {
  return (
    <section className="rounded-xl border border-[--k-border] bg-[--k-surface]">
      <header className="px-4 py-3 border-b border-[--k-border] flex items-center justify-between">
        <h2 className="text-[14px] font-semibold">
          Mes assemblages en cours ({items.length})
        </h2>
        <Link to="/assemblies?mine=true" className="text-[12px] text-[--k-primary]">
          Tout voir →
        </Link>
      </header>
      <ul className="divide-y divide-[--k-border]">
        {items.map((a) => (
          <li key={a.id}>
            <Link
              to={`/assemblies/${a.id}`}
              className="flex items-center gap-3 px-4 py-2.5 hover:bg-[--k-surface-2]"
            >
              <span className="font-mono text-[13px] font-medium w-24 truncate">
                {a.internalNumber || (
                  <span className="text-[--k-muted] italic">—</span>
                )}
              </span>
              <span className="flex-1 truncate text-[13px]">
                {a.productionOrder.model}
              </span>
              <span
                className={`text-[11px] rounded-full px-2 py-0.5 ${
                  a.status === 'TESTING'
                    ? 'bg-blue-100 text-blue-800'
                    : 'bg-amber-100 text-amber-800'
                }`}
              >
                {a.status === 'TESTING' ? 'En test' : 'En cours'}
              </span>
              {a.startedAt && (
                <span className="text-[11px] text-[--k-muted] tabular-nums">
                  {new Date(a.startedAt).toLocaleDateString('fr-FR', {
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ─── Recent orders (existing query, reused) ──────────────────────────────

interface ProductionOrderLite {
  id: string;
  model: string;
  quantity: number;
  status: 'DRAFT' | 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  createdAt: string;
  _count?: { assemblyOrders: number };
}

const STATUS_LABEL: Record<ProductionOrderLite['status'], string> = {
  DRAFT: 'Brouillon',
  PLANNED: 'Planifié',
  IN_PROGRESS: 'En cours',
  COMPLETED: 'Terminé',
  CANCELLED: 'Annulé',
};

function RecentOrders() {
  const { data, isLoading } = useQuery({
    queryKey: ['production-orders'],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: ProductionOrderLite[] }>(
        '/production-orders',
      );
      return res.data.data;
    },
  });
  const orders = (data || []).slice(0, 5);

  return (
    <section className="rounded-xl border border-[--k-border] bg-[--k-surface]">
      <header className="px-4 py-3 border-b border-[--k-border] flex items-center justify-between">
        <h2 className="text-[14px] font-semibold">Dernières commandes</h2>
        <Link to="/assemblies" className="text-[12px] text-[--k-primary]">
          Tout voir →
        </Link>
      </header>
      {isLoading ? (
        <p className="p-4 text-[13px] text-[--k-muted]">Chargement…</p>
      ) : orders.length === 0 ? (
        <div className="p-6 text-center">
          <Factory className="h-6 w-6 text-[--k-muted] mx-auto mb-2" />
          <p className="text-[13px] text-[--k-muted] italic">
            Aucune commande pour l'instant.
          </p>
          <Link
            to="/assemblies"
            className="mt-2 inline-flex items-center gap-1 text-[12px] text-[--k-primary]"
          >
            <Plus className="h-3 w-3" />
            Créer la première
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-[--k-border]">
          {orders.map((o) => (
            <li key={o.id}>
              <Link
                to={`/assemblies?model=${encodeURIComponent(o.model)}`}
                className="flex items-center gap-3 px-4 py-2.5 hover:bg-[--k-surface-2]"
              >
                <span className="font-medium flex-1 truncate">{o.model}</span>
                <span className="text-[12px] text-[--k-muted]">
                  {o.quantity} borne{o.quantity > 1 ? 's' : ''} · {o._count?.assemblyOrders ?? 0} à créer
                </span>
                <span
                  className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                    o.status === 'COMPLETED'
                      ? 'bg-emerald-50 text-emerald-700'
                      : o.status === 'IN_PROGRESS'
                        ? 'bg-amber-50 text-amber-700'
                        : 'bg-slate-50 text-slate-700'
                  }`}
                >
                  {STATUS_LABEL[o.status]}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
