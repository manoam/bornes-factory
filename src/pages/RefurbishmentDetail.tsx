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
  Plus,
  AlertTriangle,
  Recycle,
  Wrench,
  Package,
  Sparkles,
  History,
  Rocket,
  Flag,
  PackagePlus,
  PackageMinus,
  PackageCheck,
  RefreshCw,
  FileText,
  ShieldCheck,
  Ban,
} from 'lucide-react';
import api from '../services/api';
import QrScannerModal, { type ParsedQr } from '../components/QrScannerModal';
import OperatorAvatar from '../components/OperatorAvatar';
import SerialLink from '../components/SerialLink';
import PriorityBadge from '../components/PriorityBadge';

type Status = 'DRAFT' | 'IN_PROGRESS' | 'TESTING' | 'COMPLETED' | 'CANCELLED';
type Action = 'REMOVED' | 'INSTALLED';
type Disposition = 'STOCK_NEW' | 'STOCK_USED' | 'TO_TEST' | 'SCRAP';

interface RefurbComponent {
  id: string;
  action: Action;
  productId: string;
  productReference: string;
  serialNumber: string | null;
  quantity: number;
  disposition: Disposition | null;
  stockMovementId: string | null;
  createdAt: string;
}

type Priority = 'NORMAL' | 'HIGH' | 'URGENT';

interface Refurbishment {
  id: string;
  borneInternalNumber: string;
  sourceApp: string;
  status: Status;
  priority: Priority;
  reason: string | null;
  operatorId: string | null;
  operatorName: string | null;
  notes: string | null;
  qualityChecks: string[] | null;
  startedAt: string | null;
  completedAt: string | null;
  createdByName: string | null;
  createdAt: string;
  components: RefurbComponent[];
}

interface BorneInfo {
  internalNumber: string;
  sourceApp: string;
  factoryAssembly: {
    id: string;
    model: string;
    completedAt: string | null;
  } | null;
  parcBorne: {
    numero_formated: string;
    gamme_nom: string | null;
    etat_nom: string | null;
    parc_nom: string | null;
    client_enseigne: string | null;
    antenne_ville: string | null;
  } | null;
  parcError: string | null;
}

interface Suggestion {
  productId: string;
  productReference: string;
  serialNumber: string | null;
  quantity: number;
  alreadyRemoved: boolean;
}

interface RefurbEvent {
  id: string;
  eventType: string;
  payload: Record<string, unknown> | null;
  actorName: string | null;
  createdAt: string;
}

const STATUS_META: Record<Status, { label: string; cls: string }> = {
  DRAFT: { label: 'Brouillon', cls: 'bg-slate-100 text-slate-700' },
  IN_PROGRESS: { label: 'En cours', cls: 'bg-amber-100 text-amber-800' },
  TESTING: { label: 'En test', cls: 'bg-blue-100 text-blue-800' },
  COMPLETED: { label: 'Terminé', cls: 'bg-emerald-100 text-emerald-800' },
  CANCELLED: { label: 'Annulé', cls: 'bg-rose-100 text-rose-800' },
};

const DISPOSITION_LABEL: Record<Disposition, string> = {
  STOCK_NEW: 'Stock neuf',
  STOCK_USED: 'Stock occasion',
  TO_TEST: 'À tester',
  SCRAP: 'Rebut',
};

// ─── Page ────────────────────────────────────────────────────────────────

export default function RefurbishmentDetail() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();

  const refurbQ = useQuery({
    queryKey: ['refurbishment', id],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: Refurbishment }>(
        `/refurbishments/${id}`,
      );
      return res.data.data;
    },
    enabled: !!id,
  });

  const borneQ = useQuery({
    queryKey: ['refurbishment-borne', id],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: BorneInfo }>(
        `/refurbishments/${id}/borne-info`,
      );
      return res.data.data;
    },
    enabled: !!id,
    retry: false,
  });

  const suggestQ = useQuery({
    queryKey: ['refurbishment-suggestions', id],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: { items: Suggestion[] } }>(
        `/refurbishments/${id}/suggestions`,
      );
      return res.data.data.items;
    },
    enabled: !!id,
  });

  const checklistQ = useQuery({
    queryKey: ['refurbishment-checklist', id],
    queryFn: async () => {
      const res = await api.get<{
        success: boolean;
        data: { qualityChecks: { id: string; label: string }[]; checked: string[] };
      }>(`/refurbishments/${id}/checklist`);
      return res.data.data;
    },
    enabled: !!id,
  });

  const historyQ = useQuery({
    queryKey: ['refurbishment-history', id],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: RefurbEvent[] }>(
        `/refurbishments/${id}/history`,
      );
      return res.data.data;
    },
    enabled: !!id,
  });

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['refurbishment', id] });
    qc.invalidateQueries({ queryKey: ['refurbishment-suggestions', id] });
    qc.invalidateQueries({ queryKey: ['refurbishment-checklist', id] });
    qc.invalidateQueries({ queryKey: ['refurbishment-history', id] });
  };

  const transitionM = useMutation({
    mutationFn: async (payload: {
      to: 'IN_PROGRESS' | 'TESTING' | 'COMPLETED' | 'CANCELLED';
      reason?: string;
    }) => {
      const res = await api.post(`/refurbishments/${id}/transition`, payload);
      return res.data;
    },
    onSuccess: invalidateAll,
  });

  const updateM = useMutation({
    mutationFn: async (payload: { notes?: string; qualityChecks?: string[]; reason?: string }) => {
      await api.patch(`/refurbishments/${id}`, payload);
    },
    onSuccess: invalidateAll,
  });

  if (refurbQ.isLoading || !refurbQ.data) {
    return (
      <div className="p-6 flex items-center gap-2 text-[--k-muted]">
        <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
      </div>
    );
  }
  const refurb = refurbQ.data;
  const isClosed = refurb.status === 'COMPLETED' || refurb.status === 'CANCELLED';
  const canAddComponents = refurb.status === 'IN_PROGRESS';

  return (
    <div className="space-y-4">
      <Link
        to="/refurbishments"
        className="text-[12px] text-[--k-primary] inline-flex items-center gap-1"
      >
        <ArrowLeft className="h-3 w-3" />
        Tous les reconditionnements
      </Link>

      <Header
        refurb={refurb}
        transitionPending={transitionM.isPending}
        transitionError={
          (transitionM.error as { response?: { data?: { error?: string } } } | null)?.response
            ?.data?.error || null
        }
        onTransition={(to, extras) => transitionM.mutate({ to, ...extras })}
        onReasonChange={(value) => updateM.mutate({ reason: value || undefined })}
      />

      <BorneInfoSection info={borneQ.data} isLoading={borneQ.isLoading} />

      {canAddComponents && suggestQ.data && (
        <SuggestionsSection
          suggestions={suggestQ.data}
          refurbId={refurb.id}
          onChanged={invalidateAll}
        />
      )}

      <ComponentsSection
        components={refurb.components}
        canEdit={canAddComponents}
        refurbId={refurb.id}
        onChanged={invalidateAll}
      />

      {checklistQ.data && (
        <NotesAndQualitySection
          refurb={refurb}
          qualityChecks={checklistQ.data.qualityChecks}
          readOnly={isClosed}
          onSave={updateM.mutate}
        />
      )}

      <HistorySection events={historyQ.data || []} />
    </div>
  );
}

// ─── Header ──────────────────────────────────────────────────────────────

function Header({
  refurb,
  transitionPending,
  transitionError,
  onTransition,
  onReasonChange,
}: {
  refurb: Refurbishment;
  transitionPending: boolean;
  transitionError: string | null;
  onTransition: (
    to: 'IN_PROGRESS' | 'TESTING' | 'COMPLETED' | 'CANCELLED',
    extras?: { reason?: string },
  ) => void;
  onReasonChange: (value: string) => void;
}) {
  const [editingReason, setEditingReason] = useState(false);
  const [reasonDraft, setReasonDraft] = useState(refurb.reason || '');
  useEffect(() => setReasonDraft(refurb.reason || ''), [refurb.reason]);
  const meta = STATUS_META[refurb.status];
  const isClosed = refurb.status === 'COMPLETED' || refurb.status === 'CANCELLED';

  return (
    <section className="rounded-xl border border-[--k-border] bg-[--k-surface] p-4 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold font-mono flex items-center gap-2">
            <Recycle className="h-5 w-5 text-[--k-primary]" />
            <Link
              to={`/bornes/${encodeURIComponent(refurb.borneInternalNumber)}`}
              className="hover:underline"
              title="Vie de cette borne"
            >
              {refurb.borneInternalNumber}
            </Link>
          </h1>
          <p className="text-[12px] text-[--k-muted]">
            Reconditionnement ·{' '}
            {refurb.sourceApp === 'factory'
              ? 'borne Factory'
              : refurb.sourceApp === 'bornes'
                ? 'borne du parc'
                : 'non résolue'}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <PriorityBadge priority={refurb.priority} />
          <span className={`inline-flex rounded-full px-2.5 py-1 text-[12px] font-semibold ${meta.cls}`}>
            {meta.label}
          </span>
        </div>
      </div>

      <div>
        <div className="text-[11px] uppercase tracking-wide text-[--k-muted] mb-0.5">
          Motif
        </div>
        {editingReason && !isClosed ? (
          <div className="flex gap-2 items-start">
            <textarea
              className="input-field py-2 min-h-[60px] flex-1"
              value={reasonDraft}
              onChange={(e) => setReasonDraft(e.target.value)}
              autoFocus
            />
            <button
              type="button"
              onClick={() => {
                onReasonChange(reasonDraft.trim());
                setEditingReason(false);
              }}
              className="rounded-lg bg-[--k-primary] text-white px-3 py-2 text-[12px]"
            >
              OK
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => !isClosed && setEditingReason(true)}
            className="text-[--k-text] text-left hover:text-[--k-primary] disabled:cursor-default"
            disabled={isClosed}
          >
            {refurb.reason || (
              <span className="italic text-[--k-muted]">Aucun motif saisi</span>
            )}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[13px]">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-[--k-muted] mb-0.5">
            Opérateur
          </div>
          <OperatorAvatar name={refurb.operatorName} size="sm" />
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-[--k-muted] mb-0.5">
            Démarré le
          </div>
          {refurb.startedAt
            ? new Date(refurb.startedAt).toLocaleString('fr-FR')
            : '—'}
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-[--k-muted] mb-0.5">
            Créé par
          </div>
          <OperatorAvatar name={refurb.createdByName} size="sm" />
        </div>
      </div>

      {!isClosed && (
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[--k-border]">
          {refurb.status === 'DRAFT' && (
            <button
              type="button"
              onClick={() => onTransition('IN_PROGRESS')}
              disabled={transitionPending}
              className="rounded-lg bg-[--k-primary] text-white px-3 py-2 text-[13px] font-medium inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              <Play className="h-4 w-4" /> Démarrer le reconditionnement
            </button>
          )}
          {refurb.status === 'IN_PROGRESS' && (
            <button
              type="button"
              onClick={() => onTransition('TESTING')}
              disabled={transitionPending}
              className="rounded-lg bg-[--k-primary] text-white px-3 py-2 text-[13px] font-medium inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              <Beaker className="h-4 w-4" /> Lancer les tests
            </button>
          )}
          {refurb.status === 'TESTING' && (
            <>
              <button
                type="button"
                onClick={() => onTransition('COMPLETED')}
                disabled={transitionPending}
                className="rounded-lg bg-emerald-600 text-white px-3 py-2 text-[13px] font-medium inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                <CheckCircle2 className="h-4 w-4" /> Valider le reconditionnement
              </button>
              <button
                type="button"
                onClick={() => onTransition('IN_PROGRESS')}
                disabled={transitionPending}
                className="rounded-lg border border-[--k-border] px-3 py-2 text-[13px] font-medium"
              >
                Retour atelier
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => {
              const reason = window.prompt("Motif d'annulation (facultatif) ?") || '';
              if (window.confirm("Annuler ce reconditionnement ? L'action est définitive.")) {
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
    </section>
  );
}

// ─── Borne info ──────────────────────────────────────────────────────────

function BorneInfoSection({ info, isLoading }: { info: BorneInfo | undefined; isLoading: boolean }) {
  if (isLoading) {
    return (
      <section className="rounded-xl border border-[--k-border] bg-[--k-surface] p-4 text-[13px] text-[--k-muted] flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Recherche de la borne…
      </section>
    );
  }
  if (!info) return null;

  const showFactory = !!info.factoryAssembly;
  const showParc = !!info.parcBorne;

  if (!showFactory && !showParc) {
    return (
      <section className="rounded-xl border border-amber-200 bg-amber-50 p-4">
        <h2 className="text-[14px] font-semibold text-amber-900 mb-1 flex items-center gap-2">
          <Recycle className="h-4 w-4" />
          Borne non résolue
        </h2>
        <p className="text-[13px] text-amber-800">
          Le numéro <span className="font-mono">{info.internalNumber}</span> n'a
          été trouvé ni côté Factory ni dans l'app Bornes. Vous pouvez continuer
          le reconditionnement, mais sans traçabilité de la composition d'origine.
        </p>
        {info.parcError && (
          <p className="text-[11px] italic text-amber-700/80 mt-1">
            (API Bornes: {info.parcError})
          </p>
        )}
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-[--k-border] bg-[--k-surface]">
      <header className="px-4 py-3 border-b border-[--k-border]">
        <h2 className="text-[14px] font-semibold flex items-center gap-2">
          <Recycle className="h-4 w-4 text-[--k-primary]" />
          Borne concernée
        </h2>
      </header>
      <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-6 text-[13px]">
        {showParc && info.parcBorne && (
          <div>
            <h3 className="text-[11px] uppercase tracking-wide text-[--k-muted] mb-1 font-semibold">
              Parc Bornes
            </h3>
            <ul className="space-y-1">
              <li>
                <strong>Gamme:</strong> {info.parcBorne.gamme_nom || '—'}
              </li>
              <li>
                <strong>État:</strong> {info.parcBorne.etat_nom || '—'}
              </li>
              <li>
                <strong>Parc:</strong> {info.parcBorne.parc_nom || '—'}
              </li>
              {info.parcBorne.client_enseigne && (
                <li>
                  <strong>Client:</strong> {info.parcBorne.client_enseigne}
                </li>
              )}
              {info.parcBorne.antenne_ville && (
                <li>
                  <strong>Antenne:</strong> {info.parcBorne.antenne_ville}
                </li>
              )}
            </ul>
          </div>
        )}

        {showFactory && info.factoryAssembly && (
          <div>
            <h3 className="text-[11px] uppercase tracking-wide text-[--k-muted] mb-1 font-semibold">
              Composition d'origine (Factory)
            </h3>
            <p className="text-[12px] text-[--k-muted] mb-2">
              Modèle {info.factoryAssembly.model} — validée le{' '}
              {info.factoryAssembly.completedAt
                ? new Date(info.factoryAssembly.completedAt).toLocaleDateString('fr-FR')
                : '—'}
            </p>
            <Link
              to={`/produced-bornes/${info.factoryAssembly.id}`}
              className="text-[11px] text-[--k-primary] hover:underline mt-1 inline-block"
            >
              Voir la fiche produite →
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}

// ─── Suggestions ─────────────────────────────────────────────────────────

/**
 * Composants d'origine encore présents dans la borne. Un clic sur "Retirer"
 * ouvre une modale rapide avec réf + SN pré-remplis, l'opérateur choisit
 * juste la disposition.
 */
function SuggestionsSection({
  suggestions,
  refurbId,
  onChanged,
}: {
  suggestions: Suggestion[];
  refurbId: string;
  onChanged: () => void;
}) {
  const remaining = suggestions.filter((s) => !s.alreadyRemoved);
  const [pending, setPending] = useState<Suggestion | null>(null);

  if (remaining.length === 0) return null;

  return (
    <section className="rounded-xl border border-indigo-200 bg-indigo-50/40">
      <header className="px-4 py-3 border-b border-indigo-200 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-indigo-700" />
        <h2 className="text-[14px] font-semibold text-indigo-900">
          Composition d'origine ({remaining.length} à retirer)
        </h2>
      </header>
      <ul className="divide-y divide-indigo-200/70 max-h-[280px] overflow-y-auto">
        {remaining.map((s) => (
          <li
            key={`${s.productId}::${s.serialNumber || ''}`}
            className="flex items-center gap-2 px-4 py-2 text-[13px]"
          >
            <span className="font-mono text-[12px] text-[--k-muted]">
              {s.productReference}
            </span>
            <SerialLink
              serialNumber={s.serialNumber}
              productReference={s.productReference}
              productId={s.productId}
              quantity={s.quantity}
              className="text-[--k-text]"
            />
            <button
              type="button"
              onClick={() => setPending(s)}
              className="ml-auto rounded-lg bg-indigo-600 text-white px-2 py-1 text-[12px]"
            >
              Retirer
            </button>
          </li>
        ))}
      </ul>

      {pending && (
        <QuickRemoveModal
          suggestion={pending}
          refurbId={refurbId}
          onDone={() => {
            setPending(null);
            onChanged();
          }}
          onCancel={() => setPending(null)}
        />
      )}
    </section>
  );
}

function QuickRemoveModal({
  suggestion,
  refurbId,
  onDone,
  onCancel,
}: {
  suggestion: Suggestion;
  refurbId: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [disposition, setDisposition] = useState<Disposition>('STOCK_USED');
  const [quantity, setQuantity] = useState(suggestion.quantity);

  const addM = useMutation({
    mutationFn: async () => {
      await api.post(`/refurbishments/${refurbId}/components`, {
        action: 'REMOVED',
        productId: suggestion.productId,
        productReference: suggestion.productReference,
        serialNumber: suggestion.serialNumber,
        quantity,
        disposition,
      });
    },
    onSuccess: onDone,
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-[--k-surface] rounded-xl w-full max-w-md shadow-xl">
        <div className="px-4 py-3 border-b border-[--k-border]">
          <h2 className="font-semibold">Retirer un composant</h2>
        </div>
        <div className="p-4 space-y-3">
          <div className="text-[13px]">
            <span className="font-mono text-[--k-muted]">{suggestion.productReference}</span>
            {' — '}
            <span>{suggestion.serialNumber || `qté ${suggestion.quantity}`}</span>
          </div>
          <div>
            <label className="text-[12px] font-medium text-[--k-muted]">Quantité</label>
            <input
              type="number"
              min={1}
              className="input-field"
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
            />
          </div>
          <div>
            <label className="text-[12px] font-medium text-[--k-muted]">Disposition</label>
            <select
              className="input-field"
              value={disposition}
              onChange={(e) => setDisposition(e.target.value as Disposition)}
            >
              <option value="STOCK_USED">Stock occasion (bon état)</option>
              <option value="STOCK_NEW">Stock neuf</option>
              <option value="TO_TEST">À tester (SAV)</option>
              <option value="SCRAP">Rebut</option>
            </select>
          </div>
        </div>
        <div className="px-4 py-3 border-t border-[--k-border] flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-[--k-border] px-3 py-1.5 text-[13px]"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={() => addM.mutate()}
            disabled={addM.isPending}
            className="rounded-lg bg-[--k-primary] text-white px-3 py-1.5 text-[13px] font-medium disabled:opacity-50"
          >
            {addM.isPending ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Components section ─────────────────────────────────────────────────

function ComponentsSection({
  components,
  canEdit,
  refurbId,
  onChanged,
}: {
  components: RefurbComponent[];
  canEdit: boolean;
  refurbId: string;
  onChanged: () => void;
}) {
  const removed = components.filter((c) => c.action === 'REMOVED');
  const installed = components.filter((c) => c.action === 'INSTALLED');
  const [showForm, setShowForm] = useState<Action | null>(null);

  return (
    <section className="rounded-xl border border-[--k-border] bg-[--k-surface]">
      <header className="px-4 py-3 border-b border-[--k-border] flex items-center justify-between">
        <h2 className="text-[14px] font-semibold flex items-center gap-2">
          <Wrench className="h-4 w-4 text-[--k-primary]" />
          Composants ({components.length})
        </h2>
        {canEdit && !showForm && (
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setShowForm('REMOVED')}
              className="inline-flex items-center gap-1 rounded-lg border border-rose-200 text-rose-700 px-2 py-1 text-[12px]"
            >
              <Package className="h-3.5 w-3.5" />
              Retirer
            </button>
            <button
              type="button"
              onClick={() => setShowForm('INSTALLED')}
              className="inline-flex items-center gap-1 rounded-lg bg-[--k-primary] text-white px-2 py-1 text-[12px]"
            >
              <Plus className="h-3.5 w-3.5" />
              Installer
            </button>
          </div>
        )}
      </header>

      {showForm && (
        <AddForm
          action={showForm}
          refurbId={refurbId}
          onDone={() => {
            setShowForm(null);
            onChanged();
          }}
          onCancel={() => setShowForm(null)}
        />
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-[--k-border]">
        <ComponentList
          title="Retirés"
          items={removed}
          empty="Aucun composant retiré."
          badgeColor="bg-rose-50 text-rose-700"
          canEdit={canEdit}
          refurbId={refurbId}
          onDeleted={onChanged}
        />
        <ComponentList
          title="Installés"
          items={installed}
          empty="Aucun composant installé."
          badgeColor="bg-emerald-50 text-emerald-700"
          canEdit={canEdit}
          refurbId={refurbId}
          onDeleted={onChanged}
        />
      </div>
    </section>
  );
}

function ComponentList({
  title,
  items,
  empty,
  badgeColor,
  canEdit,
  refurbId,
  onDeleted,
}: {
  title: string;
  items: RefurbComponent[];
  empty: string;
  badgeColor: string;
  canEdit: boolean;
  refurbId: string;
  onDeleted: () => void;
}) {
  return (
    <div className="p-4 space-y-2">
      <h3 className={`text-[11px] uppercase tracking-wide font-semibold rounded-full inline-block px-2 py-0.5 ${badgeColor}`}>
        {title} · {items.length}
      </h3>
      {items.length === 0 ? (
        <p className="text-[12px] text-[--k-muted] italic">{empty}</p>
      ) : (
        <ul className="space-y-1">
          {items.map((c) => (
            <ComponentItem
              key={c.id}
              c={c}
              canEdit={canEdit}
              refurbId={refurbId}
              onDeleted={onDeleted}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function ComponentItem({
  c,
  canEdit,
  refurbId,
  onDeleted,
}: {
  c: RefurbComponent;
  canEdit: boolean;
  refurbId: string;
  onDeleted: () => void;
}) {
  const removeM = useMutation({
    mutationFn: () => api.delete(`/refurbishments/${refurbId}/components/${c.id}`),
    onSuccess: onDeleted,
  });
  return (
    <li className="flex items-center gap-2 text-[12px]">
      <span className="font-mono text-[--k-muted]">{c.productReference}</span>
      <SerialLink
        serialNumber={c.serialNumber}
        productReference={c.productReference}
        productId={c.productId}
        quantity={c.quantity}
        className="text-[--k-text]"
      />
      {c.disposition && (
        <span className="text-[10px] rounded-full bg-slate-100 px-1.5 py-0.5">
          {DISPOSITION_LABEL[c.disposition]}
        </span>
      )}
      {canEdit && (
        <button
          type="button"
          onClick={() => {
            if (window.confirm('Retirer ce composant de la liste ?')) removeM.mutate();
          }}
          className="text-[--k-muted] hover:text-rose-700 ml-auto"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      )}
    </li>
  );
}

// ─── Add component form ─────────────────────────────────────────────────

function AddForm({
  action,
  refurbId,
  onDone,
  onCancel,
}: {
  action: Action;
  refurbId: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [productRef, setProductRef] = useState('');
  const [productId, setProductId] = useState('');
  const [serial, setSerial] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [disposition, setDisposition] = useState<Disposition>('STOCK_USED');
  const [scannerOpen, setScannerOpen] = useState(false);

  const addM = useMutation({
    mutationFn: async (payload: {
      productId: string;
      productReference: string;
      serialNumber?: string | null;
      quantity: number;
      disposition?: Disposition;
    }) => {
      await api.post(`/refurbishments/${refurbId}/components`, {
        action,
        ...payload,
      });
    },
    onSuccess: onDone,
  });

  const handleScan = async (parsed: ParsedQr) => {
    setScannerOpen(false);
    if (parsed.kind === 'unknown') return;
    setProductId(parsed.id);
    setProductRef(parsed.raw);
  };

  const submit = () => {
    addM.mutate({
      productId: productId || productRef,
      productReference: productRef,
      serialNumber: serial.trim() || null,
      quantity,
      disposition: action === 'REMOVED' ? disposition : undefined,
    });
  };

  const canSubmit = !!productRef.trim() && quantity > 0;

  return (
    <div className="border-b border-[--k-border] px-4 py-3 bg-[--k-surface-2]/40 space-y-2">
      <div className="text-[12px] font-semibold text-[--k-text]">
        {action === 'REMOVED' ? 'Retirer un composant' : 'Installer un composant'}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div>
          <label className="text-[11px] text-[--k-muted]">Référence produit / ID</label>
          <div className="flex gap-1">
            <input
              className="input-field font-mono"
              value={productRef}
              onChange={(e) => setProductRef(e.target.value)}
              placeholder="ex : B0CRMQCYXH"
            />
            <button
              type="button"
              onClick={() => setScannerOpen(true)}
              className="rounded-lg border border-[--k-border] px-2 text-[--k-muted]"
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
        {action === 'REMOVED' && (
          <div>
            <label className="text-[11px] text-[--k-muted]">Disposition</label>
            <select
              className="input-field"
              value={disposition}
              onChange={(e) => setDisposition(e.target.value as Disposition)}
            >
              <option value="STOCK_USED">Stock occasion (bon état)</option>
              <option value="STOCK_NEW">Stock neuf</option>
              <option value="TO_TEST">À tester (SAV)</option>
              <option value="SCRAP">Rebut</option>
            </select>
          </div>
        )}
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
          onClick={submit}
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

// ─── Notes & quality ────────────────────────────────────────────────────

function NotesAndQualitySection({
  refurb,
  qualityChecks,
  readOnly,
  onSave,
}: {
  refurb: Refurbishment;
  qualityChecks: { id: string; label: string }[];
  readOnly: boolean;
  onSave: (payload: { notes?: string; qualityChecks?: string[] }) => void;
}) {
  const [notes, setNotes] = useState(refurb.notes || '');
  useEffect(() => setNotes(refurb.notes || ''), [refurb.notes]);

  const checked = useMemo(
    () => new Set<string>(refurb.qualityChecks || []),
    [refurb.qualityChecks],
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
            if (notes !== (refurb.notes || '')) onSave({ notes });
          }}
          disabled={readOnly}
          placeholder="Observations, précautions, référence intervention…"
        />
      </div>
      <div>
        <div className="text-[12px] font-medium text-[--k-muted] mb-2">
          Contrôles qualité ({checked.size} / {qualityChecks.length})
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
                  className={`h-4 w-4 rounded border flex items-center justify-center ${
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
    </section>
  );
}

// ─── History (style chat) ──────────────────────────────────────────────

type EventMeta = {
  Icon: typeof Play;
  tone: 'primary' | 'success' | 'warning' | 'danger' | 'neutral' | 'info';
};
const EVENT_META: Record<string, EventMeta> = {
  STARTED:            { Icon: Rocket,       tone: 'primary' },
  STATUS_CHANGED:     { Icon: Flag,         tone: 'info' },
  REASON_UPDATED:     { Icon: FileText,     tone: 'neutral' },
  COMPONENT_INSTALLED:{ Icon: PackagePlus,  tone: 'success' },
  COMPONENT_REMOVED:  { Icon: PackageMinus, tone: 'warning' },
  COMPONENT_REVERTED: { Icon: RefreshCw,    tone: 'info' },
  NOTES_UPDATED:      { Icon: FileText,     tone: 'neutral' },
  QUALITY_CHECKED:    { Icon: ShieldCheck,  tone: 'success' },
  QUALITY_UNCHECKED:  { Icon: ShieldCheck,  tone: 'neutral' },
  COMPLETED:          { Icon: PackageCheck, tone: 'success' },
  CANCELLED:          { Icon: Ban,          tone: 'danger' },
};

const TONE_CLASSES: Record<EventMeta['tone'], { badge: string; icon: string }> = {
  primary: { badge: 'bg-[--k-primary]/10 text-[--k-primary]', icon: 'text-[--k-primary]' },
  success: { badge: 'bg-emerald-100 text-emerald-700', icon: 'text-emerald-600' },
  warning: { badge: 'bg-amber-100 text-amber-700', icon: 'text-amber-700' },
  danger:  { badge: 'bg-rose-100 text-rose-700', icon: 'text-rose-600' },
  info:    { badge: 'bg-sky-100 text-sky-700', icon: 'text-sky-600' },
  neutral: { badge: 'bg-slate-100 text-slate-600', icon: 'text-slate-500' },
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

function HistorySection({ events }: { events: RefurbEvent[] }) {
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

  const groups = new Map<string, RefurbEvent[]>();
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
          type Bunch = { actorName: string | null; items: RefurbEvent[] };
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
                      <div className="pt-0.5 shrink-0">
                        <OperatorAvatar
                          name={bunch.actorName}
                          size="lg"
                          showName={false}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2 leading-tight">
                          <span className="text-[13px] font-semibold text-[--k-text] truncate">
                            {bunch.actorName || 'Système'}
                          </span>
                          <span className="text-[11px] text-[--k-muted] tabular-nums">
                            {formatTime(firstEv.createdAt)}
                          </span>
                        </div>
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

function humanizeEventRich(e: RefurbEvent): React.ReactNode {
  const p = (e.payload || {}) as Record<string, unknown>;
  const ref = typeof p.productRef === 'string' ? p.productRef : null;
  const desc =
    typeof p.productDescription === 'string' && p.productDescription
      ? p.productDescription
      : null;
  const sn = typeof p.serialNumber === 'string' && p.serialNumber ? p.serialNumber : null;
  const qty = typeof p.quantity === 'number' ? p.quantity : null;
  const disposition = typeof p.disposition === 'string' ? p.disposition : null;

  const RefBadge = ({ v }: { v: string }) => (
    <span className="font-mono text-[10.5px] bg-[--k-surface-2] text-[--k-muted] px-1.5 py-0.5 rounded">
      {v}
    </span>
  );

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
      return <span className="font-medium font-mono text-[12px] text-[--k-text]">{ref}</span>;
    }
    return null;
  };

  switch (e.eventType) {
    case 'STARTED':
      return <span className="font-medium">Reconditionnement démarré</span>;
    case 'STATUS_CHANGED':
      return (
        <>
          <span className="text-[--k-muted]">Statut :</span>{' '}
          <span className="font-medium">{String(p.from ?? '—')}</span>
          <span className="text-[--k-muted]"> → </span>
          <span className="font-medium">{String(p.to)}</span>
        </>
      );
    case 'REASON_UPDATED':
      return <span className="font-medium">Motif mis à jour</span>;
    case 'COMPONENT_INSTALLED':
      return (
        <>
          <span className="text-[--k-muted]">Installé :</span> {productLabel()}
          {sn && <> · <span className="text-[--k-muted]">SN</span> <RefBadge v={sn} /></>}
          {qty && qty > 1 && <> · <span className="text-[--k-muted]">×{qty}</span></>}
        </>
      );
    case 'COMPONENT_REMOVED':
      return (
        <>
          <span className="text-[--k-muted]">Retiré :</span> {productLabel()}
          {sn && <> · <span className="text-[--k-muted]">SN</span> <RefBadge v={sn} /></>}
          {qty && qty > 1 && <> · <span className="text-[--k-muted]">×{qty}</span></>}
          {disposition && (
            <> · <RefBadge v={DISPOSITION_LABEL[disposition as Disposition] || disposition} /></>
          )}
        </>
      );
    case 'COMPONENT_REVERTED':
      return (
        <>
          <span className="text-[--k-muted]">Retiré de la liste :</span> {productLabel()}
        </>
      );
    case 'NOTES_UPDATED':
      return <span className="font-medium">Notes mises à jour</span>;
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
          <span className="font-medium">Reconditionnement validé</span>
          {typeof p.componentsCount === 'number' && p.componentsCount > 0 && (
            <span className="text-[--k-muted]"> · {p.componentsCount} composant{p.componentsCount > 1 ? 's' : ''}</span>
          )}
        </>
      );
    case 'CANCELLED':
      return (
        <>
          <span className="font-medium">Reconditionnement annulé</span>
          {p.reason ? <span className="text-[--k-muted]"> · {String(p.reason)}</span> : null}
        </>
      );
    default:
      return <span className="text-[--k-muted]">{e.eventType}</span>;
  }
}
