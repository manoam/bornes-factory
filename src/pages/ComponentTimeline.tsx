import { useMemo } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Loader2,
  Wrench,
  Stethoscope,
  Recycle,
  PackageMinus,
  Package,
  Sparkles,
  AlertTriangle,
} from 'lucide-react';
import api from '../services/api';

type Kind =
  | 'ASSEMBLED'
  | 'REPAIR_REMOVED'
  | 'REPAIR_INSTALLED'
  | 'REFURB_REMOVED'
  | 'REFURB_INSTALLED'
  | 'DISASSEMBLED';

interface Event {
  kind: Kind;
  at: string;
  borneInternalNumber: string;
  orderId: string;
  orderStatus: string | null;
  operatorName: string | null;
  disposition: string | null;
  quantity: number;
  productReference: string;
  productId: string;
  link: string;
}

interface Timeline {
  serialNumber: string;
  productReference: string | null;
  productId: string | null;
  currentBorne: string | null;
  firstSeenAt: string | null;
  lastEventAt: string | null;
  totalEvents: number;
  events: Event[];
}

const KIND_META: Record<
  Kind,
  { label: string; Icon: typeof Wrench; color: string; ring: string }
> = {
  ASSEMBLED: {
    label: 'Installé à l\'assemblage',
    Icon: Sparkles,
    color: 'text-indigo-700 bg-indigo-100',
    ring: 'ring-indigo-200',
  },
  REPAIR_INSTALLED: {
    label: 'Installé en réparation',
    Icon: Stethoscope,
    color: 'text-emerald-700 bg-emerald-100',
    ring: 'ring-emerald-200',
  },
  REPAIR_REMOVED: {
    label: 'Retiré en réparation',
    Icon: Stethoscope,
    color: 'text-rose-700 bg-rose-100',
    ring: 'ring-rose-200',
  },
  REFURB_INSTALLED: {
    label: 'Installé en reconditionnement',
    Icon: Recycle,
    color: 'text-emerald-700 bg-emerald-100',
    ring: 'ring-emerald-200',
  },
  REFURB_REMOVED: {
    label: 'Retiré en reconditionnement',
    Icon: Recycle,
    color: 'text-rose-700 bg-rose-100',
    ring: 'ring-rose-200',
  },
  DISASSEMBLED: {
    label: 'Récupéré au démontage',
    Icon: PackageMinus,
    color: 'text-amber-700 bg-amber-100',
    ring: 'ring-amber-200',
  },
};

const DISPOSITION_LABEL: Record<string, string> = {
  STOCK_NEW: 'Stock neuf',
  STOCK_USED: 'Stock occasion',
  TO_TEST: 'À tester',
  SCRAP: 'Rebut',
};

export default function ComponentTimeline() {
  const { sn } = useParams<{ sn: string }>();
  const [sp] = useSearchParams();
  const productRef = sp.get('productRef') || '';
  const productId = sp.get('productId') || '';

  const q = useQuery({
    queryKey: ['component-timeline', sn, productRef, productId],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('serialNumber', sn || '');
      if (productRef) params.set('productReference', productRef);
      if (productId) params.set('productId', productId);
      const res = await api.get<{ success: boolean; data: Timeline }>(
        `/components/timeline?${params.toString()}`,
      );
      return res.data.data;
    },
    enabled: !!sn && (!!productRef || !!productId),
    retry: false,
  });

  const groupedByYear = useMemo(() => {
    if (!q.data) return [] as { year: string; events: Event[] }[];
    const map = new Map<string, Event[]>();
    for (const e of q.data.events) {
      const y = new Date(e.at).getFullYear().toString();
      if (!map.has(y)) map.set(y, []);
      map.get(y)!.push(e);
    }
    return Array.from(map.entries())
      .sort((a, b) => Number(b[0]) - Number(a[0]))
      .map(([year, events]) => ({ year, events }));
  }, [q.data]);

  if (!sn) {
    return <div className="p-6 text-[--k-muted]">N° de série manquant.</div>;
  }
  if (!productRef && !productId) {
    return (
      <div className="p-6 space-y-2">
        <Link to="/" className="text-[12px] text-[--k-primary] inline-flex items-center gap-1">
          <ArrowLeft className="h-3 w-3" /> Retour
        </Link>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-[13px] text-amber-900 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            L'historique nécessite au moins la référence produit ou son ID en
            paramètre d'URL (<code>?productRef=…</code> ou <code>?productId=…</code>).
            Utilisez le lien depuis une fiche d'assemblage / réparation / reconditionnement /
            démontage.
          </div>
        </div>
      </div>
    );
  }
  if (q.isLoading) {
    return (
      <div className="p-6 flex items-center gap-2 text-[--k-muted]">
        <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
      </div>
    );
  }
  if (q.error) {
    const msg =
      (q.error as { response?: { data?: { error?: string } } } | null)?.response?.data?.error ||
      'Erreur inconnue';
    return (
      <div className="p-6">
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-[13px] text-rose-800">
          {msg}
        </div>
      </div>
    );
  }
  if (!q.data) return null;

  const t = q.data;

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => window.history.back()}
        className="text-[12px] text-[--k-primary] inline-flex items-center gap-1"
      >
        <ArrowLeft className="h-3 w-3" /> Retour
      </button>

      <section className="rounded-xl border border-[--k-border] bg-[--k-surface] p-4 space-y-2">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-[--k-muted]">
              Pièce sérialisée
            </div>
            <h1 className="text-xl font-semibold font-mono flex items-center gap-2">
              <Package className="h-5 w-5 text-[--k-primary]" />
              {t.serialNumber}
            </h1>
            <p className="text-[12px] text-[--k-muted] mt-0.5 font-mono">
              {t.productReference || '—'}
            </p>
          </div>
          {t.currentBorne && (
            <div className="text-right">
              <div className="text-[11px] uppercase tracking-wide text-[--k-muted]">
                Actuellement sur
              </div>
              <div className="text-[15px] font-mono font-semibold">
                {t.currentBorne}
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[12px] pt-2 border-t border-[--k-border]">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-[--k-muted] mb-0.5">
              Événements
            </div>
            <div className="text-[13px] tabular-nums">{t.totalEvents}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-[--k-muted] mb-0.5">
              1re apparition
            </div>
            <div className="text-[13px]">
              {t.firstSeenAt
                ? new Date(t.firstSeenAt).toLocaleDateString('fr-FR')
                : '—'}
            </div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-[--k-muted] mb-0.5">
              Dernière activité
            </div>
            <div className="text-[13px]">
              {t.lastEventAt
                ? new Date(t.lastEventAt).toLocaleDateString('fr-FR')
                : '—'}
            </div>
          </div>
        </div>
      </section>

      {t.events.length === 0 ? (
        <section className="rounded-xl border border-[--k-border] bg-[--k-surface] p-6 text-center text-[13px] text-[--k-muted] italic">
          Aucun événement pour ce numéro de série.
        </section>
      ) : (
        <section className="space-y-6">
          {groupedByYear.map(({ year, events }) => (
            <div key={year}>
              <h2 className="text-[11px] uppercase tracking-wide text-[--k-muted] font-semibold mb-2 sticky top-0 bg-[--k-bg] py-1">
                {year}
              </h2>
              <ol className="relative border-l-2 border-[--k-border] ml-2 space-y-3">
                {events.map((e, i) => {
                  const meta = KIND_META[e.kind];
                  const isCancelled = e.orderStatus === 'CANCELLED';
                  return (
                    <li key={`${e.orderId}-${i}`} className="ml-4">
                      <span
                        className={`absolute -left-3 flex h-6 w-6 items-center justify-center rounded-full ring-4 ${meta.ring} ${meta.color}`}
                      >
                        <meta.Icon className="h-3 w-3" />
                      </span>
                      <div
                        className={`rounded-xl border border-[--k-border] bg-[--k-surface] p-3 ${
                          isCancelled ? 'opacity-50' : ''
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2 flex-wrap">
                          <div>
                            <div className="text-[13px] font-medium">
                              {meta.label}
                              {isCancelled && (
                                <span className="ml-2 text-[10px] rounded-full bg-rose-100 text-rose-700 px-1.5 py-0.5">
                                  annulé
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-[--k-muted]">
                              {new Date(e.at).toLocaleString('fr-FR')}
                              {e.operatorName && ` · ${e.operatorName}`}
                            </div>
                          </div>
                          <Link
                            to={e.link}
                            className="text-[11px] rounded-lg border border-[--k-border] px-2 py-1 hover:border-[--k-primary] hover:text-[--k-primary]"
                          >
                            Voir la fiche
                          </Link>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px]">
                          <span className="inline-flex items-center gap-1 text-[--k-muted]">
                            <Wrench className="h-3 w-3" /> Borne
                          </span>
                          <span className="font-mono">
                            {e.borneInternalNumber}
                          </span>
                          {e.quantity > 1 && (
                            <span className="text-[--k-muted]">
                              · qté {e.quantity}
                            </span>
                          )}
                          {e.disposition && (
                            <span className="text-[10px] rounded-full bg-slate-100 px-1.5 py-0.5">
                              {DISPOSITION_LABEL[e.disposition] || e.disposition}
                            </span>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
