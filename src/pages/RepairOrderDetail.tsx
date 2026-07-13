import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Loader2,
  Play,
  Pause,
  Beaker,
  CheckCircle2,
  XCircle,
  Trash2,
  Camera,
  Plus,
  AlertTriangle,
  Stethoscope,
  Wrench,
  Paperclip,
  Upload,
  FileText,
  ChevronDown,
  MoreHorizontal,
} from 'lucide-react';
import api, { API_BASE_URL } from '../services/api';
import QrScannerModal, { type ParsedQr } from '../components/QrScannerModal';
import OperatorAvatar from '../components/OperatorAvatar';
import SerialLink from '../components/SerialLink';
import PriorityBadge from '../components/PriorityBadge';
import PartStateBadge from '../components/PartStateBadge';
import InterventionKindBadge from '../components/InterventionKindBadge';

type Status = 'DRAFT' | 'IN_PROGRESS' | 'ON_HOLD' | 'TESTING' | 'COMPLETED' | 'CANCELLED';
type Kind = 'REPLACED' | 'CHECKED' | 'DIAGNOSED';
type PartState = 'OK' | 'DEFECTIVE' | 'TO_CHECK' | 'SUSPECT';
type Priority = 'NORMAL' | 'HIGH' | 'URGENT';
type FinalResult = 'RESOLVED' | 'NOT_REPRODUCED' | 'BEYOND_REPAIR' | 'ESCALATED';

interface RepairComponent {
  id: string;
  kind: Kind;
  productId: string;
  productReference: string;
  serialNumber: string | null;
  quantity: number;
  partState: PartState;
  comment: string | null;
  stockMovementIds: string[] | null;
  createdAt: string;
}

interface RepairAttachment {
  id: string;
  filename: string;
  url: string;
  mimeType: string;
  sizeBytes: number;
  uploadedByName: string | null;
  createdAt: string;
}

interface RepairOrder {
  id: string;
  borneInternalNumber: string;
  sourceApp: string;
  status: Status;
  priority: Priority;
  diagnosis: string | null;
  diagnosisSource: string | null;
  operatorId: string | null;
  operatorName: string | null;
  notes: string | null;
  qualityChecks: string[] | null;
  onHoldReason: string | null;
  report: string | null;
  finalResult: FinalResult | null;
  startedAt: string | null;
  completedAt: string | null;
  createdByName: string | null;
  createdAt: string;
  components: RepairComponent[];
  attachments: RepairAttachment[];
}

interface BorneInfo {
  internalNumber: string;
  sourceApp: string;
  factoryAssembly: {
    id: string;
    model: string;
    completedAt: string | null;
    components: {
      id: string;
      productReference: string;
      serialNumber: string | null;
      quantity: number;
      installedAt: string | null;
    }[];
  } | null;
  parcBorne: {
    numero_formated: string;
    numero_serie: string | null;
    model_nom: string | null;
    gamme_nom: string | null;
    etat_nom: string | null;
    parc_nom: string | null;
    client_enseigne: string | null;
    antenne_ville: string | null;
  } | null;
  parcError: string | null;
}

interface RepairEvent {
  id: string;
  eventType: string;
  payload: Record<string, unknown> | null;
  actorName: string | null;
  createdAt: string;
}

const STATUS_META: Record<Status, { label: string; cls: string }> = {
  DRAFT: { label: 'Brouillon', cls: 'bg-slate-100 text-slate-700' },
  IN_PROGRESS: { label: 'En cours', cls: 'bg-amber-100 text-amber-800' },
  ON_HOLD: { label: 'En attente', cls: 'bg-orange-100 text-orange-800' },
  TESTING: { label: 'En test', cls: 'bg-blue-100 text-blue-800' },
  COMPLETED: { label: 'Terminé', cls: 'bg-emerald-100 text-emerald-800' },
  CANCELLED: { label: 'Annulé', cls: 'bg-rose-100 text-rose-800' },
};

const FINAL_RESULT_META: Record<FinalResult, { label: string; cls: string }> = {
  RESOLVED: { label: 'Résolu', cls: 'text-emerald-700' },
  NOT_REPRODUCED: { label: 'Non reproduite', cls: 'text-slate-700' },
  BEYOND_REPAIR: { label: 'HS irréparable', cls: 'text-rose-700' },
  ESCALATED: { label: 'Escaladé', cls: 'text-amber-700' },
};

// ─── Page ────────────────────────────────────────────────────────────────

export default function RepairOrderDetail() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();

  const orderQ = useQuery({
    queryKey: ['repair-order', id],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: RepairOrder }>(
        `/repair-orders/${id}`,
      );
      return res.data.data;
    },
    enabled: !!id,
  });

  const borneQ = useQuery({
    queryKey: ['repair-order-borne', id],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: BorneInfo }>(
        `/repair-orders/${id}/borne-info`,
      );
      return res.data.data;
    },
    enabled: !!id,
    retry: false,
  });

  const checklistQ = useQuery({
    queryKey: ['repair-order-checklist', id],
    queryFn: async () => {
      const res = await api.get<{
        success: boolean;
        data: { qualityChecks: { id: string; label: string }[]; checked: string[] };
      }>(`/repair-orders/${id}/checklist`);
      return res.data.data;
    },
    enabled: !!id,
  });

  const historyQ = useQuery({
    queryKey: ['repair-order-history', id],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: RepairEvent[] }>(
        `/repair-orders/${id}/history`,
      );
      return res.data.data;
    },
    enabled: !!id,
  });

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['repair-order', id] });
    qc.invalidateQueries({ queryKey: ['repair-order-checklist', id] });
    qc.invalidateQueries({ queryKey: ['repair-order-history', id] });
  };

  const transitionM = useMutation({
    mutationFn: async (payload: {
      to: 'IN_PROGRESS' | 'ON_HOLD' | 'TESTING' | 'CANCELLED';
      reason?: string;
      onHoldReason?: string;
    }) => {
      const res = await api.post(`/repair-orders/${id}/transition`, payload);
      return res.data;
    },
    onSuccess: invalidateAll,
  });

  const updateM = useMutation({
    mutationFn: async (payload: {
      diagnosis?: string;
      diagnosisSource?: string;
      priority?: Priority;
      notes?: string;
      qualityChecks?: string[];
      report?: string;
    }) => {
      await api.patch(`/repair-orders/${id}`, payload);
    },
    onSuccess: invalidateAll,
  });

  const closeM = useMutation({
    mutationFn: async (payload: { report: string; finalResult: FinalResult }) => {
      const res = await api.post(`/repair-orders/${id}/close`, payload);
      return res.data;
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
  const canEditComponents = order.status === 'IN_PROGRESS';
  const canEditClosure = order.status === 'TESTING';

  return (
    <div className="space-y-4">
      <Link
        to="/repair-orders"
        className="text-[12px] text-[--k-primary] inline-flex items-center gap-1"
      >
        <ArrowLeft className="h-3 w-3" />
        Tous les ordres de réparation
      </Link>

      {/* Bloc 1 — Header */}
      <Header
        order={order}
        transitionPending={transitionM.isPending}
        transitionError={
          (transitionM.error as { response?: { data?: { error?: string } } } | null)?.response
            ?.data?.error || null
        }
        onTransition={(to, extras) => transitionM.mutate({ to, ...extras })}
        onPriorityChange={(p) => updateM.mutate({ priority: p })}
      />

      {/* Bloc 2 — Bandeau "Problème signalé" */}
      <DiagnosisBanner
        order={order}
        readOnly={isClosed}
        onDiagnosisChange={(value) => updateM.mutate({ diagnosis: value || undefined })}
      />

      {/* Bloc 3 — Borne concernée */}
      <BorneInfoCard
        info={borneQ.data}
        isLoading={borneQ.isLoading}
        priority={order.priority}
      />

      {/* Bloc 4 — Déclaration d'intervention */}
      <InterventionSection
        components={order.components}
        canEdit={canEditComponents}
        repairId={order.id}
        onChanged={invalidateAll}
      />

      {/* Contrôles qualité (option A du plan : bloc dédié) */}
      {checklistQ.data && (
        <QualityChecksCard
          order={order}
          qualityChecks={checklistQ.data.qualityChecks}
          readOnly={isClosed}
          onSave={updateM.mutate}
        />
      )}

      {/* Bloc 5 — Clôture (visible seulement en TESTING ou déjà clos) */}
      {(canEditClosure || order.status === 'COMPLETED') && (
        <ClosureCard
          order={order}
          canEdit={canEditClosure}
          onClose={(payload) => closeM.mutate(payload)}
          closePending={closeM.isPending}
          closeError={
            (closeM.error as { response?: { data?: { error?: string } } } | null)?.response
              ?.data?.error || null
          }
        />
      )}

      {/* Pièces jointes (toujours visible sauf si l'ordre est en DRAFT) */}
      {order.status !== 'DRAFT' && (
        <AttachmentsSection
          order={order}
          canEdit={!isClosed}
          onChanged={invalidateAll}
        />
      )}

      {/* Bloc 6 — Historique */}
      <HistorySection events={historyQ.data || []} />
    </div>
  );
}

// ─── Header ──────────────────────────────────────────────────────────────

function Header({
  order,
  transitionPending,
  transitionError,
  onTransition,
  onPriorityChange,
}: {
  order: RepairOrder;
  transitionPending: boolean;
  transitionError: string | null;
  onTransition: (
    to: 'IN_PROGRESS' | 'ON_HOLD' | 'TESTING' | 'CANCELLED',
    extras?: { reason?: string; onHoldReason?: string },
  ) => void;
  onPriorityChange: (p: Priority) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const meta = STATUS_META[order.status];
  const isClosed = order.status === 'COMPLETED' || order.status === 'CANCELLED';

  const handleOnHold = () => {
    const reason = window.prompt('Motif de mise en attente (obligatoire) :');
    if (!reason?.trim()) return;
    onTransition('ON_HOLD', { onHoldReason: reason.trim() });
  };

  const handleCancel = () => {
    const reason = window.prompt("Motif d'annulation (facultatif) ?") || '';
    if (window.confirm("Annuler cette réparation ? L'action est définitive.")) {
      onTransition('CANCELLED', { reason });
    }
  };

  return (
    <section className="rounded-xl border border-[--k-border] bg-[--k-surface] p-4 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold font-mono">
            <Link
              to={`/bornes/${encodeURIComponent(order.borneInternalNumber)}`}
              className="hover:underline"
              title="Vie de cette borne"
            >
              {order.borneInternalNumber}
            </Link>
          </h1>
          <p className="text-[12px] text-[--k-muted] flex items-center gap-2 mt-0.5">
            Réparation ·{' '}
            {order.sourceApp === 'factory'
              ? 'borne Factory'
              : order.sourceApp === 'bornes'
                ? 'borne du parc'
                : 'non résolue'}
            <span>·</span>
            <span
              className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${meta.cls}`}
            >
              {meta.label}
            </span>
            <PriorityBadge priority={order.priority} />
          </p>
        </div>

        {!isClosed && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {order.status === 'DRAFT' && (
              <button
                type="button"
                onClick={() => onTransition('IN_PROGRESS')}
                disabled={transitionPending}
                className="rounded-lg bg-[--k-primary] text-white px-3 py-2 text-[13px] font-medium inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                <Play className="h-4 w-4" /> Prendre en charge
              </button>
            )}
            {order.status === 'IN_PROGRESS' && (
              <>
                <button
                  type="button"
                  onClick={() => onTransition('TESTING')}
                  disabled={transitionPending}
                  className="rounded-lg bg-[--k-primary] text-white px-3 py-2 text-[13px] font-medium inline-flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Beaker className="h-4 w-4" /> Lancer les tests
                </button>
                <button
                  type="button"
                  onClick={handleOnHold}
                  disabled={transitionPending}
                  className="rounded-lg border border-[--k-border] px-3 py-2 text-[13px] font-medium inline-flex items-center gap-1.5"
                >
                  <Pause className="h-4 w-4" /> Mettre en attente
                </button>
              </>
            )}
            {order.status === 'ON_HOLD' && (
              <button
                type="button"
                onClick={() => onTransition('IN_PROGRESS')}
                disabled={transitionPending}
                className="rounded-lg bg-[--k-primary] text-white px-3 py-2 text-[13px] font-medium inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                <Play className="h-4 w-4" /> Reprendre
              </button>
            )}
            {order.status === 'TESTING' && (
              <button
                type="button"
                onClick={() => onTransition('IN_PROGRESS')}
                disabled={transitionPending}
                className="rounded-lg border border-[--k-border] px-3 py-2 text-[13px] font-medium"
              >
                Retour atelier
              </button>
            )}

            {/* Menu Plus d'actions */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                className="rounded-lg border border-[--k-border] px-3 py-2 text-[13px] font-medium inline-flex items-center gap-1.5"
              >
                <MoreHorizontal className="h-4 w-4" /> Plus d'actions
                <ChevronDown className="h-3 w-3" />
              </button>
              {menuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-30"
                    onClick={() => setMenuOpen(false)}
                  />
                  <div className="absolute right-0 top-full mt-1 z-40 min-w-[200px] rounded-lg border border-[--k-border] bg-[--k-surface] shadow-lg py-1">
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        onPriorityChange(order.priority === 'URGENT' ? 'NORMAL' : 'URGENT');
                      }}
                      className="w-full text-left px-3 py-2 text-[13px] hover:bg-[--k-surface-2]/40"
                    >
                      {order.priority === 'URGENT' ? 'Repasser en normale' : 'Marquer urgente'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        onPriorityChange('HIGH');
                      }}
                      className="w-full text-left px-3 py-2 text-[13px] hover:bg-[--k-surface-2]/40"
                    >
                      Marquer haute priorité
                    </button>
                    <div className="border-t border-[--k-border] my-1" />
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        handleCancel();
                      }}
                      className="w-full text-left px-3 py-2 text-[13px] text-rose-700 hover:bg-rose-50"
                    >
                      <XCircle className="h-4 w-4 inline mr-1.5" />
                      Annuler la réparation
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Metadata operateur / dates */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-[13px] pt-2 border-t border-[--k-border]">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-[--k-muted] mb-0.5">
            Opérateur
          </div>
          <OperatorAvatar name={order.operatorName} size="sm" />
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-[--k-muted] mb-0.5">
            Créé par
          </div>
          <OperatorAvatar name={order.createdByName} size="sm" />
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-[--k-muted] mb-0.5">
            Démarré le
          </div>
          {order.startedAt
            ? new Date(order.startedAt).toLocaleString('fr-FR')
            : '—'}
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-[--k-muted] mb-0.5">
            {order.status === 'COMPLETED' ? 'Terminé le' : 'Créé le'}
          </div>
          {order.completedAt
            ? new Date(order.completedAt).toLocaleString('fr-FR')
            : new Date(order.createdAt).toLocaleString('fr-FR')}
        </div>
      </div>

      {/* Motif ON_HOLD si actif */}
      {order.status === 'ON_HOLD' && order.onHoldReason && (
        <div className="rounded-lg bg-orange-50 border border-orange-200 px-3 py-2 text-[13px] text-orange-900 flex items-start gap-2">
          <Pause className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            <strong>En attente :</strong> {order.onHoldReason}
          </span>
        </div>
      )}

      {transitionError && (
        <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-[12px] text-rose-700 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          {transitionError}
        </div>
      )}
    </section>
  );
}

// ─── Bloc 2 — Bandeau "Problème signalé" ─────────────────────────────────

function DiagnosisBanner({
  order,
  readOnly,
  onDiagnosisChange,
}: {
  order: RepairOrder;
  readOnly: boolean;
  onDiagnosisChange: (value: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(order.diagnosis || '');
  useEffect(() => setDraft(order.diagnosis || ''), [order.diagnosis]);

  const sourceLabel =
    order.diagnosisSource ||
    (order.sourceApp === 'bornes' ? 'Remonté du parc' : 'Créé manuellement');

  if (editing && !readOnly) {
    return (
      <section className="rounded-xl border border-rose-200 bg-rose-50 p-4 space-y-2">
        <div className="text-[11px] font-semibold text-rose-700 uppercase tracking-wide">
          Problème signalé
        </div>
        <textarea
          className="input-field min-h-[80px] py-2 bg-white"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          autoFocus
          placeholder="ex : écran tactile ne répond pas, imprimante bloquée…"
        />
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              setDraft(order.diagnosis || '');
              setEditing(false);
            }}
            className="rounded-lg border border-[--k-border] bg-white px-3 py-1.5 text-[12px]"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={() => {
              onDiagnosisChange(draft.trim());
              setEditing(false);
            }}
            className="rounded-lg bg-rose-600 text-white px-3 py-1.5 text-[12px] font-medium"
          >
            Enregistrer
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-rose-200 bg-rose-50 p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-6 w-6 text-rose-600 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-semibold text-rose-700 uppercase tracking-wide">
            Problème signalé
          </div>
          <button
            type="button"
            onClick={() => !readOnly && setEditing(true)}
            disabled={readOnly}
            className="mt-1 text-[18px] font-semibold text-[--k-text] text-left hover:text-rose-800 disabled:cursor-default"
          >
            {order.diagnosis || (
              <span className="italic text-rose-500 text-[14px]">
                Aucun diagnostic saisi
              </span>
            )}
          </button>
          <div className="text-[11px] text-rose-700/80 mt-1">{sourceLabel}</div>
        </div>
      </div>
    </section>
  );
}

// ─── Bloc 3 — Borne concernée (6 champs) ─────────────────────────────────

function BorneInfoCard({
  info,
  isLoading,
  priority,
}: {
  info: BorneInfo | undefined;
  isLoading: boolean;
  priority: Priority;
}) {
  if (isLoading) {
    return (
      <section className="rounded-xl border border-[--k-border] bg-[--k-surface] p-4 text-[13px] text-[--k-muted] flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Recherche de la borne…
      </section>
    );
  }
  if (!info) return null;

  const p = info.parcBorne;
  const a = info.factoryAssembly;
  const anyKnown = !!p || !!a;

  if (!anyKnown) {
    return (
      <section className="rounded-xl border border-amber-200 bg-amber-50 p-4">
        <h2 className="text-[14px] font-semibold text-amber-900 mb-1 flex items-center gap-2">
          <Stethoscope className="h-4 w-4" />
          Borne non résolue
        </h2>
        <p className="text-[13px] text-amber-800">
          Le numéro <span className="font-mono">{info.internalNumber}</span>{' '}
          n'a été trouvé ni côté Factory ni dans l'app Bornes.
        </p>
      </section>
    );
  }

  const fields: { label: string; value: React.ReactNode }[] = [
    { label: 'Parc', value: p?.parc_nom || '—' },
    { label: 'Gamme', value: p?.gamme_nom || (a ? a.model : '—') },
    { label: 'Type', value: p?.model_nom || '—' },
    { label: 'Affectée à', value: p?.client_enseigne || '—' },
    { label: 'N° de série', value: p?.numero_serie || info.internalNumber },
    { label: 'Priorité', value: <PriorityBadge priority={priority} /> },
  ];

  return (
    <section className="rounded-xl border border-[--k-border] bg-[--k-surface]">
      <header className="px-4 py-3 border-b border-[--k-border] flex items-center justify-between gap-2">
        <h2 className="text-[14px] font-semibold">Borne concernée</h2>
        {a && (
          <Link
            to={`/produced-bornes/${a.id}`}
            className="text-[11px] text-[--k-primary] hover:underline"
          >
            Voir la fiche produite →
          </Link>
        )}
      </header>
      <div className="p-4 grid grid-cols-2 md:grid-cols-3 gap-4">
        {fields.map((f) => (
          <div key={f.label}>
            <div className="text-[11px] uppercase tracking-wide text-[--k-muted] mb-0.5">
              {f.label}
            </div>
            <div className="text-[14px] font-medium text-[--k-text]">
              {f.value}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── Bloc 4 — Déclaration d'intervention ────────────────────────────────

function InterventionSection({
  components,
  canEdit,
  repairId,
  onChanged,
}: {
  components: RepairComponent[];
  canEdit: boolean;
  repairId: string;
  onChanged: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const nReplaced = components.filter((c) => c.kind === 'REPLACED').length;
  const nChecked = components.filter((c) => c.kind === 'CHECKED').length;
  const nDiagnosed = components.filter((c) => c.kind === 'DIAGNOSED').length;

  return (
    <section className="rounded-xl border border-[--k-border] bg-[--k-surface]">
      <header className="px-4 py-3 border-b border-[--k-border] flex items-start justify-between gap-2">
        <div>
          <h2 className="text-[14px] font-semibold">Déclaration d'intervention</h2>
          <p className="text-[12px] text-[--k-muted] mt-0.5">
            Déclarez les éléments contrôlés, réparés ou remplacés.
          </p>
        </div>
        {canEdit && !showForm && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-1 rounded-lg border border-[--k-border] px-3 py-1.5 text-[13px]"
          >
            <Plus className="h-3.5 w-3.5" />
            Ajouter une action matériel
          </button>
        )}
      </header>

      {showForm && (
        <AddInterventionForm
          repairId={repairId}
          onDone={() => {
            setShowForm(false);
            onChanged();
          }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {components.length === 0 ? (
        <div className="p-6 text-[13px] text-[--k-muted] italic text-center">
          Aucune action déclarée pour l'instant.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-[--k-border] text-left text-[11px] uppercase tracking-wide text-[--k-muted]">
                <th className="px-4 py-2">Élément</th>
                <th className="px-4 py-2">Action</th>
                <th className="px-4 py-2">Référence</th>
                <th className="px-4 py-2">N° de série</th>
                <th className="px-4 py-2">État</th>
                {canEdit && <th className="px-4 py-2 w-10"></th>}
              </tr>
            </thead>
            <tbody>
              {components.map((c) => (
                <InterventionRow
                  key={c.id}
                  c={c}
                  canEdit={canEdit}
                  repairId={repairId}
                  onDeleted={onChanged}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Synthèse */}
      {components.length > 0 && (
        <div className="px-4 py-3 border-t border-[--k-border] bg-[--k-surface-2]/30 text-[12px] text-[--k-muted] flex items-center gap-2 flex-wrap">
          <Wrench className="h-3.5 w-3.5" />
          <span>Synthèse :</span>
          {nReplaced > 0 && (
            <span>
              <strong className="text-orange-700">{nReplaced}</strong>{' '}
              élément{nReplaced > 1 ? 's' : ''} remplacé{nReplaced > 1 ? 's' : ''}
            </span>
          )}
          {nReplaced > 0 && (nChecked > 0 || nDiagnosed > 0) && <span>·</span>}
          {nChecked > 0 && (
            <span>
              <strong className="text-blue-700">{nChecked}</strong>{' '}
              élément{nChecked > 1 ? 's' : ''} contrôlé{nChecked > 1 ? 's' : ''}
            </span>
          )}
          {nChecked > 0 && nDiagnosed > 0 && <span>·</span>}
          {nDiagnosed > 0 && (
            <span>
              <strong className="text-purple-700">{nDiagnosed}</strong> en diagnostic
            </span>
          )}
        </div>
      )}
    </section>
  );
}

function InterventionRow({
  c,
  canEdit,
  repairId,
  onDeleted,
}: {
  c: RepairComponent;
  canEdit: boolean;
  repairId: string;
  onDeleted: () => void;
}) {
  const removeM = useMutation({
    mutationFn: () => api.delete(`/repair-orders/${repairId}/components/${c.id}`),
    onSuccess: onDeleted,
  });
  return (
    <tr className="border-b border-[--k-border] last:border-b-0">
      <td className="px-4 py-2">
        <div className="font-medium">{c.productReference}</div>
        {c.comment && (
          <div className="text-[11px] text-[--k-muted] italic mt-0.5">
            {c.comment}
          </div>
        )}
      </td>
      <td className="px-4 py-2">
        <InterventionKindBadge kind={c.kind} />
      </td>
      <td className="px-4 py-2 font-mono text-[--k-muted]">
        {c.productReference}
      </td>
      <td className="px-4 py-2">
        <SerialLink
          serialNumber={c.serialNumber}
          productReference={c.productReference}
          productId={c.productId}
          quantity={c.quantity}
        />
      </td>
      <td className="px-4 py-2">
        <PartStateBadge state={c.partState} />
      </td>
      {canEdit && (
        <td className="px-4 py-2">
          <button
            type="button"
            onClick={() => {
              if (window.confirm('Retirer cette ligne ?')) removeM.mutate();
            }}
            className="text-[--k-muted] hover:text-rose-700"
            title="Supprimer"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </td>
      )}
    </tr>
  );
}

// ─── Add intervention form ──────────────────────────────────────────────

function AddInterventionForm({
  repairId,
  onDone,
  onCancel,
}: {
  repairId: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [productRef, setProductRef] = useState('');
  const [productId, setProductId] = useState('');
  const [serial, setSerial] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [kind, setKind] = useState<Kind>('REPLACED');
  const [partState, setPartState] = useState<PartState>('OK');
  const [comment, setComment] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);

  const addM = useMutation({
    mutationFn: async () => {
      await api.post(`/repair-orders/${repairId}/components`, {
        kind,
        productId: productId || productRef,
        productReference: productRef,
        serialNumber: serial.trim() || null,
        quantity,
        partState,
        comment: comment.trim() || null,
      });
    },
    onSuccess: onDone,
  });

  const handleScan = (parsed: ParsedQr) => {
    setScannerOpen(false);
    if (parsed.kind === 'unknown') return;
    setProductId(parsed.id);
    setProductRef(parsed.raw);
  };

  const canSubmit = !!productRef.trim() && quantity > 0;

  return (
    <div className="border-b border-[--k-border] px-4 py-3 bg-[--k-surface-2]/40 space-y-3">
      <div className="text-[12px] font-semibold text-[--k-text]">
        Ajouter une action matériel
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div>
          <label className="text-[11px] text-[--k-muted]">Action</label>
          <select
            className="input-field"
            value={kind}
            onChange={(e) => setKind(e.target.value as Kind)}
          >
            <option value="REPLACED">Remplacé</option>
            <option value="CHECKED">Contrôlé</option>
            <option value="DIAGNOSED">Diagnostic</option>
          </select>
        </div>
        <div>
          <label className="text-[11px] text-[--k-muted]">État de la pièce</label>
          <select
            className="input-field"
            value={partState}
            onChange={(e) => setPartState(e.target.value as PartState)}
          >
            <option value="OK">OK</option>
            <option value="DEFECTIVE">Défectueux</option>
            <option value="TO_CHECK">À contrôler</option>
            <option value="SUSPECT">Suspect</option>
          </select>
        </div>
        <div>
          <label className="text-[11px] text-[--k-muted]">Quantité</label>
          <input
            type="number"
            min={1}
            className="input-field"
            value={quantity}
            onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="text-[11px] text-[--k-muted]">Référence produit / ID</label>
          <div className="flex gap-1">
            <input
              className="input-field font-mono"
              value={productRef}
              onChange={(e) => setProductRef(e.target.value)}
              placeholder="ex : ECR-15-TOUCH"
            />
            <button
              type="button"
              onClick={() => setScannerOpen(true)}
              className="rounded-lg border border-[--k-border] bg-white px-2 text-[--k-muted]"
            >
              <Camera className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div>
          <label className="text-[11px] text-[--k-muted]">N° série (si tracé)</label>
          <input
            className="input-field"
            value={serial}
            onChange={(e) => setSerial(e.target.value)}
            placeholder="Optionnel"
          />
        </div>
        <div className="sm:col-span-3">
          <label className="text-[11px] text-[--k-muted]">Commentaire (optionnel)</label>
          <input
            className="input-field"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="ex : impacte le port USB, à surveiller au prochain contrôle…"
          />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-[--k-border] px-3 py-1.5 text-[12px]"
        >
          Annuler
        </button>
        <button
          type="button"
          disabled={!canSubmit || addM.isPending}
          onClick={() => addM.mutate()}
          className="rounded-lg bg-[--k-primary] text-white px-3 py-1.5 text-[12px] font-medium disabled:opacity-50"
        >
          {addM.isPending ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
      <QrScannerModal
        isOpen={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={handleScan}
      />
    </div>
  );
}

// ─── Contrôles qualité ──────────────────────────────────────────────────

function QualityChecksCard({
  order,
  qualityChecks,
  readOnly,
  onSave,
}: {
  order: RepairOrder;
  qualityChecks: { id: string; label: string }[];
  readOnly: boolean;
  onSave: (payload: { notes?: string; qualityChecks?: string[] }) => void;
}) {
  const [notes, setNotes] = useState(order.notes || '');
  useEffect(() => setNotes(order.notes || ''), [order.notes]);

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
      <h2 className="text-[14px] font-semibold">Contrôles qualité</h2>
      <div>
        <div className="text-[12px] font-medium text-[--k-muted] mb-2">
          {checked.size} / {qualityChecks.length} validés
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {qualityChecks.map((q) => {
            const ok = checked.has(q.id);
            return (
              <button
                type="button"
                key={q.id}
                onClick={() => toggle(q.id)}
                disabled={readOnly}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-[13px] text-left ${
                  ok
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                    : 'border-[--k-border] bg-[--k-surface]'
                }`}
              >
                <span
                  className={`h-4 w-4 rounded border flex items-center justify-center shrink-0 ${
                    ok
                      ? 'border-emerald-500 bg-emerald-500 text-white'
                      : 'border-[--k-border]'
                  }`}
                >
                  {ok && <CheckCircle2 className="h-3 w-3" />}
                </span>
                {q.label}
              </button>
            );
          })}
        </div>
      </div>
      <div>
        <label className="block text-[12px] font-medium text-[--k-muted] mb-1">
          Notes d'atelier
        </label>
        <textarea
          className="input-field min-h-[60px] py-2"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => {
            if (notes !== (order.notes || '')) onSave({ notes });
          }}
          disabled={readOnly}
          placeholder="Observations rapides, précautions, référence intervention…"
        />
      </div>
    </section>
  );
}

// ─── Bloc 5 — Clôture ───────────────────────────────────────────────────

function ClosureCard({
  order,
  canEdit,
  onClose,
  closePending,
  closeError,
}: {
  order: RepairOrder;
  canEdit: boolean;
  onClose: (payload: { report: string; finalResult: FinalResult }) => void;
  closePending: boolean;
  closeError: string | null;
}) {
  const [report, setReport] = useState(order.report || '');
  const [finalResult, setFinalResult] = useState<FinalResult | ''>(
    order.finalResult || '',
  );
  useEffect(() => setReport(order.report || ''), [order.report]);
  useEffect(() => setFinalResult(order.finalResult || ''), [order.finalResult]);

  const nReplaced = order.components.filter((c) => c.kind === 'REPLACED').length;
  const nChecked = order.components.filter((c) => c.kind === 'CHECKED').length;
  const nDiagnosed = order.components.filter((c) => c.kind === 'DIAGNOSED').length;
  const hasMaterial = nReplaced > 0;

  if (!canEdit && order.status === 'COMPLETED') {
    const meta = order.finalResult ? FINAL_RESULT_META[order.finalResult] : null;
    return (
      <section className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 space-y-3">
        <h2 className="text-[14px] font-semibold text-emerald-900 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4" />
          Réparation clôturée
        </h2>
        {meta && (
          <div className="text-[13px]">
            <span className="text-[--k-muted]">Résultat final : </span>
            <span className={`font-semibold ${meta.cls}`}>{meta.label}</span>
          </div>
        )}
        {order.report && (
          <div>
            <div className="text-[11px] uppercase tracking-wide text-[--k-muted] mb-1">
              Compte-rendu atelier
            </div>
            <div className="text-[13px] whitespace-pre-wrap">{order.report}</div>
          </div>
        )}
      </section>
    );
  }

  const canSubmit = !!report.trim() && !!finalResult;

  return (
    <section className="rounded-xl border border-orange-300 bg-orange-50/40">
      <header className="px-4 py-3 border-b border-orange-200 flex items-center justify-between">
        <h2 className="text-[14px] font-semibold">Clôture de réparation</h2>
        <span className="text-[11px] text-orange-700 font-medium">
          Obligatoire pour terminer la réparation
        </span>
      </header>

      <div className="p-4 space-y-4">
        {/* Récapitulatif */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[12px]">
          <div className="rounded-lg border border-[--k-border] bg-white px-3 py-2">
            <div className="text-[--k-muted]">Matériel remplacé</div>
            <div className={`font-semibold ${hasMaterial ? 'text-emerald-700' : 'text-slate-600'}`}>
              {hasMaterial ? 'Oui' : 'Non'}
            </div>
          </div>
          <div className="rounded-lg border border-[--k-border] bg-white px-3 py-2">
            <div className="text-[--k-muted]">Éléments remplacés</div>
            <div className="font-semibold text-orange-700 tabular-nums">
              {nReplaced}
            </div>
          </div>
          <div className="rounded-lg border border-[--k-border] bg-white px-3 py-2">
            <div className="text-[--k-muted]">Éléments contrôlés</div>
            <div className="font-semibold text-blue-700 tabular-nums">{nChecked}</div>
          </div>
          <div className="rounded-lg border border-[--k-border] bg-white px-3 py-2">
            <div className="text-[--k-muted]">Éléments en diagnostic</div>
            <div className="font-semibold text-purple-700 tabular-nums">
              {nDiagnosed}
            </div>
          </div>
        </div>

        {/* Compte-rendu */}
        <div>
          <label className="block text-[12px] font-medium text-[--k-muted] mb-1">
            Compte-rendu atelier <span className="text-rose-600">*</span>
          </label>
          <textarea
            className="input-field min-h-[100px] py-2 bg-white"
            value={report}
            onChange={(e) => setReport(e.target.value)}
            placeholder="Décrivez les observations, les actions menées, les pièces remplacées, les réglages effectués et les points à surveiller…"
          />
        </div>

        {/* Résultat final */}
        <div>
          <label className="block text-[12px] font-medium text-[--k-muted] mb-1">
            Résultat final <span className="text-rose-600">*</span>
          </label>
          <select
            className="input-field bg-white"
            value={finalResult}
            onChange={(e) => setFinalResult(e.target.value as FinalResult | '')}
          >
            <option value="">Sélectionner un résultat…</option>
            <option value="RESOLVED">Résolu</option>
            <option value="NOT_REPRODUCED">Non reproduite</option>
            <option value="BEYOND_REPAIR">HS irréparable</option>
            <option value="ESCALATED">Escaladé (fournisseur / R&D)</option>
          </select>
        </div>

        {closeError && (
          <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-[12px] text-rose-700 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            {closeError}
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="button"
            onClick={() =>
              canSubmit &&
              onClose({ report: report.trim(), finalResult: finalResult as FinalResult })
            }
            disabled={!canSubmit || closePending}
            className="rounded-lg bg-[--k-primary] text-white px-4 py-2 text-[13px] font-medium inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            <CheckCircle2 className="h-4 w-4" />
            {closePending ? 'Clôture…' : 'Clôturer la réparation'}
          </button>
        </div>
      </div>
    </section>
  );
}

// ─── Pièces jointes ─────────────────────────────────────────────────────

function AttachmentsSection({
  order,
  canEdit,
  onChanged,
}: {
  order: RepairOrder;
  canEdit: boolean;
  onChanged: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const upload = async (file: File) => {
    setUploading(true);
    setUploadError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      await api.post(`/repair-orders/${order.id}/attachments`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      onChanged();
    } catch (err) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        (err instanceof Error ? err.message : 'Erreur upload');
      setUploadError(msg);
    } finally {
      setUploading(false);
    }
  };

  const deleteM = useMutation({
    mutationFn: (attachmentId: string) =>
      api.delete(`/repair-orders/${order.id}/attachments/${attachmentId}`),
    onSuccess: onChanged,
  });

  return (
    <section className="rounded-xl border border-[--k-border] bg-[--k-surface] p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[14px] font-semibold flex items-center gap-2">
          <Paperclip className="h-4 w-4 text-[--k-primary]" />
          Pièces jointes ({order.attachments.length})
        </h2>
        {canEdit && (
          <label className="inline-flex items-center gap-1 rounded-lg border border-[--k-border] px-3 py-1.5 text-[13px] cursor-pointer hover:border-[--k-primary]">
            <Upload className="h-3.5 w-3.5" />
            {uploading ? 'Envoi…' : 'Ajouter'}
            <input
              type="file"
              className="hidden"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf"
              disabled={uploading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) upload(f);
                e.target.value = '';
              }}
            />
          </label>
        )}
      </div>

      {uploadError && (
        <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-[12px] text-rose-700">
          {uploadError}
        </div>
      )}

      {order.attachments.length === 0 ? (
        <p className="text-[12px] text-[--k-muted] italic">
          Aucune pièce jointe.
        </p>
      ) : (
        <ul className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {order.attachments.map((a) => (
            <AttachmentTile
              key={a.id}
              attachment={a}
              canDelete={canEdit}
              onDelete={() => {
                if (window.confirm(`Supprimer "${a.filename}" ?`))
                  deleteM.mutate(a.id);
              }}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function AttachmentTile({
  attachment,
  canDelete,
  onDelete,
}: {
  attachment: RepairAttachment;
  canDelete: boolean;
  onDelete: () => void;
}) {
  const isImage = attachment.mimeType.startsWith('image/');
  const fullUrl = attachment.url.startsWith('http')
    ? attachment.url
    : `${API_BASE_URL.replace(/\/api\/?$/, '')}${attachment.url}`;
  const sizeMb = (attachment.sizeBytes / (1024 * 1024)).toFixed(2);
  return (
    <li className="relative group rounded-lg border border-[--k-border] overflow-hidden bg-[--k-surface-2]/30">
      <a
        href={fullUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="block"
        title={attachment.filename}
      >
        {isImage ? (
          <img
            src={fullUrl}
            alt={attachment.filename}
            className="h-24 w-full object-cover"
          />
        ) : (
          <div className="h-24 flex items-center justify-center text-[--k-muted]">
            <FileText className="h-8 w-8" />
          </div>
        )}
        <div className="p-2">
          <div className="text-[11px] truncate">{attachment.filename}</div>
          <div className="text-[10px] text-[--k-muted]">{sizeMb} Mo</div>
        </div>
      </a>
      {canDelete && (
        <button
          type="button"
          onClick={onDelete}
          className="absolute top-1 right-1 rounded bg-white/90 p-1 text-[--k-muted] hover:text-rose-700 opacity-0 group-hover:opacity-100 transition"
          title="Supprimer"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      )}
    </li>
  );
}

// ─── Bloc 6 — Historique ─────────────────────────────────────────────────

function HistorySection({ events }: { events: RepairEvent[] }) {
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
      <ol className="relative p-4 space-y-3">
        {events.map((e) => (
          <li key={e.id} className="flex items-start gap-3 text-[13px]">
            <span className="mt-1.5 h-2.5 w-2.5 rounded-full bg-[--k-primary] shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-[--k-text]">{humanizeEvent(e)}</div>
              <div className="text-[11px] text-[--k-muted] mt-0.5">
                {new Date(e.createdAt).toLocaleString('fr-FR')}
                {e.actorName && ` · ${e.actorName}`}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function humanizeEvent(e: RepairEvent): string {
  const p = (e.payload || {}) as Record<string, unknown>;
  switch (e.eventType) {
    case 'STARTED':
      return 'Réparation démarrée';
    case 'STATUS_CHANGED':
      return `Statut : ${p.from ?? '—'} → ${p.to}`;
    case 'DIAGNOSIS_UPDATED':
      return 'Diagnostic mis à jour';
    case 'DIAGNOSIS_SOURCE_UPDATED':
      return 'Source du diagnostic mise à jour';
    case 'PRIORITY_UPDATED':
      return `Priorité : ${p.from ?? '—'} → ${p.to}`;
    case 'ON_HOLD':
      return `Mis en attente${p.reason ? ` : ${p.reason}` : ''}`;
    case 'RESUMED':
      return 'Repris';
    case 'COMPONENT_ADDED': {
      const kindLabel =
        p.kind === 'REPLACED'
          ? 'remplacé'
          : p.kind === 'CHECKED'
            ? 'contrôlé'
            : p.kind === 'DIAGNOSED'
              ? 'en diagnostic'
              : String(p.kind);
      return `Composant ${kindLabel} : ${p.productRef}${
        p.serialNumber ? ` (SN ${p.serialNumber})` : ''
      }${p.partState ? ` → ${p.partState}` : ''}`;
    }
    case 'COMPONENT_REMOVED':
      return `Composant retiré : ${p.productRef}${
        p.serialNumber ? ` (SN ${p.serialNumber})` : ''
      }${p.disposition ? ` → ${p.disposition}` : ''}`;
    case 'COMPONENT_INSTALLED':
      return `Composant installé : ${p.productRef}${
        p.serialNumber ? ` (SN ${p.serialNumber})` : ''
      }`;
    case 'COMPONENT_REVERTED':
      return `Composant retiré de la liste : ${p.productRef}`;
    case 'NOTES_UPDATED':
      return 'Notes mises à jour';
    case 'REPORT_UPDATED':
      return 'Compte-rendu mis à jour';
    case 'ATTACHMENT_ADDED':
      return `Pièce jointe ajoutée${p.filename ? ` : ${p.filename}` : ''}`;
    case 'ATTACHMENT_REMOVED':
      return `Pièce jointe supprimée${p.filename ? ` : ${p.filename}` : ''}`;
    case 'QUALITY_CHECKED':
      return `Contrôle qualité validé : ${p.checkId}`;
    case 'QUALITY_UNCHECKED':
      return `Contrôle qualité retiré : ${p.checkId}`;
    case 'COMPLETED':
      return `Réparation validée (${p.componentsCount ?? 0} composant(s))${
        p.finalResult ? ` — ${p.finalResult}` : ''
      }`;
    case 'CANCELLED':
      return `Annulé${p.reason ? ` : ${p.reason}` : ''}`;
    default:
      return e.eventType;
  }
}
