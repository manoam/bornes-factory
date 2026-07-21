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
  Package,
  Boxes,
  Shield,
  Wrench,
  History,
  PackagePlus,
  PackageMinus,
  PackageCheck,
  Rocket,
  RefreshCw,
  FileText,
  Hash as HashIcon,
  ShieldCheck,
  Ban,
  Flag,
} from 'lucide-react';
import api from '../services/api';
import QrScannerModal, { type ParsedQr } from '../components/QrScannerModal';
import OperatorAvatar from '../components/OperatorAvatar';
import SerialLink from '../components/SerialLink';
import AddComponentPanel from '../components/AddComponentPanel';

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

type PartType = 'EQUIPMENT' | 'PROTECTION' | 'ACCESSORY';

const PART_TYPE_LABEL: Record<PartType, string> = {
  EQUIPMENT: 'Équipement',
  PROTECTION: 'Protection',
  ACCESSORY: 'Accessoire',
};
// Ordre metier fixe : gros modules d'abord, puis protections, puis visserie.
const PART_TYPE_ORDER: PartType[] = ['EQUIPMENT', 'PROTECTION', 'ACCESSORY'];

const PART_TYPE_ICON: Record<PartType, typeof Boxes> = {
  EQUIPMENT: Boxes,
  PROTECTION: Shield,
  ACCESSORY: Wrench,
};

// Palette Tailwind par PartType (couleur du tab actif + accents).
const PART_TYPE_ACCENT: Record<PartType, { text: string; bg: string; border: string; ring: string; softBg: string; softText: string }> = {
  EQUIPMENT: {
    text: 'text-blue-700',
    bg: 'bg-blue-600',
    border: 'border-blue-600',
    ring: 'ring-blue-300',
    softBg: 'bg-blue-50',
    softText: 'text-blue-800',
  },
  PROTECTION: {
    text: 'text-emerald-700',
    bg: 'bg-emerald-600',
    border: 'border-emerald-600',
    ring: 'ring-emerald-300',
    softBg: 'bg-emerald-50',
    softText: 'text-emerald-800',
  },
  ACCESSORY: {
    text: 'text-amber-700',
    bg: 'bg-amber-600',
    border: 'border-amber-600',
    ring: 'ring-amber-300',
    softBg: 'bg-amber-50',
    softText: 'text-amber-800',
  },
};

interface ChecklistLine {
  productId: string;
  productReference: string;
  productDescription: string | null;
  /**
   * Type de piece (Equipement / Protection / Accessoire). Orthogonal a
   * partCategory qui decrit la localisation (Tete/Pied/Socle). Null si
   * l'admin Stock n'a pas encore tague le produit — les lignes null sont
   * CACHEES dans la checklist (decision explicite).
   */
  partType: PartType | null;
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

interface CategorySelectionPayload {
  componentId: string;
  productCategoryId: string;
  productId: string;
  productReference: string;
  serialNumber: string | null;
  quantity: number;
}

interface ChecklistPayload {
  model: string;
  lines: ChecklistLine[];
  extras: AssemblyComponent[];
  categorySelections: CategorySelectionPayload[];
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
          <OperatorAvatar name={order.operatorName} size="sm" />
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

  // On groupe les lignes par partType (Equipement / Protection / Accessoire)
  // et on cache celles sans partType. Les 3 tabs sont TOUJOURS affiches
  // (meme vides) pour que l'operateur voie la structure attendue.
  const groups = new Map<PartType, ChecklistLine[]>();
  for (const t of PART_TYPE_ORDER) groups.set(t, []);
  for (const line of checklist.lines) {
    if (!line.partType) continue; // decision explicite : cachees
    groups.get(line.partType)!.push(line);
  }
  const visibleCount = Array.from(groups.values()).reduce((s, arr) => s + arr.length, 0);
  const hiddenCount = checklist.lines.length - visibleCount;

  // Tab actif : par defaut le premier type qui contient qqch, sinon
  // simplement le premier (EQUIPMENT). Persiste en localStorage.
  const [activeTab, setActiveTab] = useState<PartType>(() => {
    try {
      const v = localStorage.getItem('assembly_checklist_tab');
      if (v && PART_TYPE_ORDER.includes(v as PartType)) return v as PartType;
    } catch {
      /* ignore */
    }
    return PART_TYPE_ORDER.find((t) => (groups.get(t) || []).length > 0) || PART_TYPE_ORDER[0];
  });
  useEffect(() => {
    try {
      localStorage.setItem('assembly_checklist_tab', activeTab);
    } catch {
      /* ignore */
    }
  }, [activeTab]);

  const activeGroup = groups.get(activeTab) || [];
  const activeComplete = activeGroup.filter((l) => l.complete).length;

  // Selections par ProductCategory, indexees pour lookup O(1) cote panel.
  const selectionsByCategory = useMemo(() => {
    const out: Record<string, CategorySelectionPayload> = {};
    for (const s of checklist.categorySelections || []) {
      out[s.productCategoryId] = s;
    }
    return out;
  }, [checklist.categorySelections]);

  // Progression globale = nombre de categories renseignees / nombre total
  // de selections cote serveur + lignes BOM completes. Simplification :
  // on se base sur categorySelections pour la progression atelier.
  const totalSelections = Object.keys(selectionsByCategory).length;
  const bomTotal = visibleCount;
  const bomComplete = checklist.completeCount;
  // Progress bar globale : combine BOM (si non vide) + selections libres.
  const globalDenom = bomTotal + Math.max(0, totalSelections - bomComplete);
  const globalNum = bomComplete + Math.max(0, totalSelections - bomComplete);
  const globalPct = globalDenom > 0
    ? Math.round((globalNum / globalDenom) * 100)
    : totalSelections > 0
      ? 100
      : 0;
  const activeAccent = PART_TYPE_ACCENT[activeTab];

  return (
    <section className="rounded-2xl border border-[--k-border] bg-[--k-surface] overflow-hidden shadow-sm shadow-black/[0.03]">
      {/* Header : titre + progress bar globale */}
      <header className="px-5 pt-4 pb-3 border-b border-[--k-border]">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-9 w-9 rounded-xl bg-[--k-primary]/10 flex items-center justify-center text-[--k-primary] shrink-0">
              <Package className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-[15px] font-semibold text-[--k-text] truncate">
                Composants à installer
              </h2>
              <p className="text-[11px] text-[--k-muted]">
                {totalSelections === 0
                  ? 'Aucun composant sélectionné'
                  : `${totalSelections} composant${totalSelections > 1 ? 's' : ''} sélectionné${totalSelections > 1 ? 's' : ''}`}
              </p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[13px] font-semibold text-[--k-text] tabular-nums">
              {globalPct}%
            </div>
            <div className="text-[11px] text-[--k-muted]">progression</div>
          </div>
        </div>
        {/* Progress bar */}
        <div className="mt-3 h-1.5 w-full rounded-full bg-[--k-surface-2] overflow-hidden">
          <div
            className="h-full rounded-full bg-[--k-primary] transition-[width] duration-500"
            style={{ width: `${globalPct}%` }}
          />
        </div>
      </header>

      {/* Barre de tabs — toujours affichee, meme si un ou plusieurs tabs sont vides */}
      <div className="flex items-stretch border-b border-[--k-border] bg-[--k-surface-2]/40">
        {PART_TYPE_ORDER.map((t) => {
          const arr = groups.get(t) || [];
          const complete = arr.filter((l) => l.complete).length;
          const total = arr.length;
          const accent = PART_TYPE_ACCENT[t];
          const Icon = PART_TYPE_ICON[t];
          const active = activeTab === t;
          const isDone = total > 0 && complete === total;
          // Compte cote selections utilisateur (pour l'affichage badge)
          const selectionsCount = Object.values(selectionsByCategory).filter((s) => {
            // On ne connait pas ici le partType de chaque selection sans lookup.
            // Approx : on compte les productCategoryId qui apparaissent dans les
            // lignes BOM du tab, sinon on prend les total selections globales / 3.
            // Simplification : on montre juste le compteur global BOM.
            void s;
            return false;
          }).length;
          void selectionsCount;
          return (
            <button
              key={t}
              type="button"
              onClick={() => setActiveTab(t)}
              className={`relative flex-1 px-3 py-3 text-[13px] font-medium transition flex items-center justify-center gap-2 border-b-2 -mb-[2px] ${
                active
                  ? `${accent.text} ${accent.border} bg-[--k-surface]`
                  : 'text-[--k-muted] border-transparent hover:text-[--k-text] hover:bg-[--k-surface]/60'
              }`}
            >
              <Icon className={`h-4 w-4 shrink-0 ${active ? accent.text : ''}`} />
              <span>{PART_TYPE_LABEL[t]}</span>
              {total > 0 && (
                <span
                  className={`inline-flex min-w-[36px] justify-center rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${
                    isDone
                      ? 'bg-emerald-100 text-emerald-800'
                      : active
                        ? `${accent.softBg} ${accent.softText}`
                        : 'bg-[--k-surface] text-[--k-muted]'
                  }`}
                >
                  {complete} / {total}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Contenu du tab actif */}
      <div className="p-4 space-y-4">
        {/* Lignes BOM (checklist figee) */}
        {activeGroup.length > 0 && (
          <div className="rounded-xl border border-[--k-border] overflow-hidden">
            <div className="flex items-center justify-between gap-2 bg-[--k-surface-2]/50 px-3 py-2">
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${activeAccent.bg}`} />
                <span className="text-[11px] uppercase tracking-wide text-[--k-muted] font-semibold">
                  Nomenclature — {PART_TYPE_LABEL[activeTab]}
                </span>
              </div>
              <span className="text-[11px] text-[--k-muted] tabular-nums font-medium">
                {activeComplete} / {activeGroup.length} complets
              </span>
            </div>
            <div className="divide-y divide-[--k-border]">
              {activeGroup.map((line) => (
                <ChecklistRow
                  key={line.productId}
                  assemblyId={assemblyId}
                  line={line}
                  editable={editable}
                  onChanged={onChanged}
                />
              ))}
            </div>
          </div>
        )}

        {/* Panel matrice categories */}
        {editable && (
          <AddComponentPanel
            assemblyId={assemblyId}
            partType={activeTab}
            selections={selectionsByCategory}
            onChanged={onChanged}
          />
        )}
      </div>

      {hiddenCount > 0 && (
        <div className="border-t border-[--k-border] px-4 py-2 bg-amber-50/40 text-[11px] text-amber-800 italic">
          {hiddenCount} pièce{hiddenCount > 1 ? 's' : ''} sans type masquée{hiddenCount > 1 ? 's' : ''} — à taguer côté Stock (champ « Type de pièce »).
        </div>
      )}

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
                <SerialLink
                  serialNumber={c.serialNumber}
                  productReference={c.productReference}
                  productId={c.productId}
                  quantity={c.quantity}
                  className="text-[--k-muted]"
                />
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
                <SerialLink
                  serialNumber={u.serialNumber}
                  productReference={line.productReference}
                  productId={line.productId}
                  quantity={u.quantity}
                  className="font-mono"
                />
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
        {checklist.lines
          .filter((line) => !!line.partType)
          .map((line) => (
            <li key={line.productId} className="px-4 py-2 flex items-center gap-3 text-[13px]">
              <CheckCircle2
                className={`h-4 w-4 ${
                  line.complete ? 'text-emerald-600' : 'text-[--k-muted]'
                }`}
              />
              <span className="flex-1 truncate">
                {line.productDescription || line.productReference}
              </span>
              {line.partType && (
                <span className="text-[10px] text-[--k-muted] uppercase tracking-wide">
                  {PART_TYPE_LABEL[line.partType]}
                </span>
              )}
              <span className="text-[--k-muted] tabular-nums">
                {line.installedQty} / {line.requiredQty}
              </span>
            </li>
          ))}
        {checklist.extras.map((c) => (
          <li key={c.id} className="px-4 py-2 flex items-center gap-3 text-[13px]">
            <Search className="h-4 w-4 text-[--k-muted]" />
            <span className="flex-1 truncate">{c.productReference} (extra)</span>
            <SerialLink
              serialNumber={c.serialNumber}
              productReference={c.productReference}
              productId={c.productId}
              quantity={c.quantity}
              className="text-[--k-muted]"
            />
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

// Metadata visuelle par type d'evenement — icone + couleur.
type EventMeta = {
  Icon: typeof Play;
  tone: 'primary' | 'success' | 'warning' | 'danger' | 'neutral' | 'info';
};
const EVENT_META: Record<string, EventMeta> = {
  STARTED:            { Icon: Rocket,         tone: 'primary' },
  STATUS_CHANGED:     { Icon: Flag,           tone: 'info' },
  COMPONENT_INSTALLED:{ Icon: PackagePlus,    tone: 'success' },
  COMPONENT_UPDATED:  { Icon: RefreshCw,      tone: 'info' },
  COMPONENT_REMOVED:  { Icon: PackageMinus,   tone: 'warning' },
  NOTES_UPDATED:      { Icon: FileText,       tone: 'neutral' },
  INTERNAL_NUMBER_SET:{ Icon: HashIcon,       tone: 'info' },
  QUALITY_CHECKED:    { Icon: ShieldCheck,    tone: 'success' },
  QUALITY_UNCHECKED:  { Icon: ShieldCheck,    tone: 'neutral' },
  COMPLETED:          { Icon: PackageCheck,   tone: 'success' },
  CANCELLED:          { Icon: Ban,            tone: 'danger' },
};

const TONE_CLASSES: Record<EventMeta['tone'], { badge: string; icon: string; ring: string }> = {
  primary: { badge: 'bg-[--k-primary]/10 text-[--k-primary]', icon: 'text-[--k-primary]', ring: 'ring-[--k-primary]/30' },
  success: { badge: 'bg-emerald-100 text-emerald-700', icon: 'text-emerald-600', ring: 'ring-emerald-200' },
  warning: { badge: 'bg-amber-100 text-amber-700', icon: 'text-amber-700', ring: 'ring-amber-200' },
  danger:  { badge: 'bg-rose-100 text-rose-700', icon: 'text-rose-600', ring: 'ring-rose-200' },
  info:    { badge: 'bg-sky-100 text-sky-700', icon: 'text-sky-600', ring: 'ring-sky-200' },
  neutral: { badge: 'bg-slate-100 text-slate-600', icon: 'text-slate-500', ring: 'ring-slate-200' },
};

function formatDay(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  if (sameDay(d, today)) return "Aujourd'hui";
  if (sameDay(d, yesterday)) return 'Hier';
  return d.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}
function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function HistorySection({ events }: { events: AssemblyEvent[] }) {
  if (events.length === 0) {
    return (
      <section className="rounded-2xl border border-[--k-border] bg-[--k-surface] p-5 shadow-sm shadow-black/[0.03]">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-xl bg-[--k-surface-2] flex items-center justify-center text-[--k-muted]">
            <History className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-[15px] font-semibold text-[--k-text]">Historique</h2>
            <p className="text-[12px] text-[--k-muted]">Aucun événement pour l'instant.</p>
          </div>
        </div>
      </section>
    );
  }

  // Groupement par jour (chaine "Aujourd'hui" / "Hier" / date longue).
  const groups = new Map<string, AssemblyEvent[]>();
  for (const e of events) {
    const key = formatDay(e.createdAt);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(e);
  }

  return (
    <section className="rounded-2xl border border-[--k-border] bg-[--k-surface] overflow-hidden shadow-sm shadow-black/[0.03]">
      <header className="flex items-center gap-2 px-4 py-2.5 border-b border-[--k-border]">
        <div className="h-7 w-7 rounded-lg bg-[--k-primary]/10 flex items-center justify-center text-[--k-primary] shrink-0">
          <History className="h-4 w-4" />
        </div>
        <h2 className="text-[14px] font-semibold text-[--k-text]">Historique</h2>
        <span className="text-[11px] text-[--k-muted]">
          · {events.length} événement{events.length > 1 ? 's' : ''}
        </span>
      </header>
      <div className="px-3 py-2 space-y-3">
        {Array.from(groups.entries()).map(([day, dayEvents]) => {
          // Regroupement style Slack : consecutive events du meme auteur = un bloc.
          type Bunch = { actorName: string | null; items: AssemblyEvent[] };
          const bunches: Bunch[] = [];
          for (const ev of dayEvents) {
            const last = bunches[bunches.length - 1];
            if (last && last.actorName === ev.actorName) {
              last.items.push(ev);
            } else {
              bunches.push({ actorName: ev.actorName, items: [ev] });
            }
          }
          return (
            <div key={day}>
              <div className="text-[10px] uppercase tracking-wide font-semibold text-[--k-muted] px-1 mb-1">
                {day}
              </div>
              <div className="space-y-2.5">
                {bunches.map((bunch, bIdx) => {
                  const firstEv = bunch.items[0];
                  return (
                    <div key={bIdx} className="flex gap-2.5">
                      {/* Avatar en gauche, aligne sur la 1ere ligne du bloc */}
                      <div className="pt-0.5 shrink-0">
                        <OperatorAvatar
                          name={bunch.actorName}
                          size="md"
                          showName={false}
                        />
                      </div>
                      {/* Bloc messages */}
                      <div className="flex-1 min-w-0">
                        {/* Header du bloc : nom + heure du 1er event */}
                        <div className="flex items-baseline gap-2 leading-tight">
                          <span className="text-[13px] font-semibold text-[--k-text] truncate">
                            {bunch.actorName || 'Système'}
                          </span>
                          <span className="text-[11px] text-[--k-muted] tabular-nums">
                            {formatTime(firstEv.createdAt)}
                          </span>
                        </div>
                        {/* Lignes d'evenements du bunch */}
                        <ul className="mt-0.5 space-y-0.5">
                          {bunch.items.map((e) => {
                            const meta = EVENT_META[e.eventType] || {
                              Icon: History,
                              tone: 'neutral' as const,
                            };
                            const tone = TONE_CLASSES[meta.tone];
                            return (
                              <li
                                key={e.id}
                                className="group flex items-start gap-1.5 text-[12.5px] leading-snug"
                                title={new Date(e.createdAt).toLocaleString('fr-FR')}
                              >
                                <span
                                  className={`shrink-0 mt-[3px] inline-flex h-4 w-4 items-center justify-center rounded ${tone.badge}`}
                                >
                                  <meta.Icon className={`h-2.5 w-2.5 ${tone.icon}`} />
                                </span>
                                <span className="text-[--k-text] min-w-0">
                                  {humanizeEventRich(e)}
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/**
 * Version React (JSX) de humanizeEvent pour pouvoir mettre en emphase
 * les references/SN/valeurs dans le rendu.
 */
function humanizeEventRich(e: AssemblyEvent): React.ReactNode {
  const p = (e.payload || {}) as Record<string, unknown>;
  const ref = typeof p.productRef === 'string' ? p.productRef : null;
  const desc =
    typeof p.productDescription === 'string' && p.productDescription
      ? p.productDescription
      : null;
  const sn = typeof p.serialNumber === 'string' && p.serialNumber ? p.serialNumber : null;
  const qty = typeof p.quantity === 'number' ? p.quantity : null;

  const RefBadge = ({ v }: { v: string }) => (
    <span className="font-mono text-[10.5px] bg-[--k-surface-2] text-[--k-muted] px-1.5 py-0.5 rounded">
      {v}
    </span>
  );

  // Rendu principal d'un composant : description en gras si dispo,
  // sinon reference. La reference apparait en petit a cote quand on a
  // la description (pour l'operateur qui veut retrouver via la ref).
  const productLabel = () => {
    if (desc) {
      return (
        <>
          <span className="font-medium text-[--k-text]">{desc}</span>
          {ref && (
            <>
              {' '}
              <RefBadge v={ref} />
            </>
          )}
        </>
      );
    }
    if (ref) {
      return (
        <span className="font-medium font-mono text-[12px] text-[--k-text]">{ref}</span>
      );
    }
    return null;
  };

  switch (e.eventType) {
    case 'STARTED':
      return <span className="font-medium">Assemblage démarré</span>;
    case 'STATUS_CHANGED':
      return (
        <>
          <span className="text-[--k-muted]">Statut :</span>{' '}
          <span className="font-medium">{String(p.from)}</span>
          <span className="text-[--k-muted]"> → </span>
          <span className="font-medium">{String(p.to)}</span>
        </>
      );
    case 'COMPONENT_INSTALLED':
      return (
        <>
          <span className="text-[--k-muted]">Installé :</span> {productLabel()}
          {sn && <> · <span className="text-[--k-muted]">SN</span> <RefBadge v={sn} /></>}
          {qty && qty > 1 && <> · <span className="text-[--k-muted]">×{qty}</span></>}
        </>
      );
    case 'COMPONENT_UPDATED':
      return (
        <>
          <span className="text-[--k-muted]">Modifié :</span> {productLabel()}
          {sn && <> · <span className="text-[--k-muted]">SN</span> <RefBadge v={sn} /></>}
          {qty && qty > 1 && <> · <span className="text-[--k-muted]">×{qty}</span></>}
        </>
      );
    case 'COMPONENT_REMOVED':
      return (
        <>
          <span className="text-[--k-muted]">Retiré :</span> {productLabel()}
          {sn && <> · <span className="text-[--k-muted]">SN</span> <RefBadge v={sn} /></>}
        </>
      );
    case 'NOTES_UPDATED':
      return <span className="font-medium">Notes mises à jour</span>;
    case 'INTERNAL_NUMBER_SET':
      return (
        <>
          <span className="font-medium">N° interne défini</span>
          {' '}<RefBadge v={String(p.value)} />
        </>
      );
    case 'QUALITY_CHECKED':
      return (
        <>
          <span className="font-medium">Contrôle qualité validé</span>
          {' '}<RefBadge v={String(p.checkId)} />
        </>
      );
    case 'QUALITY_UNCHECKED':
      return (
        <>
          <span className="font-medium">Contrôle qualité retiré</span>
          {' '}<RefBadge v={String(p.checkId)} />
        </>
      );
    case 'COMPLETED':
      return (
        <>
          <span className="font-medium">Borne validée</span>
          {p.internalNumber ? <> · <RefBadge v={String(p.internalNumber)} /></> : null}
          {typeof p.movementsCreated === 'number' && p.movementsCreated > 0 && (
            <span className="text-[--k-muted]"> · {p.movementsCreated} mouvement{p.movementsCreated > 1 ? 's' : ''} Stock</span>
          )}
        </>
      );
    case 'CANCELLED':
      return (
        <>
          <span className="font-medium">Assemblage annulé</span>
          {p.reason ? <span className="text-[--k-muted]"> · {String(p.reason)}</span> : null}
        </>
      );
    default:
      return <span className="text-[--k-muted]">{e.eventType}</span>;
  }
}
