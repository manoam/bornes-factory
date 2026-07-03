import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Loader2,
  Play,
  CheckCircle2,
  XCircle,
  Trash2,
  Camera,
  Plus,
  AlertTriangle,
  Package,
  Wrench,
  Sparkles,
} from 'lucide-react';
import api from '../services/api';
import QrScannerModal, { type ParsedQr } from '../components/QrScannerModal';
import OperatorAvatar from '../components/OperatorAvatar';
import SerialLink from '../components/SerialLink';

type Status = 'DRAFT' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
type Disposition = 'STOCK_NEW' | 'STOCK_USED' | 'TO_TEST' | 'SCRAP';

interface DComponent {
  id: string;
  productId: string;
  productReference: string;
  serialNumber: string | null;
  quantity: number;
  disposition: Disposition;
  stockMovementId: string | null;
  createdAt: string;
}

interface Disassembly {
  id: string;
  borneInternalNumber: string;
  sourceApp: string;
  status: Status;
  reason: string | null;
  operatorId: string | null;
  operatorName: string | null;
  notes: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdByName: string | null;
  createdAt: string;
  components: DComponent[];
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
  alreadyRecovered: boolean;
}

interface DEvent {
  id: string;
  eventType: string;
  payload: Record<string, unknown> | null;
  actorName: string | null;
  createdAt: string;
}

const STATUS_META: Record<Status, { label: string; cls: string }> = {
  DRAFT: { label: 'Brouillon', cls: 'bg-slate-100 text-slate-700' },
  IN_PROGRESS: { label: 'En cours', cls: 'bg-amber-100 text-amber-800' },
  COMPLETED: { label: 'Terminé', cls: 'bg-emerald-100 text-emerald-800' },
  CANCELLED: { label: 'Annulé', cls: 'bg-rose-100 text-rose-800' },
};

const DISPOSITION_META: Record<Disposition, { label: string; cls: string }> = {
  STOCK_NEW: { label: 'Stock neuf', cls: 'bg-emerald-50 text-emerald-700' },
  STOCK_USED: { label: 'Stock occasion', cls: 'bg-blue-50 text-blue-700' },
  TO_TEST: { label: 'À tester', cls: 'bg-amber-50 text-amber-700' },
  SCRAP: { label: 'Rebut', cls: 'bg-rose-50 text-rose-700' },
};

// ─── Page ────────────────────────────────────────────────────────────────

export default function DisassemblyDetail() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();

  const disQ = useQuery({
    queryKey: ['disassembly', id],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: Disassembly }>(
        `/disassemblies/${id}`,
      );
      return res.data.data;
    },
    enabled: !!id,
  });

  const borneQ = useQuery({
    queryKey: ['disassembly-borne', id],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: BorneInfo }>(
        `/disassemblies/${id}/borne-info`,
      );
      return res.data.data;
    },
    enabled: !!id,
    retry: false,
  });

  const suggestQ = useQuery({
    queryKey: ['disassembly-suggestions', id],
    queryFn: async () => {
      const res = await api.get<{
        success: boolean;
        data: { items: Suggestion[] };
      }>(`/disassemblies/${id}/suggestions`);
      return res.data.data.items;
    },
    enabled: !!id,
  });

  const historyQ = useQuery({
    queryKey: ['disassembly-history', id],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: DEvent[] }>(
        `/disassemblies/${id}/history`,
      );
      return res.data.data;
    },
    enabled: !!id,
  });

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['disassembly', id] });
    qc.invalidateQueries({ queryKey: ['disassembly-suggestions', id] });
    qc.invalidateQueries({ queryKey: ['disassembly-history', id] });
  };

  const transitionM = useMutation({
    mutationFn: async (payload: {
      to: 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
      reason?: string;
    }) => {
      await api.post(`/disassemblies/${id}/transition`, payload);
    },
    onSuccess: invalidateAll,
  });

  const updateM = useMutation({
    mutationFn: async (payload: { reason?: string; notes?: string }) => {
      await api.patch(`/disassemblies/${id}`, payload);
    },
    onSuccess: invalidateAll,
  });

  if (disQ.isLoading || !disQ.data) {
    return (
      <div className="p-6 flex items-center gap-2 text-[--k-muted]">
        <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
      </div>
    );
  }
  const dis = disQ.data;
  const isClosed = dis.status === 'COMPLETED' || dis.status === 'CANCELLED';
  const canAddComponents = dis.status === 'IN_PROGRESS';

  return (
    <div className="space-y-4">
      <Link
        to="/disassemblies"
        className="text-[12px] text-[--k-primary] inline-flex items-center gap-1"
      >
        <ArrowLeft className="h-3 w-3" />
        Tous les démontages
      </Link>

      <Header
        dis={dis}
        transitionPending={transitionM.isPending}
        transitionError={
          (transitionM.error as { response?: { data?: { error?: string } } } | null)?.response
            ?.data?.error || null
        }
        onTransition={(to, extras) => transitionM.mutate({ to, ...extras })}
        onReasonChange={(value) => updateM.mutate({ reason: value || undefined })}
      />

      <BorneInfoSection info={borneQ.data} isLoading={borneQ.isLoading} />

      {canAddComponents && suggestQ.data && suggestQ.data.length > 0 && (
        <SuggestionsSection
          suggestions={suggestQ.data}
          disId={dis.id}
          onChanged={invalidateAll}
        />
      )}

      <ComponentsSection
        components={dis.components}
        canEdit={canAddComponents}
        disId={dis.id}
        onChanged={invalidateAll}
      />

      <NotesSection
        notes={dis.notes || ''}
        readOnly={isClosed}
        onSave={(v) => updateM.mutate({ notes: v })}
      />

      <HistorySection events={historyQ.data || []} />
    </div>
  );
}

// ─── Header ──────────────────────────────────────────────────────────────

function Header({
  dis,
  transitionPending,
  transitionError,
  onTransition,
  onReasonChange,
}: {
  dis: Disassembly;
  transitionPending: boolean;
  transitionError: string | null;
  onTransition: (
    to: 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED',
    extras?: { reason?: string },
  ) => void;
  onReasonChange: (value: string) => void;
}) {
  const [editingReason, setEditingReason] = useState(false);
  const [reasonDraft, setReasonDraft] = useState(dis.reason || '');
  useEffect(() => setReasonDraft(dis.reason || ''), [dis.reason]);
  const meta = STATUS_META[dis.status];
  const isClosed = dis.status === 'COMPLETED' || dis.status === 'CANCELLED';

  return (
    <section className="rounded-xl border border-[--k-border] bg-[--k-surface] p-4 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold font-mono">
            <Link
              to={`/bornes/${encodeURIComponent(dis.borneInternalNumber)}`}
              className="hover:underline"
              title="Vie de cette borne"
            >
              {dis.borneInternalNumber}
            </Link>
          </h1>
          <p className="text-[12px] text-[--k-muted]">
            Démontage ·{' '}
            {dis.sourceApp === 'factory'
              ? 'borne Factory'
              : dis.sourceApp === 'bornes'
                ? 'borne du parc'
                : 'non résolue'}
          </p>
        </div>
        <span className={`inline-flex rounded-full px-2.5 py-1 text-[12px] font-semibold ${meta.cls}`}>
          {meta.label}
        </span>
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
            {dis.reason || (
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
          <OperatorAvatar name={dis.operatorName} size="sm" />
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-[--k-muted] mb-0.5">
            Démarré le
          </div>
          {dis.startedAt ? new Date(dis.startedAt).toLocaleString('fr-FR') : '—'}
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-[--k-muted] mb-0.5">
            Créé par
          </div>
          <OperatorAvatar name={dis.createdByName} size="sm" />
        </div>
      </div>

      {!isClosed && (
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[--k-border]">
          {dis.status === 'DRAFT' && (
            <button
              type="button"
              onClick={() => onTransition('IN_PROGRESS')}
              disabled={transitionPending}
              className="rounded-lg bg-[--k-primary] text-white px-3 py-2 text-[13px] font-medium inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              <Play className="h-4 w-4" /> Démarrer le démontage
            </button>
          )}
          {dis.status === 'IN_PROGRESS' && (
            <button
              type="button"
              onClick={() => {
                if (
                  window.confirm(
                    'Valider ce démontage ? La borne sera archivée dans le parc.',
                  )
                ) {
                  onTransition('COMPLETED');
                }
              }}
              disabled={transitionPending}
              className="rounded-lg bg-emerald-600 text-white px-3 py-2 text-[13px] font-medium inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              <CheckCircle2 className="h-4 w-4" /> Valider et archiver
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              const reason = window.prompt("Motif d'annulation (facultatif) ?") || '';
              if (window.confirm('Annuler ce démontage ? L\'action est définitive.')) {
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
        <h2 className="text-[14px] font-semibold text-amber-900 mb-1">
          Borne non résolue
        </h2>
        <p className="text-[13px] text-amber-800">
          Le numéro <span className="font-mono">{info.internalNumber}</span> n'a
          été trouvé ni côté Factory ni dans l'app Bornes. Vous pouvez continuer
          le démontage à la main.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-[--k-border] bg-[--k-surface]">
      <header className="px-4 py-3 border-b border-[--k-border]">
        <h2 className="text-[14px] font-semibold">Borne concernée</h2>
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
              Fabriquée par Factory
            </h3>
            <p className="text-[12px] text-[--k-muted]">
              Modèle {info.factoryAssembly.model} — validée le{' '}
              {info.factoryAssembly.completedAt
                ? new Date(info.factoryAssembly.completedAt).toLocaleDateString('fr-FR')
                : '—'}
            </p>
            <Link
              to={`/produced-bornes/${info.factoryAssembly.id}`}
              className="text-[11px] text-[--k-primary] hover:underline mt-2 inline-block"
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
 * Affiche les composants d'origine (Factory) qui ne sont pas encore
 * récupérés. Clic sur "Récupérer" ouvre le mini formulaire avec la
 * référence + SN pré-remplis, l'opérateur choisit juste la disposition.
 */
function SuggestionsSection({
  suggestions,
  disId,
  onChanged,
}: {
  suggestions: Suggestion[];
  disId: string;
  onChanged: () => void;
}) {
  const remaining = suggestions.filter((s) => !s.alreadyRecovered);
  const [pending, setPending] = useState<Suggestion | null>(null);

  if (remaining.length === 0) return null;

  return (
    <section className="rounded-xl border border-indigo-200 bg-indigo-50/40">
      <header className="px-4 py-3 border-b border-indigo-200 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-indigo-700" />
        <h2 className="text-[14px] font-semibold text-indigo-900">
          Composition d'origine ({remaining.length} à récupérer)
        </h2>
      </header>
      <ul className="divide-y divide-indigo-200/70">
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
              Récupérer
            </button>
          </li>
        ))}
      </ul>

      {pending && (
        <QuickRecoverModal
          suggestion={pending}
          disId={disId}
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

function QuickRecoverModal({
  suggestion,
  disId,
  onDone,
  onCancel,
}: {
  suggestion: Suggestion;
  disId: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [disposition, setDisposition] = useState<Disposition>('STOCK_USED');
  const [quantity, setQuantity] = useState(suggestion.quantity);

  const addM = useMutation({
    mutationFn: async () => {
      await api.post(`/disassemblies/${disId}/components`, {
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
          <h2 className="font-semibold">Récupérer un composant</h2>
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
  disId,
  onChanged,
}: {
  components: DComponent[];
  canEdit: boolean;
  disId: string;
  onChanged: () => void;
}) {
  const [showForm, setShowForm] = useState(false);

  return (
    <section className="rounded-xl border border-[--k-border] bg-[--k-surface]">
      <header className="px-4 py-3 border-b border-[--k-border] flex items-center justify-between">
        <h2 className="text-[14px] font-semibold flex items-center gap-2">
          <Wrench className="h-4 w-4 text-[--k-primary]" />
          Composants récupérés ({components.length})
        </h2>
        {canEdit && !showForm && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-1 rounded-lg bg-[--k-primary] text-white px-2 py-1 text-[12px]"
          >
            <Plus className="h-3.5 w-3.5" />
            Ajouter à la main
          </button>
        )}
      </header>

      {showForm && (
        <ManualAddForm
          disId={disId}
          onDone={() => {
            setShowForm(false);
            onChanged();
          }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {components.length === 0 ? (
        <p className="p-4 text-[13px] text-[--k-muted] italic">
          Aucun composant récupéré pour le moment.
        </p>
      ) : (
        <ul className="divide-y divide-[--k-border]">
          {components.map((c) => (
            <ComponentItem
              key={c.id}
              c={c}
              canEdit={canEdit}
              disId={disId}
              onDeleted={onChanged}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function ComponentItem({
  c,
  canEdit,
  disId,
  onDeleted,
}: {
  c: DComponent;
  canEdit: boolean;
  disId: string;
  onDeleted: () => void;
}) {
  const removeM = useMutation({
    mutationFn: () => api.delete(`/disassemblies/${disId}/components/${c.id}`),
    onSuccess: onDeleted,
  });
  const dispo = DISPOSITION_META[c.disposition];
  return (
    <li className="flex items-center gap-3 px-4 py-2 text-[13px]">
      <Package className="h-4 w-4 text-[--k-muted] shrink-0" />
      <span className="font-mono text-[12px] text-[--k-muted]">
        {c.productReference}
      </span>
      <SerialLink
        serialNumber={c.serialNumber}
        productReference={c.productReference}
        productId={c.productId}
        quantity={c.quantity}
        className="text-[--k-text]"
      />
      <span
        className={`text-[11px] rounded-full px-2 py-0.5 font-medium ${dispo.cls}`}
      >
        {dispo.label}
      </span>
      {canEdit && (
        <button
          type="button"
          onClick={() => {
            if (window.confirm('Retirer ce composant de la liste ?')) removeM.mutate();
          }}
          className="text-[--k-muted] hover:text-rose-700 ml-auto"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </li>
  );
}

function ManualAddForm({
  disId,
  onDone,
  onCancel,
}: {
  disId: string;
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
    mutationFn: async () => {
      await api.post(`/disassemblies/${disId}/components`, {
        productId: productId || productRef,
        productReference: productRef,
        serialNumber: serial.trim() || null,
        quantity,
        disposition,
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

  return (
    <div className="border-b border-[--k-border] px-4 py-3 bg-[--k-surface-2]/40 space-y-2">
      <div className="text-[12px] font-semibold">Ajouter un composant à la main</div>
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
        <div>
          <label className="text-[11px] text-[--k-muted]">Disposition</label>
          <select
            className="input-field"
            value={disposition}
            onChange={(e) => setDisposition(e.target.value as Disposition)}
          >
            <option value="STOCK_USED">Stock occasion</option>
            <option value="STOCK_NEW">Stock neuf</option>
            <option value="TO_TEST">À tester</option>
            <option value="SCRAP">Rebut</option>
          </select>
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
          disabled={!productRef.trim() || quantity < 1 || addM.isPending}
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

// ─── Notes ──────────────────────────────────────────────────────────────

function NotesSection({
  notes,
  readOnly,
  onSave,
}: {
  notes: string;
  readOnly: boolean;
  onSave: (v: string) => void;
}) {
  const [draft, setDraft] = useState(notes);
  useEffect(() => setDraft(notes), [notes]);

  return (
    <section className="rounded-xl border border-[--k-border] bg-[--k-surface] p-4 space-y-2">
      <h2 className="text-[14px] font-semibold">Notes d'atelier</h2>
      <textarea
        className="input-field py-2 min-h-[80px]"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== notes) onSave(draft);
        }}
        disabled={readOnly}
        placeholder="Observations, précautions particulières…"
      />
    </section>
  );
}

// ─── History ────────────────────────────────────────────────────────────

function HistorySection({ events }: { events: DEvent[] }) {
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
              {e.actorName && <span className="text-[--k-muted]"> · {e.actorName}</span>}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function humanizeEvent(e: DEvent): string {
  const p = (e.payload || {}) as Record<string, unknown>;
  switch (e.eventType) {
    case 'STARTED':
      return 'Démontage démarré';
    case 'STATUS_CHANGED':
      return `Statut : ${p.from ?? '—'} → ${p.to}`;
    case 'REASON_UPDATED':
      return 'Motif mis à jour';
    case 'NOTES_UPDATED':
      return 'Notes mises à jour';
    case 'COMPONENT_RECOVERED':
      return `Composant récupéré : ${p.productRef}${
        p.serialNumber ? ` (SN ${p.serialNumber})` : ''
      } → ${p.disposition}`;
    case 'COMPONENT_REVERTED':
      return `Composant retiré de la liste : ${p.productRef}`;
    case 'COMPLETED':
      return `Démontage validé — borne archivée (${p.componentsCount ?? 0} composant(s) récupéré(s))`;
    case 'CANCELLED':
      return `Annulé${p.reason ? ` : ${p.reason}` : ''}`;
    default:
      return e.eventType;
  }
}
