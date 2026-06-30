import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ClipboardList, Wrench, CheckCircle2 } from 'lucide-react';
import api from '../services/api';

interface ProductionOrder {
  id: string;
  model: string;
  quantity: number;
  status: 'DRAFT' | 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  createdAt: string;
  _count?: { assemblyOrders: number };
}

const STATUS_LABEL: Record<ProductionOrder['status'], string> = {
  DRAFT: 'Brouillon',
  PLANNED: 'Planifié',
  IN_PROGRESS: 'En cours',
  COMPLETED: 'Terminé',
  CANCELLED: 'Annulé',
};

export default function Dashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ['production-orders'],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: ProductionOrder[] }>(
        '/production-orders',
      );
      return res.data.data;
    },
  });

  const orders = data || [];
  const inProgress = orders.filter((o) => o.status === 'IN_PROGRESS' || o.status === 'PLANNED').length;
  const completed = orders.filter((o) => o.status === 'COMPLETED').length;

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold">Tableau de bord</h1>
        <p className="text-[13px] text-[--k-muted]">
          État des opérations d'atelier en cours.
        </p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Kpi label="Ordres ouverts" value={inProgress} Icon={ClipboardList} color="text-blue-700" />
        <Kpi label="En atelier" value={orders.filter((o) => o.status === 'IN_PROGRESS').length} Icon={Wrench} color="text-amber-700" />
        <Kpi label="Terminés" value={completed} Icon={CheckCircle2} color="text-emerald-700" />
      </div>

      <section className="rounded-xl border border-[--k-border] bg-[--k-surface]">
        <div className="px-4 py-3 border-b border-[--k-border] flex items-center justify-between">
          <h2 className="text-[14px] font-semibold">Derniers ordres de fabrication</h2>
          <Link to="/production-orders" className="text-[12px] text-[--k-primary]">
            Voir tous →
          </Link>
        </div>
        {isLoading ? (
          <p className="p-4 text-[13px] text-[--k-muted]">Chargement…</p>
        ) : orders.length === 0 ? (
          <p className="p-4 text-[13px] text-[--k-muted] italic">
            Aucun ordre de fabrication pour le moment.
          </p>
        ) : (
          <ul className="divide-y divide-[--k-border]">
            {orders.slice(0, 8).map((o) => (
              <li key={o.id}>
                <Link
                  to={`/production-orders/${o.id}`}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-[--k-surface-2]"
                >
                  <span className="font-medium flex-1 truncate">{o.model}</span>
                  <span className="text-[12px] text-[--k-muted]">
                    {o.quantity} bornes · {o._count?.assemblyOrders ?? 0} assemblées
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
    </div>
  );
}

function Kpi({
  label,
  value,
  Icon,
  color,
}: {
  label: string;
  value: number;
  Icon: typeof ClipboardList;
  color: string;
}) {
  return (
    <div className="rounded-xl border border-[--k-border] bg-[--k-surface] p-4 flex items-center gap-3">
      <Icon className={`h-7 w-7 ${color}`} />
      <div>
        <div className="text-[11px] uppercase tracking-wide text-[--k-muted]">{label}</div>
        <div className="text-xl font-semibold tabular-nums">{value}</div>
      </div>
    </div>
  );
}
