import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Clock,
  User as UserIcon,
  Package,
  ChevronDown,
  ChevronUp,
  MapPin,
  Tag,
  Calendar,
  Loader2,
  Printer,
} from 'lucide-react';
import api from '../services/api';
import OperatorAvatar from '../components/OperatorAvatar';

// ─── Types ───────────────────────────────────────────────────────────────

type Status = 'DRAFT' | 'IN_PROGRESS' | 'TESTING' | 'COMPLETED' | 'CANCELLED';

interface AssemblyComponent {
  id: string;
  productId: string;
  productReference: string;
  serialNumber: string | null;
  quantity: number;
  installedAt: string | null;
}

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

interface ChecklistLine {
  productId: string;
  productReference: string;
  productDescription: string | null;
  hasSerialNumber: boolean;
  requiredQty: number;
  installedQty: number;
}

interface ChecklistPayload {
  model: string;
  lines: ChecklistLine[];
  qualityChecks: { id: string; label: string }[];
}

interface BorneParc {
  id: number;
  numero: number;
  numero_formated: string;
  numero_serie: string | null;
  statut: string;
  model_nom: string | null;
  gamme_nom: string | null;
  couleur_nom: string | null;
  etat_nom: string | null;
  parc_nom: string | null;
  localisation: string | null;
  adresse: string | null;
  ville: string | null;
  client_nom: string | null;
  client_prenom: string | null;
  client_enseigne: string | null;
  antenne_ville: string | null;
  contact_nom: string | null;
  contact_prenom: string | null;
  sortie_atelier: string | null;
  created_at: string | null;
  updated_at: string | null;
}

interface AssemblyEvent {
  id: string;
  eventType: string;
  payload: Record<string, unknown> | null;
  actorName: string | null;
  createdAt: string;
}

// ─── Page ────────────────────────────────────────────────────────────────

export default function ProducedBorneDetail() {
  const { id } = useParams<{ id: string }>();

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

  const order = orderQ.data;
  const internalNumber = order?.internalNumber?.trim() || null;

  // Parc info: only fetch when we actually have an internal number AND the
  // assembly is completed (otherwise the borne wouldn't be in the parc yet).
  // 404 from /parc is a meaningful "not synced" signal, not an error to retry.
  const parcQ = useQuery({
    queryKey: ['borne-parc', internalNumber],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: BorneParc }>(
        `/produced-bornes/${encodeURIComponent(internalNumber!)}/parc`,
      );
      return res.data.data;
    },
    enabled: !!internalNumber && order?.status === 'COMPLETED',
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

  if (orderQ.isLoading || !order) {
    return (
      <div className="p-6 flex items-center gap-2 text-[--k-muted]">
        <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
      </div>
    );
  }

  // movementsCreated comes from the "COMPLETED" event in history, easier
  // than digging into the transition response after the fact.
  const completedEvent = (historyQ.data || []).find((e) => e.eventType === 'COMPLETED');
  const movementsCreated =
    (completedEvent?.payload?.movementsCreated as number | undefined) ?? null;

  return (
    <div className="space-y-4 print-page">
      <div className="flex items-center justify-between gap-2 no-print">
        <Link
          to="/produced-bornes"
          className="text-[12px] text-[--k-primary] inline-flex items-center gap-1"
        >
          <ArrowLeft className="h-3 w-3" />
          Toutes les bornes produites
        </Link>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[--k-border] bg-[--k-surface] px-3 py-1.5 text-[13px] font-medium text-[--k-text] hover:bg-[--k-surface-2]"
          title="Imprimer la fiche technique"
        >
          <Printer className="h-4 w-4" />
          Imprimer fiche technique
        </button>
      </div>

      {/* Print-only header band — replaces the in-app NavLink trail when on paper. */}
      <div
        className="print-only hidden mb-3 pb-2 border-b border-slate-300 text-[11pt]"
        aria-hidden="true"
      >
        <div className="font-semibold tracking-wide">KONITYS FACTORY</div>
        <div className="text-slate-600">Fiche technique de borne produite</div>
      </div>

      <BorneHeader
        order={order}
        parcQ={{
          isLoading: parcQ.isLoading,
          isError: parcQ.isError,
          data: parcQ.data || null,
        }}
      />

      <ParcSection
        internalNumber={internalNumber}
        orderStatus={order.status}
        parcQ={{
          isLoading: parcQ.isLoading,
          isError: parcQ.isError,
          error: parcQ.error,
          data: parcQ.data || null,
        }}
      />

      <ComponentsSection components={order.components} />

      {checklistQ.data && (
        <QualitySection
          qualityChecks={checklistQ.data.qualityChecks}
          checked={order.qualityChecks || []}
        />
      )}

      <FactoryInfoSection order={order} movementsCreated={movementsCreated} />

      {order.notes && order.notes.trim() && <NotesSection notes={order.notes} />}

      <div className="print-hide">
        <HistorySection events={historyQ.data || []} />
      </div>

      {/* Footer with timestamp — only shows up on print. */}
      <div className="print-only hidden print-footer">
        Fiche imprimée le {new Date().toLocaleString('fr-FR')} ·{' '}
        Konitys Factory · n° interne {order.internalNumber || '—'}
      </div>
    </div>
  );
}

// ─── Header ──────────────────────────────────────────────────────────────

function BorneHeader({
  order,
  parcQ,
}: {
  order: AssemblyOrder;
  parcQ: { isLoading: boolean; isError: boolean; data: BorneParc | null };
}) {
  const completedDate = order.completedAt
    ? new Date(order.completedAt).toLocaleDateString('fr-FR')
    : '—';

  let badge: { label: string; cls: string; Icon: typeof CheckCircle2 };
  if (!order.internalNumber) {
    badge = { label: 'Pas de n° interne', cls: 'bg-slate-100 text-slate-700', Icon: AlertCircle };
  } else if (parcQ.isLoading) {
    badge = { label: 'Vérification…', cls: 'bg-slate-100 text-slate-700', Icon: Loader2 };
  } else if (parcQ.data) {
    badge = { label: 'Dans le parc', cls: 'bg-emerald-100 text-emerald-800', Icon: CheckCircle2 };
  } else {
    badge = { label: 'Non synchronisée', cls: 'bg-rose-100 text-rose-800', Icon: AlertCircle };
  }
  const Icon = badge.Icon;

  return (
    <section className="rounded-xl border border-[--k-border] bg-[--k-surface] p-4 flex items-start justify-between gap-4 flex-wrap">
      <div>
        <h1 className="text-2xl font-bold font-mono">
          {order.internalNumber || <span className="italic text-[--k-muted]">non attribué</span>}
        </h1>
        <p className="text-[13px] text-[--k-muted] mt-1">
          {order.productionOrder.model} ·{' '}
          <Link
            to={`/production-orders/${order.productionOrder.id}`}
            className="hover:text-[--k-primary]"
          >
            OF parent
          </Link>
        </p>
        <p className="text-[12px] text-[--k-muted] mt-0.5 inline-flex items-center gap-1">
          <Calendar className="h-3 w-3" />
          Validée le {completedDate}
        </p>
      </div>

      <a
        href="#parc-section"
        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium ${badge.cls}`}
      >
        <Icon className={`h-4 w-4 ${parcQ.isLoading ? 'animate-spin' : ''}`} />
        {badge.label}
      </a>
    </section>
  );
}

// ─── Parc section ────────────────────────────────────────────────────────

function ParcSection({
  internalNumber,
  orderStatus,
  parcQ,
}: {
  internalNumber: string | null;
  orderStatus: Status;
  parcQ: {
    isLoading: boolean;
    isError: boolean;
    error: unknown;
    data: BorneParc | null;
  };
}) {
  if (!internalNumber) {
    return (
      <section
        id="parc-section"
        className="rounded-xl border border-[--k-border] bg-[--k-surface] p-4"
      >
        <h2 className="text-[14px] font-semibold mb-2">Statut dans le parc Bornes</h2>
        <p className="text-[13px] text-[--k-muted] italic">
          Aucun numéro interne attribué. Une borne sans numéro interne ne
          peut pas être matchée avec le parc.
        </p>
      </section>
    );
  }

  if (orderStatus !== 'COMPLETED') {
    return (
      <section
        id="parc-section"
        className="rounded-xl border border-[--k-border] bg-[--k-surface] p-4"
      >
        <h2 className="text-[14px] font-semibold mb-2">Statut dans le parc Bornes</h2>
        <p className="text-[13px] text-[--k-muted] italic">
          La borne n'est pas encore validée. Le matching avec le parc se
          fera après validation.
        </p>
      </section>
    );
  }

  if (parcQ.isLoading) {
    return (
      <section
        id="parc-section"
        className="rounded-xl border border-[--k-border] bg-[--k-surface] p-4"
      >
        <h2 className="text-[14px] font-semibold mb-2">Statut dans le parc Bornes</h2>
        <p className="text-[13px] text-[--k-muted] inline-flex items-center gap-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Interrogation de l'API Bornes…
        </p>
      </section>
    );
  }

  // 404 from the API = not found in parc (legitimate signal).
  // Other errors (5xx, network, config missing) = system issue.
  const status = (parcQ.error as { response?: { status?: number } } | null)?.response?.status;
  const isNotFound = status === 404;

  if (parcQ.isError && !isNotFound) {
    const message =
      (parcQ.error as { response?: { data?: { error?: string } } } | null)?.response?.data
        ?.error || 'Erreur lors de la requête';
    return (
      <section
        id="parc-section"
        className="rounded-xl border border-amber-200 bg-amber-50 p-4"
      >
        <h2 className="text-[14px] font-semibold text-amber-900 mb-2 flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />
          API Bornes indisponible
        </h2>
        <p className="text-[13px] text-amber-800">{message}</p>
      </section>
    );
  }

  if (!parcQ.data) {
    // Either 404 or no data — both mean "borne pas dans le parc".
    return (
      <section
        id="parc-section"
        className="rounded-xl border border-rose-200 bg-rose-50 p-4 space-y-2"
      >
        <h2 className="text-[14px] font-semibold text-rose-900 flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />
          Non synchronisée avec l'app Bornes
        </h2>
        <p className="text-[13px] text-rose-800">
          La borne <span className="font-mono font-medium">{internalNumber}</span> a
          été validée dans Factory, mais n'apparaît pas dans le parc Bornes.
        </p>
        <p className="text-[12px] text-rose-700/80">
          Cela peut être normal si l'app Bornes n'a pas encore intégré
          l'événement <code>factory.assembly_orders.completed</code>, ou
          si la borne doit être créée manuellement côté Bornes.
        </p>
      </section>
    );
  }

  const b = parcQ.data;
  const clientLabel =
    b.client_enseigne ||
    [b.client_prenom, b.client_nom].filter(Boolean).join(' ') ||
    null;
  const contactLabel = [b.contact_prenom, b.contact_nom].filter(Boolean).join(' ') || null;

  return (
    <section
      id="parc-section"
      className="rounded-xl border border-emerald-200 bg-emerald-50/40"
    >
      <header className="px-4 py-3 border-b border-emerald-200 flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4 text-emerald-700" />
        <h2 className="text-[14px] font-semibold text-emerald-900">
          Présente dans le parc Bornes
        </h2>
      </header>
      <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-[13px]">
        <Field label="N° série physique" value={b.numero_serie} mono />
        <Field
          label="Gamme · Modèle"
          value={[b.gamme_nom, b.model_nom].filter(Boolean).join(' · ') || null}
        />
        <Field label="Couleur" value={b.couleur_nom} />
        <Field label="État opérationnel" value={b.etat_nom} />
        <Field label="Parc" value={b.parc_nom} />
        <Field
          label="Localisation"
          value={b.localisation === 'in_client' ? 'Chez client' : b.localisation || null}
        />
        {(b.adresse || b.ville) && (
          <div className="sm:col-span-2">
            <Label>Adresse</Label>
            <div className="inline-flex items-start gap-1 text-[--k-text]">
              <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0 text-[--k-muted]" />
              <span>{[b.adresse, b.ville].filter(Boolean).join(', ')}</span>
            </div>
          </div>
        )}
        <Field label="Antenne" value={b.antenne_ville} />
        <Field label="Contact" value={contactLabel} />
        {clientLabel && (
          <div className="sm:col-span-2">
            <Label>Client</Label>
            <div className="text-[--k-text]">{clientLabel}</div>
          </div>
        )}
        <Field
          label="Sortie atelier"
          value={b.sortie_atelier ? new Date(b.sortie_atelier).toLocaleDateString('fr-FR') : null}
        />
        <Field
          label="Dernière mise à jour"
          value={b.updated_at ? new Date(b.updated_at).toLocaleString('fr-FR') : null}
        />
      </div>
    </section>
  );
}

function Field({ label, value, mono = false }: { label: string; value: string | null; mono?: boolean }) {
  return (
    <div>
      <Label>{label}</Label>
      <div className={`text-[--k-text] ${mono ? 'font-mono' : ''}`}>
        {value || <span className="text-[--k-muted] italic">—</span>}
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] uppercase tracking-wide text-[--k-muted] mb-0.5">
      {children}
    </div>
  );
}

// ─── Components section ─────────────────────────────────────────────────

function ComponentsSection({ components }: { components: AssemblyComponent[] }) {
  // Group by productReference, keep individual serial numbers.
  const groups = useMemo(() => {
    const map = new Map<
      string,
      { productReference: string; productId: string; units: AssemblyComponent[]; totalQty: number }
    >();
    for (const c of components) {
      const g = map.get(c.productReference) || {
        productReference: c.productReference,
        productId: c.productId,
        units: [],
        totalQty: 0,
      };
      g.units.push(c);
      g.totalQty += c.quantity;
      map.set(c.productReference, g);
    }
    return Array.from(map.values()).sort((a, b) =>
      a.productReference.localeCompare(b.productReference),
    );
  }, [components]);

  return (
    <section className="rounded-xl border border-[--k-border] bg-[--k-surface]">
      <header className="px-4 py-3 border-b border-[--k-border] flex items-center gap-2">
        <Package className="h-4 w-4 text-[--k-primary]" />
        <h2 className="text-[14px] font-semibold">
          Composants installés ({components.length})
        </h2>
      </header>
      {groups.length === 0 ? (
        <p className="p-4 text-[13px] text-[--k-muted] italic">
          Aucun composant installé.
        </p>
      ) : (
        <div className="divide-y divide-[--k-border]">
          {groups.map((g) => (
            <div key={g.productReference} className="px-4 py-3">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="font-mono text-[12px] text-[--k-muted]">
                  {g.productReference}
                </span>
                <span className="text-[11px] tabular-nums px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700">
                  qté {g.totalQty}
                </span>
              </div>
              {g.units.some((u) => u.serialNumber) && (
                <ul className="mt-2 space-y-0.5 text-[12px]">
                  {g.units.map((u) => (
                    <li key={u.id} className="flex items-center gap-2">
                      <Tag className="h-3 w-3 text-[--k-muted] shrink-0" />
                      <span className="font-mono text-[--k-text]">
                        {u.serialNumber || `qté ${u.quantity}`}
                      </span>
                      {u.installedAt && (
                        <span className="text-[10px] text-[--k-muted]">
                          {new Date(u.installedAt).toLocaleString('fr-FR', {
                            day: '2-digit',
                            month: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ─── Quality section ────────────────────────────────────────────────────

function QualitySection({
  qualityChecks,
  checked,
}: {
  qualityChecks: { id: string; label: string }[];
  checked: string[];
}) {
  const checkedSet = new Set(checked);
  return (
    <section className="rounded-xl border border-[--k-border] bg-[--k-surface] p-4 space-y-3">
      <h2 className="text-[14px] font-semibold">
        Contrôles qualité ({checkedSet.size} / {qualityChecks.length})
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {qualityChecks.map((q) => {
          const ok = checkedSet.has(q.id);
          return (
            <div
              key={q.id}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-[13px] ${
                ok
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                  : 'border-[--k-border] bg-[--k-surface] text-[--k-muted]'
              }`}
            >
              <CheckCircle2
                className={`h-4 w-4 shrink-0 ${ok ? 'text-emerald-600' : 'opacity-30'}`}
              />
              {q.label}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ─── Factory info ───────────────────────────────────────────────────────

function FactoryInfoSection({
  order,
  movementsCreated,
}: {
  order: AssemblyOrder;
  movementsCreated: number | null;
}) {
  const duration = useMemo(() => {
    if (!order.startedAt || !order.completedAt) return null;
    const ms = new Date(order.completedAt).getTime() - new Date(order.startedAt).getTime();
    if (ms <= 0) return null;
    const totalMin = Math.round(ms / 60_000);
    const hours = Math.floor(totalMin / 60);
    const minutes = totalMin % 60;
    if (hours === 0) return `${minutes} min`;
    return `${hours} h ${String(minutes).padStart(2, '0')}`;
  }, [order.startedAt, order.completedAt]);

  return (
    <section className="rounded-xl border border-[--k-border] bg-[--k-surface] p-4 space-y-3">
      <h2 className="text-[14px] font-semibold">Informations Factory</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-[13px]">
        <div>
          <Label>Opérateur</Label>
          <div className="text-[--k-text]">
            {order.operatorName ? (
              <OperatorAvatar name={order.operatorName} size="md" />
            ) : (
              <span className="inline-flex items-center gap-1.5 italic text-[--k-muted]">
                <UserIcon className="h-3.5 w-3.5" />
                —
              </span>
            )}
          </div>
        </div>
        <div>
          <Label>Durée d'assemblage</Label>
          <div className="inline-flex items-center gap-1.5 text-[--k-text]">
            <Clock className="h-3.5 w-3.5 text-[--k-muted]" />
            {duration || <span className="italic text-[--k-muted]">—</span>}
          </div>
        </div>
        <Field
          label="Démarré le"
          value={order.startedAt ? new Date(order.startedAt).toLocaleString('fr-FR') : null}
        />
        <Field
          label="Validée le"
          value={order.completedAt ? new Date(order.completedAt).toLocaleString('fr-FR') : null}
        />
        {movementsCreated != null && (
          <div className="sm:col-span-2">
            <Label>Mouvements Stock générés</Label>
            <div className="text-[--k-text]">
              <span className="font-semibold tabular-nums">{movementsCreated}</span>{' '}
              mouvements OUT créés depuis le site Atelier
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

// ─── Notes ──────────────────────────────────────────────────────────────

function NotesSection({ notes }: { notes: string }) {
  return (
    <section className="rounded-xl border border-[--k-border] bg-[--k-surface] p-4 space-y-2">
      <h2 className="text-[14px] font-semibold">Notes d'atelier</h2>
      <p className="text-[13px] text-[--k-text] whitespace-pre-wrap">{notes}</p>
    </section>
  );
}

// ─── History ────────────────────────────────────────────────────────────

function HistorySection({ events }: { events: AssemblyEvent[] }) {
  const [open, setOpen] = useState(false);

  if (events.length === 0) {
    return null;
  }
  return (
    <section className="rounded-xl border border-[--k-border] bg-[--k-surface]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full px-4 py-3 flex items-center justify-between text-left"
      >
        <h2 className="text-[14px] font-semibold">Historique ({events.length})</h2>
        {open ? (
          <ChevronUp className="h-4 w-4 text-[--k-muted]" />
        ) : (
          <ChevronDown className="h-4 w-4 text-[--k-muted]" />
        )}
      </button>
      {open && (
        <ul className="border-t border-[--k-border] divide-y divide-[--k-border]">
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
      )}
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
