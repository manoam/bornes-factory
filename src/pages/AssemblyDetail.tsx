import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Loader2,
  Play,
  Beaker,
  CheckCircle2,
  XCircle,
  Trash2,
  Camera,
  Search,
  AlertTriangle,
} from 'lucide-react';
import api from '../services/api';
import QrScannerModal, { type ParsedQr } from '../components/QrScannerModal';

// ─── Types ───────────────────────────────────────────────────────────────

type Status = 'DRAFT' | 'IN_PROGRESS' | 'TESTING' | 'COMPLETED' | 'CANCELLED';

interface AssemblyOrder {
  id: string;
  productionOrderId: string;
  internalNumber: string | null;
  status: Status;
  operatorId: string | null;
  operatorName: string | null;
  notes: string | null;
  qualityChecks: string[] | null;
  startedAt: string | null;
  completedAt: string | null;
  productionOrder: { id: string; model: string; quantity: number };
  components: AssemblyComponent[];
}

interface AssemblyComponent {
  id: string;
  productId: string;
  productReference: string;
  serialNumber: string | null;
  quantity: number;
  installedAt: string | null;
}

interface ChecklistLine {
  productId: string;
  productReference: string;
  productDescription: string | null;
  hasSerialNumber: boolean;
  imageUrl: string | null;
  requiredQty: number;
  installedQty: number;
  complete: boolean;
  installed: {
    id: string;
    serialNumber: string | null;
    quantity: number;
    installedAt: string | null;
  }[];
}

interface ChecklistPayload {
  model: string;
  lines: ChecklistLine[];
  extras: AssemblyComponent[];
  requiredCount: number;
  completeCount: number;
  qualityChecks: { id: string; label: string }[];
}

interface AssemblyEvent {
  id: string;
  eventType: string;
  payload: Record<string, unknown> | null;
  actorName: string | null;
  createdAt: string;
}

// ─── Status meta ─────────────────────────────────────────────────────────

const STATUS_META: Record<Status, { label: string; cls: string }> = {
  DRAFT: { label: 'Brouillon', cls: 'bg-slate-100 text-slate-700' },
  IN_PROGRESS: { label: 'En cours', cls: 'bg-amber-100 text-amber-800' },
  TESTING: { label: 'En test', cls: 'bg-blue-100 text-blue-800' },
  COMPLETED: { label: 'Terminé', cls: 'bg-emerald-100 text-emerald-800' },
  CANCELLED: { label: 'Annulé', cls: 'bg-rose-100 text-rose-800' },
};

// ─── Page ────────────────────────────────────────────────────────────────

export default function AssemblyDetail() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();

  const orderQ = useQuery({
    queryKey: ['assembly-order', id],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: AssemblyOrder }>(
        `/assembly-orders/${id}`,
      );
      return res.data.data;
    },
    enabled: !!id,
  });

  const checklistQ = useQuery({
    queryKey: ['assembly-checklist', id],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: ChecklistPayload }>(
        `/assembly-orders/${id}/checklist`,
      );
      return res.data.data;
    },
    enabled: !!id,
    retry: false,
  });

  const historyQ = useQuery({
    queryKey: ['assembly-history', id],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: AssemblyEvent[] }>(
        `/assembly-orders/${id}/history`,
      );
      return res.data.data;
    },
    enabled: !!id,
  });

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['assembly-order', id] });
    qc.invalidateQueries({ queryKey: ['assembly-checklist', id] });
    qc.invalidateQueries({ queryKey: ['assembly-history', id] });
  };

  const transitionM = useMutation({
    mutationFn: async (payload: {
      to: 'IN_PROGRESS' | 'TESTING' | 'COMPLETED' | 'CANCELLED';
      internalNumber?: string;
      reason?: string;
    }) => {
      const res = await api.post<{
        success: boolean;
        data: { order: AssemblyOrder; movementsCreated?: number };
      }>(`/assembly-orders/${id}/transition`, payload);
      return res.data.data;
    },
    onSuccess: invalidateAll,
  });

  const updateM = useMutation({
    mutationFn: async (payload: {
      notes?: string | null;
      internalNumber?: string | null;
      qualityChecks?: string[];
    }) => {
      await api.patch(`/assembly-orders/${id}`, payload);
    },
    onSuccess: invalidateAll,
  });

  if (orderQ.isLoading || !orderQ.data) {
    return (
      <div className="p-6 flex items-center gap-2 text-[--k-muted]">
        <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
      </div>
    );
  }
  const order = orderQ.data;
  const isClosed = order.status === 'COMPLETED' || order.status === 'CANCELLED';

  return (
    <div className="space-y-4">
      <Link
        to={`/production-orders/${order.productionOrderId}`}
        className="text-[12px] text-[--k-primary] inline-flex items-center gap-1"
      >
        <ArrowLeft className="h-3 w-3" />
        Retour à l'ordre de fabrication
      </Link>

      <AssemblyHeader
        order={order}
        transitionPending={transitionM.isPending}
        transitionError={
          (transitionM.error as { response?: { data?: { error?: string } } } | null)?.response
            ?.data?.error || null
        }
        onTransition={(to, extras) => transitionM.mutate({ to, ...extras })}
        onChangeInternalNumber={(value) =>
          updateM.mutate({ internalNumber: value || null })
        }
      />

      {checklistQ.isError && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-[13px] text-rose-700">
          Impossible de charger la nomenclature :{' '}
          {(checklistQ.error as { response?: { data?: { error?: string } } } | null)?.response
            ?.data?.error || 'erreur Stock'}
        </div>
      )}

      {checklistQ.data && !isClosed && (
        <ChecklistSection
          assemblyId={order.id}
          status={order.status}
          checklist={checklistQ.data}
          onChanged={invalidateAll}
        />
      )}

      {checklistQ.data && isClosed && (
        <ReadOnlyChecklistSection checklist={checklistQ.data} />
      )}

      <NotesAndQualitySection
        order={order}
        qualityChecks={checklistQ.data?.qualityChecks || []}
        readOnly={isClosed}
        onSave={updateM.mutate}
      />

      <HistorySection events={historyQ.data || []} />
    </div>
  );
}

// ─── Header ──────────────────────────────────────────────────────────────

function AssemblyHeader({
  order,
  transitionPending,
  transitionError,
  onTransition,
  onChangeInternalNumber,
}: {
  order: AssemblyOrder;
  transitionPending: boolean;
  transitionError: string | null;
  onTransition: (
    to: 'IN_PROGRESS' | 'TESTING' | 'COMPLETED' | 'CANCELLED',
    extras?: { internalNumber?: string; reason?: string },
  ) => void;
  onChangeInternalNumber: (value: string) => void;
}) {
  const [editingInternal, setEditingInternal] = useState(false);
  const [internalDraft, setInternalDraft] = useState(order.internalNumber || '');
  const [completePromptOpen, setCompletePromptOpen] = useState(false);
  const meta = STATUS_META[order.status];
  const isClosed = order.status === 'COMPLETED' || order.status === 'CANCELLED';

  useEffect(() => {
    setInternalDraft(order.internalNumber || '');
  }, [order.internalNumber]);

  return (
    <section className="rounded-xl border border-[--k-border] bg-[--k-surface] p-4 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold truncate">
            {order.productionOrder.model}
          </h1>
          <p className="text-[12px] text-[--k-muted]">
            Assemblage · OF de {order.productionOrder.quantity} bornes
          </p>
        </div>
        <span
          className={`inline-flex rounded-full px-2.5 py-1 text-[12px] font-semibold ${meta.cls}`}
        >
          {meta.label}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[13px]">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-[--k-muted] mb-0.5">
            Numéro interne
          </div>
          {editingInternal && !isClosed ? (
            <div className="flex gap-1">
              <input
                className="input-field"
                value={internalDraft}
                onChange={(e) => setInternalDraft(e.target.value)}
                placeholder="ex : S401"
                autoFocus
              />
              <button
                type="button"
                onClick={() => {
                  onChangeInternalNumber(internalDraft.trim());
                  setEditingInternal(false);
                }}
                className="rounded-lg bg-[--k-primary] text-white px-3 text-[12px]"
              >
                OK
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => !isClosed && setEditingInternal(true)}
              className="font-mono font-medium hover:underline disabled:cursor-default"
              disabled={isClosed}
            >
              {order.internalNumber || (
                <span className="italic text-[--k-muted]">non attribué</span>
              )}
            </button>
          )}
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-[--k-muted] mb-0.5">
            Opérateur
          </div>
          {order.operatorName || <span className="italic text-[--k-muted]">—</span>}
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-[--k-muted] mb-0.5">
            Démarré le
          </div>
          {order.startedAt
            ? new Date(order.startedAt).toLocaleString('fr-FR')
            : '—'}
        </div>
      </div>

      {!isClosed && (
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[--k-border]">
          {order.status === 'DRAFT' && (
            <button
              type="button"
              onClick={() => onTransition('IN_PROGRESS')}
              disabled={transitionPending}
              className="rounded-lg bg-[--k-primary] text-white px-3 py-2 text-[13px] font-medium inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              <Play className="h-4 w-4" /> Démarrer l'assemblage
            </button>
          )}
          {order.status === 'IN_PROGRESS' && (
            <button
              type="button"
              onClick={() => onTransition('TESTING')}
              disabled={transitionPending}
              className="rounded-lg bg-[--k-primary] text-white px-3 py-2 text-[13px] font-medium inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              <Beaker className="h-4 w-4" /> Lancer les tests
            </button>
          )}
          {order.status === 'TESTING' && (
            <button
              type="button"
              onClick={() => setCompletePromptOpen(true)}
              disabled={transitionPending}
              className="rounded-lg bg-emerald-600 text-white px-3 py-2 text-[13px] font-medium inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              <CheckCircle2 className="h-4 w-4" /> Valider la borne
            </button>
          )}
          {order.status === 'TESTING' && (
            <button
              type="button"
              onClick={() => onTransition('IN_PROGRESS')}
              disabled={transitionPending}
              className="rounded-lg border border-[--k-border] px-3 py-2 text-[13px] font-medium"
            >
              Retour assemblage
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              const reason = window.prompt("Motif d'annulation (facultatif) ?") || '';
              if (window.confirm("Annuler cet assemblage ? L'action est définitive.")) {
                onTransition('CANCELLED', { reason });
              }
            }}
            disabled={transitionPending}
            className="rounded-lg border border-rose-200 text-rose-700 px-3 py-2 text-[13px] font-medium inline-flex items-center gap-1.5"
          >
            <XCircle className="h-4 w-4" /> Annuler
          </button>
        </div>
      )}

      {transitionError && (
        <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-[12px] text-rose-700 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          {transitionError}
        </div>
      )}

      {completePromptOpen && (
        <CompletePrompt
          initial={order.internalNumber || ''}
          onCancel={() => setCompletePromptOpen(false)}
          onConfirm={(internalNumber) => {
            setCompletePromptOpen(false);
            onTransition('COMPLETED', { internalNumber });
          }}
        />
      )}
    </section>
  );
}

function CompletePrompt({
  initial,
  onCancel,
  onConfirm,
}: {
  initial: string;
  onCancel: () => void;
  onConfirm: (internalNumber: string) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-[--k-surface] rounded-xl w-full max-w-sm shadow-xl p-4">
        <h2 className="font-semibold mb-2">Valider la borne</h2>
        <p className="text-[13px] text-[--k-muted] mb-3">
          Confirmez le numéro interne. À la validation, les mouvements de
          sortie de stock seront générés.
        </p>
        <input
          className="input-field"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="ex : S401"
          autoFocus
        />
        <div className="flex justify-end gap-2 mt-3">
          <button
            type="button"
            className="rounded-lg border border-[--k-border] px-3 py-2 text-[13px]"
            onClick={onCancel}
          >
            Annuler
          </button>
          <button
            type="button"
            className="rounded-lg bg-emerald-600 text-white px-3 py-2 text-[13px] font-medium disabled:opacity-50"
            onClick={() => onConfirm(value.trim())}
            disabled={!value.trim()}
          >
            Valider
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Checklist section ───────────────────────────────────────────────────

function ChecklistSection({
  assemblyId,
  status,
  checklist,
  onChanged,
}: {
  assemblyId: string;
  status: Status;
  checklist: ChecklistPayload;
  onChanged: () => void;
}) {
  const editable = status === 'DRAFT' || status === 'IN_PROGRESS';

  return (
    <section className="rounded-xl border border-[--k-border] bg-[--k-surface]">
      <header className="px-4 py-3 border-b border-[--k-border] flex items-center justify-between">
        <h2 className="text-[14px] font-semibold">
          Composants à installer ({checklist.lines.length})
        </h2>
        <span className="text-[12px] text-[--k-muted] tabular-nums">
          {checklist.completeCount} / {checklist.requiredCount} complets
        </span>
      </header>

      <div className="divide-y divide-[--k-border]">
        {checklist.lines.map((line) => (
          <ChecklistRow
            key={line.productId}
            assemblyId={assemblyId}
            line={line}
            editable={editable}
            onChanged={onChanged}
          />
        ))}
      </div>

      {checklist.extras.length > 0 && (
        <div className="border-t border-[--k-border] px-4 py-3">
          <h3 className="text-[12px] uppercase tracking-wide text-[--k-muted] mb-2">
            Composants en plus ({checklist.extras.length})
          </h3>
          <ul className="space-y-1 text-[13px]">
            {checklist.extras.map((c) => (
              <li key={c.id} className="flex items-center gap-2">
                <span className="font-mono text-[11px] text-[--k-muted]">
                  {c.productReference}
                </span>
                <span className="text-[--k-muted]">
                  {c.serialNumber || `qté ${c.quantity}`}
                </span>
                {editable && (
                  <RemoveComponentBtn
                    assemblyId={assemblyId}
                    componentId={c.id}
                    onDeleted={onChanged}
                  />
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function ChecklistRow({
  assemblyId,
  line,
  editable,
  onChanged,
}: {
  assemblyId: string;
  line: ChecklistLine;
  editable: boolean;
  onChanged: () => void;
}) {
  const [serial, setSerial] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addM = useMutation({
    mutationFn: async (payload: {
      productId: string;
      productReference: string;
      serialNumber?: string | null;
      quantity?: number;
    }) => {
      await api.post(`/assembly-orders/${assemblyId}/components`, payload);
    },
    onSuccess: () => {
      setSerial('');
      setError(null);
      onChanged();
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      setError(err.response?.data?.error || 'Erreur');
    },
  });

  const handleAddOne = () => {
    if (line.hasSerialNumber && !serial.trim()) {
      setError('Numéro de série requis');
      return;
    }
    addM.mutate({
      productId: line.productId,
      productReference: line.productReference,
      serialNumber: line.hasSerialNumber ? serial.trim() : null,
      quantity: 1,
    });
  };

  const handleScan = (parsed: ParsedQr) => {
    setScannerOpen(false);
    if (parsed.kind === 'unknown') {
      setError('QR non reconnu');
      return;
    }
    // For serial-tracked products: we don't try to resolve `serial` QR to a
    // serial number — that lives in Stock. We take the raw payload as the
    // serial. For product QRs we assume the operator scanned the product
    // sticker (just to confirm it's the right component) and we don't fill
    // anything special. The operator still types/scans the SN separately
    // for serial-tracked items in the input field.
    if (line.hasSerialNumber) {
      setSerial(parsed.raw);
    } else {
      handleAddOne();
    }
  };

  const remaining = line.requiredQty - line.installedQty;

  return (
    <div className="px-4 py-3 flex items-start gap-3 hover:bg-[--k-surface-2]/40">
      <div className="pt-1">
        {line.complete ? (
          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
        ) : (
          <span className="block h-5 w-5 rounded-full border-2 border-[--k-border]" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="font-medium truncate">
            {line.productDescription || line.productReference}
          </span>
          <span className="font-mono text-[11px] text-[--k-muted]">
            {line.productReference}
          </span>
          <span
            className={`text-[11px] tabular-nums px-1.5 py-0.5 rounded ${
              line.complete
                ? 'bg-emerald-50 text-emerald-700'
                : 'bg-amber-50 text-amber-700'
            }`}
          >
            {line.installedQty} / {line.requiredQty}
          </span>
        </div>

        {line.installed.length > 0 && (
          <ul className="mt-1.5 space-y-0.5 text-[12px] text-[--k-muted]">
            {line.installed.map((u) => (
              <li key={u.id} className="flex items-center gap-2">
                <span className="font-mono">
                  {u.serialNumber || `qté ${u.quantity}`}
                </span>
                {u.installedAt && (
                  <span className="text-[10px]">
                    {new Date(u.installedAt).toLocaleTimeString('fr-FR', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                )}
                {editable && (
                  <RemoveComponentBtn
                    assemblyId={assemblyId}
                    componentId={u.id}
                    onDeleted={onChanged}
                  />
                )}
              </li>
            ))}
          </ul>
        )}

        {editable && remaining > 0 && (
          <div className="mt-2 flex gap-1.5 items-center">
            {line.hasSerialNumber ? (
              <input
                className="input-field flex-1"
                value={serial}
                onChange={(e) => setSerial(e.target.value)}
                placeholder="N° de série"
              />
            ) : (
              <span className="text-[12px] text-[--k-muted] flex-1">
                Reste {remaining} à installer
              </span>
            )}
            <button
              type="button"
              onClick={() => setScannerOpen(true)}
              className="rounded-lg border border-[--k-border] h-9 px-2 text-[--k-muted] hover:text-[--k-primary]"
              title="Scanner"
            >
              <Camera className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={handleAddOne}
              disabled={addM.isPending}
              className="rounded-lg bg-[--k-primary] text-white h-9 px-3 text-[13px] font-medium disabled:opacity-50"
            >
              {line.hasSerialNumber ? 'Installer' : 'Marquer +1'}
            </button>
          </div>
        )}

        {error && (
          <div className="mt-1 text-[11px] text-rose-700">{error}</div>
        )}
      </div>

      <QrScannerModal
        isOpen={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={handleScan}
        title={`Scanner ${line.productReference}`}
      />
    </div>
  );
}

function RemoveComponentBtn({
  assemblyId,
  componentId,
  onDeleted,
}: {
  assemblyId: string;
  componentId: string;
  onDeleted: () => void;
}) {
  const removeM = useMutation({
    mutationFn: () =>
      api.delete(`/assembly-orders/${assemblyId}/components/${componentId}`),
    onSuccess: onDeleted,
  });
  return (
    <button
      type="button"
      onClick={() => {
        if (window.confirm('Retirer ce composant ?')) removeM.mutate();
      }}
      disabled={removeM.isPending}
      className="text-[--k-muted] hover:text-rose-700"
      title="Retirer"
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  );
}

// ─── Read-only checklist (when closed) ───────────────────────────────────

function ReadOnlyChecklistSection({ checklist }: { checklist: ChecklistPayload }) {
  return (
    <section className="rounded-xl border border-[--k-border] bg-[--k-surface]">
      <header className="px-4 py-3 border-b border-[--k-border]">
        <h2 className="text-[14px] font-semibold">Composants installés</h2>
      </header>
      <ul className="divide-y divide-[--k-border]">
        {checklist.lines.map((line) => (
          <li key={line.productId} className="px-4 py-2 flex items-center gap-3 text-[13px]">
            <CheckCircle2
              className={`h-4 w-4 ${
                line.complete ? 'text-emerald-600' : 'text-[--k-muted]'
              }`}
            />
            <span className="flex-1 truncate">
              {line.productDescription || line.productReference}
            </span>
            <span className="text-[--k-muted] tabular-nums">
              {line.installedQty} / {line.requiredQty}
            </span>
          </li>
        ))}
        {checklist.extras.map((c) => (
          <li key={c.id} className="px-4 py-2 flex items-center gap-3 text-[13px]">
            <Search className="h-4 w-4 text-[--k-muted]" />
            <span className="flex-1 truncate">{c.productReference} (extra)</span>
            <span className="text-[--k-muted]">
              {c.serialNumber || `qté ${c.quantity}`}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ─── Notes & quality section ─────────────────────────────────────────────

function NotesAndQualitySection({
  order,
  qualityChecks,
  readOnly,
  onSave,
}: {
  order: AssemblyOrder;
  qualityChecks: { id: string; label: string }[];
  readOnly: boolean;
  onSave: (payload: { notes?: string; qualityChecks?: string[] }) => void;
}) {
  const [notes, setNotes] = useState(order.notes || '');
  useEffect(() => {
    setNotes(order.notes || '');
  }, [order.notes]);

  const checked = useMemo(
    () => new Set<string>(order.qualityChecks || []),
    [order.qualityChecks],
  );

  const toggle = (checkId: string) => {
    if (readOnly) return;
    const next = new Set(checked);
    if (next.has(checkId)) next.delete(checkId);
    else next.add(checkId);
    onSave({ qualityChecks: Array.from(next) });
  };

  return (
    <section className="rounded-xl border border-[--k-border] bg-[--k-surface] p-4 space-y-4">
      <h2 className="text-[14px] font-semibold">Notes & contrôles</h2>

      <div>
        <label className="block text-[12px] font-medium text-[--k-muted] mb-1">
          Notes d'atelier
        </label>
        <textarea
          className="input-field min-h-[80px] py-2"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => {
            if (notes !== (order.notes || '')) onSave({ notes });
          }}
          disabled={readOnly}
          placeholder="Câblage validé, anomalies à surveiller, etc."
        />
      </div>

      {qualityChecks.length > 0 && (
        <div>
          <div className="text-[12px] font-medium text-[--k-muted] mb-2">
            Contrôles qualité ({checked.size} / {qualityChecks.length})
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {qualityChecks.map((q) => (
              <button
                type="button"
                key={q.id}
                onClick={() => toggle(q.id)}
                disabled={readOnly}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-[13px] text-left ${
                  checked.has(q.id)
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                    : 'border-[--k-border] bg-[--k-surface] text-[--k-text]'
                }`}
              >
                <span
                  className={`h-4 w-4 rounded border flex items-center justify-center ${
                    checked.has(q.id)
                      ? 'border-emerald-500 bg-emerald-500 text-white'
                      : 'border-[--k-border]'
                  }`}
                >
                  {checked.has(q.id) && <CheckCircle2 className="h-3 w-3" />}
                </span>
                {q.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

// ─── History section ─────────────────────────────────────────────────────

function HistorySection({ events }: { events: AssemblyEvent[] }) {
  if (events.length === 0) {
    return (
      <section className="rounded-xl border border-[--k-border] bg-[--k-surface] p-4">
        <h2 className="text-[14px] font-semibold mb-2">Historique</h2>
        <p className="text-[13px] text-[--k-muted] italic">
          Aucun événement pour l'instant.
        </p>
      </section>
    );
  }
  return (
    <section className="rounded-xl border border-[--k-border] bg-[--k-surface]">
      <header className="px-4 py-3 border-b border-[--k-border]">
        <h2 className="text-[14px] font-semibold">Historique</h2>
      </header>
      <ul className="divide-y divide-[--k-border]">
        {events.map((e) => (
          <li key={e.id} className="px-4 py-2 text-[13px] flex items-start gap-2">
            <span className="text-[11px] text-[--k-muted] tabular-nums shrink-0 w-32">
              {new Date(e.createdAt).toLocaleString('fr-FR')}
            </span>
            <span className="flex-1">
              {humanizeEvent(e)}
              {e.actorName && (
                <span className="text-[--k-muted]"> · {e.actorName}</span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function humanizeEvent(e: AssemblyEvent): string {
  const p = (e.payload || {}) as Record<string, unknown>;
  switch (e.eventType) {
    case 'STARTED':
      return "Assemblage démarré";
    case 'STATUS_CHANGED':
      return `Statut : ${p.from} → ${p.to}`;
    case 'COMPONENT_INSTALLED':
      return `Composant installé : ${p.productRef}${
        p.serialNumber ? ` (SN ${p.serialNumber})` : ''
      }`;
    case 'COMPONENT_REMOVED':
      return `Composant retiré : ${p.productRef}${
        p.serialNumber ? ` (SN ${p.serialNumber})` : ''
      }`;
    case 'NOTES_UPDATED':
      return 'Notes mises à jour';
    case 'INTERNAL_NUMBER_SET':
      return `Numéro interne : ${p.value}`;
    case 'QUALITY_CHECKED':
      return `Contrôle qualité validé : ${p.checkId}`;
    case 'QUALITY_UNCHECKED':
      return `Contrôle qualité retiré : ${p.checkId}`;
    case 'COMPLETED':
      return `Borne validée (${p.internalNumber}), ${p.movementsCreated} mouvement(s) Stock`;
    case 'CANCELLED':
      return `Annulé${p.reason ? ` : ${p.reason}` : ''}`;
    default:
      return e.eventType;
  }
}
