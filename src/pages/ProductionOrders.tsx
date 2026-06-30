import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import api from '../services/api';

interface ProductionOrder {
  id: string;
  model: string;
  quantity: number;
  priority: 'LOW' | 'NORMAL' | 'HIGH';
  status: 'DRAFT' | 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  reason: string | null;
  targetDate: string | null;
  createdByName: string | null;
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

const PRIORITY_LABEL = { LOW: 'Basse', NORMAL: 'Normale', HIGH: 'Haute' };

export default function ProductionOrders() {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['production-orders'],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: ProductionOrder[] }>(
        '/production-orders',
      );
      return res.data.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (payload: {
      model: string;
      quantity: number;
      priority: 'LOW' | 'NORMAL' | 'HIGH';
      reason?: string;
      targetDate?: string;
    }) => {
      const res = await api.post<{ success: boolean; data: ProductionOrder }>(
        '/production-orders',
        payload,
      );
      return res.data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['production-orders'] });
      setCreateOpen(false);
    },
  });

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Ordres de fabrication</h1>
          <p className="text-[13px] text-[--k-muted]">
            Décisions de fabriquer N bornes d'un modèle.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[--k-primary] text-white px-3 py-2 text-[13px] font-medium"
        >
          <Plus className="h-4 w-4" /> Nouvel ordre
        </button>
      </header>

      <div className="rounded-xl border border-[--k-border] bg-[--k-surface] overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-[--k-border] text-left text-[11px] uppercase tracking-wide text-[--k-muted]">
              <th className="px-4 py-2">Modèle</th>
              <th className="px-4 py-2">Quantité</th>
              <th className="px-4 py-2">Statut</th>
              <th className="px-4 py-2">Priorité</th>
              <th className="px-4 py-2">Date cible</th>
              <th className="px-4 py-2">Créé par</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[--k-border]">
            {isLoading ? (
              <tr>
                <td colSpan={7} className="px-4 py-4 text-[--k-muted]">
                  Chargement…
                </td>
              </tr>
            ) : (data || []).length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-4 text-[--k-muted] italic">
                  Aucun ordre de fabrication.
                </td>
              </tr>
            ) : (
              (data || []).map((o) => (
                <tr key={o.id} className="hover:bg-[--k-surface-2]">
                  <td className="px-4 py-2 font-medium">
                    <Link to={`/production-orders/${o.id}`} className="text-[--k-primary]">
                      {o.model}
                    </Link>
                  </td>
                  <td className="px-4 py-2 tabular-nums">
                    {o._count?.assemblyOrders ?? 0} / {o.quantity}
                  </td>
                  <td className="px-4 py-2">
                    <span className="inline-block rounded-full px-2 py-0.5 text-[11px] font-medium bg-slate-100 text-slate-700">
                      {STATUS_LABEL[o.status]}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-[--k-muted]">{PRIORITY_LABEL[o.priority]}</td>
                  <td className="px-4 py-2 text-[--k-muted]">
                    {o.targetDate
                      ? new Date(o.targetDate).toLocaleDateString('fr-FR')
                      : '—'}
                  </td>
                  <td className="px-4 py-2 text-[--k-muted]">{o.createdByName || '—'}</td>
                  <td className="px-4 py-2 text-right text-[--k-muted]">
                    {new Date(o.createdAt).toLocaleDateString('fr-FR')}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {createOpen && (
        <CreateModal
          onClose={() => setCreateOpen(false)}
          onSubmit={(payload) => createMutation.mutate(payload)}
          submitting={createMutation.isPending}
          error={
            (createMutation.error as { response?: { data?: { error?: string } } } | null)?.response
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
  onSubmit: (payload: {
    model: string;
    quantity: number;
    priority: 'LOW' | 'NORMAL' | 'HIGH';
    reason?: string;
    targetDate?: string;
  }) => void;
  submitting: boolean;
  error: string | null;
}) {
  const [model, setModel] = useState('Borne Kalifun');
  const [quantity, setQuantity] = useState(1);
  const [priority, setPriority] = useState<'LOW' | 'NORMAL' | 'HIGH'>('NORMAL');
  const [reason, setReason] = useState('');
  const [targetDate, setTargetDate] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-[--k-surface] rounded-xl w-full max-w-md shadow-xl">
        <div className="px-4 py-3 border-b border-[--k-border] flex items-center justify-between">
          <h2 className="font-semibold">Nouvel ordre de fabrication</h2>
          <button onClick={onClose} className="text-[--k-muted]" type="button">
            ×
          </button>
        </div>
        <div className="p-4 space-y-3">
          <Field label="Modèle">
            <input
              className="input-field"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="ex : Borne Kalifun"
            />
          </Field>
          <Field label="Quantité">
            <input
              type="number"
              min={1}
              className="input-field"
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
            />
          </Field>
          <Field label="Priorité">
            <select
              className="input-field"
              value={priority}
              onChange={(e) => setPriority(e.target.value as 'LOW' | 'NORMAL' | 'HIGH')}
            >
              <option value="LOW">Basse</option>
              <option value="NORMAL">Normale</option>
              <option value="HIGH">Haute</option>
            </select>
          </Field>
          <Field label="Date cible">
            <input
              type="date"
              className="input-field"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
            />
          </Field>
          <Field label="Motif">
            <input
              className="input-field"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="ex : saison été, commande client X"
            />
          </Field>
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
                model: model.trim(),
                quantity,
                priority,
                reason: reason.trim() || undefined,
                targetDate: targetDate ? new Date(targetDate).toISOString() : undefined,
              })
            }
            disabled={!model.trim() || quantity < 1 || submitting}
            className="rounded-lg bg-[--k-primary] text-white px-3 py-2 text-[13px] font-medium disabled:opacity-50"
          >
            {submitting ? 'Création…' : 'Créer'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[12px] font-medium text-[--k-muted] mb-1">{label}</label>
      {children}
    </div>
  );
}
