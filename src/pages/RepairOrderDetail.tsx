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
  Stethoscope,
  Wrench,
  Package,
} from 'lucide-react';
import api from '../services/api';
import QrScannerModal, { type ParsedQr } from '../components/QrScannerModal';
import OperatorAvatar from '../components/OperatorAvatar';
import SerialLink from '../components/SerialLink';

type Status = 'DRAFT' | 'IN_PROGRESS' | 'TESTING' | 'COMPLETED' | 'CANCELLED';
type Action = 'REMOVED' | 'INSTALLED';
type Disposition = 'TO_TEST' | 'SCRAP' | 'STOCK_USED';

interface RepairComponent {
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

interface RepairOrder {
  id: string;
  borneInternalNumber: string;
  sourceApp: string;
  status: Status;
  diagnosis: string | null;
  operatorId: string | null;
  operatorName: string | null;
  notes: string | null;
  qualityChecks: string[] | null;
  startedAt: string | null;
  completedAt: string | null;
  createdByName: string | null;
  createdAt: string;
  components: RepairComponent[];
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
  TESTING: { label: 'En test', cls: 'bg-blue-100 text-blue-800' },
  COMPLETED: { label: 'Terminé', cls: 'bg-emerald-100 text-emerald-800' },
  CANCELLED: { label: 'Annulé', cls: 'bg-rose-100 text-rose-800' },
};

const DISPOSITION_LABEL: Record<Disposition, string> = {
  TO_TEST: 'À tester',
  SCRAP: 'Rebut',
  STOCK_USED: 'Stock occasion',
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
      to: 'IN_PROGRESS' | 'TESTING' | 'COMPLETED' | 'CANCELLED';
      reason?: string;
    }) => {
      const res = await api.post(`/repair-orders/${id}/transition`, payload);
      return res.data;
    },
    onSuccess: invalidateAll,
  });

  const updateM = useMutation({
    mutationFn: async (payload: { notes?: string; qualityChecks?: string[]; diagnosis?: string }) => {
      await api.patch(`/repair-orders/${id}`, payload);
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
  const canAddComponents = order.status === 'IN_PROGRESS';

  return (
    <div className="space-y-4">
      <Link
        to="/repair-orders"
        className="text-[12px] text-[--k-primary] inline-flex items-center gap-1"
      >
        <ArrowLeft className="h-3 w-3" />
        Tous les ordres de réparation
      </Link>

      <Header
        order={order}
        transitionPending={transitionM.isPending}
        transitionError={
          (transitionM.error as { response?: { data?: { error?: string } } } | null)?.response
            ?.data?.error || null
        }
        onTransition={(to, extras) => transitionM.mutate({ to, ...extras })}
        onDiagnosisChange={(value) => updateM.mutate({ diagnosis: value || undefined })}
      />

      <BorneInfoSection info={borneQ.data} isLoading={borneQ.isLoading} />

      <ComponentsSection
        components={order.components}
        canEdit={canAddComponents}
        repairId={order.id}
        onChanged={invalidateAll}
      />

      {checklistQ.data && (
        <NotesAndQualitySection
          order={order}
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
  order,
  transitionPending,
  transitionError,
  onTransition,
  onDiagnosisChange,
}: {
  order: RepairOrder;
  transitionPending: boolean;
  transitionError: string | null;
  onTransition: (
    to: 'IN_PROGRESS' | 'TESTING' | 'COMPLETED' | 'CANCELLED',
    extras?: { reason?: string },
  ) => void;
  onDiagnosisChange: (value: string) => void;
}) {
  const [editingDiag, setEditingDiag] = useState(false);
  const [diagDraft, setDiagDraft] = useState(order.diagnosis || '');
  useEffect(() => setDiagDraft(order.diagnosis || ''), [order.diagnosis]);
  const meta = STATUS_META[order.status];
  const isClosed = order.status === 'COMPLETED' || order.status === 'CANCELLED';

  return (
    <section className="rounded-xl border border-[--k-border] bg-[--k-surface] p-4 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold font-mono">
            {order.borneInternalNumber}
          </h1>
          <p className="text-[12px] text-[--k-muted]">
            Réparation ·{' '}
            {order.sourceApp === 'factory'
              ? 'borne Factory'
              : order.sourceApp === 'bornes'
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
          Diagnostic
        </div>
        {editingDiag && !isClosed ? (
          <div className="flex gap-2 items-start">
            <textarea
              className="input-field py-2 min-h-[60px] flex-1"
              value={diagDraft}
              onChange={(e) => setDiagDraft(e.target.value)}
              autoFocus
            />
            <button
              type="button"
              onClick={() => {
                onDiagnosisChange(diagDraft.trim());
                setEditingDiag(false);
              }}
              className="rounded-lg bg-[--k-primary] text-white px-3 py-2 text-[12px]"
            >
              OK
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => !isClosed && setEditingDiag(true)}
            className="text-[--k-text] text-left hover:text-[--k-primary] disabled:cursor-default"
            disabled={isClosed}
          >
            {order.diagnosis || (
              <span className="italic text-[--k-muted]">Aucun diagnostic saisi</span>
            )}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[13px]">
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
        <div>
          <div className="text-[11px] uppercase tracking-wide text-[--k-muted] mb-0.5">
            Créé par
          </div>
          <OperatorAvatar name={order.createdByName} size="sm" />
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
              <Play className="h-4 w-4" /> Démarrer la réparation
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
            <>
              <button
                type="button"
                onClick={() => onTransition('COMPLETED')}
                disabled={transitionPending}
                className="rounded-lg bg-emerald-600 text-white px-3 py-2 text-[13px] font-medium inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                <CheckCircle2 className="h-4 w-4" /> Valider la réparation
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
              if (window.confirm("Annuler cette réparation ? L'action est définitive.")) {
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
          <Stethoscope className="h-4 w-4" />
          Borne non résolue
        </h2>
        <p className="text-[13px] text-amber-800">
          Le numéro <span className="font-mono">{info.internalNumber}</span> n'a
          été trouvé ni côté Factory ni dans l'app Bornes. Vous pouvez continuer
          la réparation, elle sera juste sans traçabilité de composition
          d'origine.
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
          <Stethoscope className="h-4 w-4 text-[--k-primary]" />
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
            <ul className="space-y-1 max-h-[200px] overflow-y-auto pr-2">
              {info.factoryAssembly.components.map((c) => (
                <li key={c.id} className="flex items-baseline gap-2 text-[12px]">
                  <span className="font-mono text-[--k-muted]">{c.productReference}</span>
                  <SerialLink
                    serialNumber={c.serialNumber}
                    productReference={c.productReference}
                    quantity={c.quantity}
                    className="text-[--k-text]"
                  />
                </li>
              ))}
            </ul>
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

// ─── Components section ─────────────────────────────────────────────────

function ComponentsSection({
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
          repairId={repairId}
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
          repairId={repairId}
          onDeleted={onChanged}
        />
        <ComponentList
          title="Installés"
          items={installed}
          empty="Aucun composant installé."
          badgeColor="bg-emerald-50 text-emerald-700"
          canEdit={canEdit}
          repairId={repairId}
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
  repairId,
  onDeleted,
}: {
  title: string;
  items: RepairComponent[];
  empty: string;
  badgeColor: string;
  canEdit: boolean;
  repairId: string;
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
              repairId={repairId}
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
  repairId,
  onDone,
  onCancel,
}: {
  action: Action;
  repairId: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [productRef, setProductRef] = useState('');
  const [productId, setProductId] = useState('');
  const [serial, setSerial] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [disposition, setDisposition] = useState<Disposition>('TO_TEST');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [searching, setSearching] = useState(false);

  const addM = useMutation({
    mutationFn: async (payload: {
      productId: string;
      productReference: string;
      serialNumber?: string | null;
      quantity: number;
      disposition?: Disposition;
    }) => {
      await api.post(`/repair-orders/${repairId}/components`, {
        action,
        ...payload,
      });
    },
    onSuccess: onDone,
  });

  const resolveProduct = async (search: string) => {
    if (!search.trim()) return;
    setSearching(true);
    try {
      // Cherche via Stock API par ref exacte
      const res = await api.get<{ success: boolean; data: { data: any[] } | any[] }>(
        `/production-orders/available-models`, // reuse pattern? Non — pas d'endpoint search public. Utiliser produits directement.
      );
      void res;
    } catch {
      /* ignore */
    } finally {
      setSearching(false);
    }
  };
  void resolveProduct;

  const handleScan = async (parsed: ParsedQr) => {
    setScannerOpen(false);
    if (parsed.kind === 'unknown') return;
    // Si scan produit, on récupère au moins l'id.
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
              <option value="TO_TEST">À tester</option>
              <option value="STOCK_USED">Retour stock occasion</option>
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
          disabled={!canSubmit || addM.isPending || searching}
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

// ─── History ────────────────────────────────────────────────────────────

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

function humanizeEvent(e: RepairEvent): string {
  const p = (e.payload || {}) as Record<string, unknown>;
  switch (e.eventType) {
    case 'STARTED':
      return 'Réparation démarrée';
    case 'STATUS_CHANGED':
      return `Statut : ${p.from ?? '—'} → ${p.to}`;
    case 'DIAGNOSIS_UPDATED':
      return 'Diagnostic mis à jour';
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
    case 'QUALITY_CHECKED':
      return `Contrôle qualité validé : ${p.checkId}`;
    case 'QUALITY_UNCHECKED':
      return `Contrôle qualité retiré : ${p.checkId}`;
    case 'COMPLETED':
      return `Réparation validée (${p.componentsCount ?? 0} composant(s))`;
    case 'CANCELLED':
      return `Annulé${p.reason ? ` : ${p.reason}` : ''}`;
    default:
      return e.eventType;
  }
}
