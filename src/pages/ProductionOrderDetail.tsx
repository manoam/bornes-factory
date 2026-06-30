import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import api from '../services/api';

interface AssemblyOrder {
  id: string;
  internalNumber: string | null;
  status: string;
  _count?: { components: number };
}

interface ProductionOrder {
  id: string;
  model: string;
  quantity: number;
  status: 'DRAFT' | 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  reason: string | null;
  targetDate: string | null;
  createdByName: string | null;
  createdAt: string;
  assemblyOrders?: AssemblyOrder[];
}

interface Requirement {
  productId: string;
  reference: string;
  description: string | null;
  neededPerUnit: number;
  totalNeeded: number;
  available: number;
  missing: number;
}

interface RequirementsPayload {
  model: string;
  quantity: number;
  items: Requirement[];
  fullyAvailable: boolean;
  missingCount: number;
}

export default function ProductionOrderDetail() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();

  const orderQ = useQuery({
    queryKey: ['production-order', id],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: ProductionOrder }>(
        `/production-orders/${id}`,
      );
      return res.data.data;
    },
    enabled: !!id,
  });

  const reqQ = useQuery({
    queryKey: ['production-order-requirements', id],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: RequirementsPayload }>(
        `/production-orders/${id}/requirements`,
      );
      return res.data.data;
    },
    enabled: !!id,
    retry: false,
  });

  const planMutation = useMutation({
    mutationFn: async () => {
      await api.post(`/production-orders/${id}/plan`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['production-order', id] });
    },
  });

  if (orderQ.isLoading || !orderQ.data) {
    return <p className="text-[--k-muted]">Chargement…</p>;
  }
  const order = orderQ.data;

  return (
    <div className="space-y-4">
      <Link to="/production-orders" className="text-[12px] text-[--k-primary] inline-flex items-center gap-1">
        <ArrowLeft className="h-3 w-3" />
        Retour
      </Link>

      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">{order.model}</h1>
          <p className="text-[13px] text-[--k-muted]">
            {order.quantity} bornes · {order.reason || 'aucun motif'}
          </p>
        </div>
        {order.status === 'DRAFT' && (
          <button
            type="button"
            onClick={() => planMutation.mutate()}
            disabled={planMutation.isPending}
            className="rounded-lg bg-[--k-primary] text-white px-3 py-2 text-[13px] font-medium disabled:opacity-50"
          >
            {planMutation.isPending ? 'Planification…' : 'Planifier (créer les assemblages)'}
          </button>
        )}
      </header>

      <section className="rounded-xl border border-[--k-border] bg-[--k-surface]">
        <div className="px-4 py-3 border-b border-[--k-border] flex items-center justify-between">
          <h2 className="text-[14px] font-semibold">Besoins en composants</h2>
          {reqQ.data &&
            (reqQ.data.fullyAvailable ? (
              <span className="inline-flex items-center gap-1 text-[12px] text-emerald-700">
                <CheckCircle2 className="h-4 w-4" />
                Stock suffisant pour {order.quantity} bornes
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[12px] text-amber-700">
                <AlertTriangle className="h-4 w-4" />
                {reqQ.data.missingCount} composant(s) manquant(s)
              </span>
            ))}
        </div>
        {reqQ.isLoading ? (
          <p className="p-4 text-[13px] text-[--k-muted] flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Lecture du stock côté Stock API…
          </p>
        ) : reqQ.error ? (
          <p className="p-4 text-[13px] text-rose-700">
            Erreur :{' '}
            {(reqQ.error as { response?: { data?: { error?: string } } } | null)?.response?.data
              ?.error || 'impossible de calculer les besoins'}
          </p>
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-[--k-border] text-left text-[11px] uppercase tracking-wide text-[--k-muted]">
                <th className="px-4 py-2">Référence</th>
                <th className="px-4 py-2">Description</th>
                <th className="px-4 py-2 text-right">Par borne</th>
                <th className="px-4 py-2 text-right">Total nécessaire</th>
                <th className="px-4 py-2 text-right">Dispo Stock</th>
                <th className="px-4 py-2 text-right">Manquant</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[--k-border]">
              {(reqQ.data?.items || []).map((it) => (
                <tr key={it.productId} className={it.missing > 0 ? 'bg-amber-50/40' : ''}>
                  <td className="px-4 py-2 font-mono text-[11px]">{it.reference}</td>
                  <td className="px-4 py-2 truncate max-w-[300px]">{it.description || '—'}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{it.neededPerUnit}</td>
                  <td className="px-4 py-2 text-right tabular-nums font-medium">{it.totalNeeded}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{it.available}</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {it.missing > 0 ? (
                      <span className="text-rose-700 font-semibold">−{it.missing}</span>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="rounded-xl border border-[--k-border] bg-[--k-surface]">
        <div className="px-4 py-3 border-b border-[--k-border]">
          <h2 className="text-[14px] font-semibold">
            Assemblages ({order.assemblyOrders?.length || 0})
          </h2>
        </div>
        {!order.assemblyOrders || order.assemblyOrders.length === 0 ? (
          <p className="p-4 text-[13px] text-[--k-muted] italic">
            Aucun assemblage. Cliquez sur « Planifier » pour générer un assemblage par borne.
          </p>
        ) : (
          <ul className="divide-y divide-[--k-border]">
            {order.assemblyOrders.map((a, i) => (
              <li key={a.id}>
                <Link
                  to={`/assemblies/${a.id}`}
                  className="flex items-center gap-3 px-4 py-2 hover:bg-[--k-surface-2]"
                >
                  <span className="font-mono text-[12px] text-[--k-muted] w-12">#{i + 1}</span>
                  <span className="font-medium flex-1">
                    {a.internalNumber || <span className="text-[--k-muted] italic">non attribué</span>}
                  </span>
                  <span className="text-[11px] text-[--k-muted]">
                    {a._count?.components || 0} composants
                  </span>
                  <span className="text-[11px] inline-block rounded-full bg-slate-100 px-2 py-0.5">
                    {a.status}
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
