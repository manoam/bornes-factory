import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
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
  MapPin,
  AlertTriangle,
  Search,
} from 'lucide-react';
import api from '../services/api';

type Kind = 'ASSEMBLY' | 'REPAIR' | 'REFURBISHMENT' | 'DISASSEMBLY';

interface Event {
  kind: Kind;
  id: string;
  status: string;
  at: string;
  operatorName: string | null;
  createdByName: string | null;
  title: string;
  subtitle: string | null;
  componentsCount: number;
  link: string;
}

interface BorneData {
  internalNumber: string;
  model: string | null;
  sourceApp: string;
  parcBorne: {
    numero_formated: string;
    gamme_nom: string | null;
    etat_nom: string | null;
    parc_nom: string | null;
    client_enseigne: string | null;
    antenne_ville: string | null;
  } | null;
  parcError: string | null;
  firstSeenAt: string | null;
  lastEventAt: string | null;
  totalEvents: number;
  events: Event[];
}

const KIND_META: Record<
  Kind,
  { label: string; Icon: typeof Wrench; color: string; ring: string }
> = {
  ASSEMBLY: {
    label: 'Assemblage',
    Icon: Sparkles,
    color: 'text-indigo-700 bg-indigo-100',
    ring: 'ring-indigo-200',
  },
  REPAIR: {
    label: 'Réparation',
    Icon: Stethoscope,
    color: 'text-amber-700 bg-amber-100',
    ring: 'ring-amber-200',
  },
  REFURBISHMENT: {
    label: 'Reconditionnement',
    Icon: Recycle,
    color: 'text-emerald-700 bg-emerald-100',
    ring: 'ring-emerald-200',
  },
  DISASSEMBLY: {
    label: 'Démontage',
    Icon: PackageMinus,
    color: 'text-rose-700 bg-rose-100',
    ring: 'ring-rose-200',
  },
};

const STATUS_META: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: 'Brouillon', cls: 'bg-slate-100 text-slate-700' },
  IN_PROGRESS: { label: 'En cours', cls: 'bg-amber-100 text-amber-800' },
  TESTING: { label: 'En test', cls: 'bg-blue-100 text-blue-800' },
  COMPLETED: { label: 'Terminé', cls: 'bg-emerald-100 text-emerald-800' },
  CANCELLED: { label: 'Annulé', cls: 'bg-rose-100 text-rose-800' },
};

export default function BorneTimeline() {
  const { internal } = useParams<{ internal: string }>();

  const q = useQuery({
    queryKey: ['borne-timeline', internal],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: BorneData }>(
        `/bornes/${encodeURIComponent(internal || '')}/timeline`,
      );
      return res.data.data;
    },
    enabled: !!internal,
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

  if (!internal) {
    return <div className="p-6 text-[--k-muted]">N° borne manquant.</div>;
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
  const knownNowhere = t.totalEvents === 0 && !t.parcBorne;

  return (
    <div className="space-y-4">
      <Link
        to="/bornes"
        className="text-[12px] text-[--k-primary] inline-flex items-center gap-1"
      >
        <ArrowLeft className="h-3 w-3" /> Recherche borne
      </Link>

      <section className="rounded-xl border border-[--k-border] bg-[--k-surface] p-4 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-[--k-muted]">
              Borne
            </div>
            <h1 className="text-xl font-semibold font-mono flex items-center gap-2">
              <Package className="h-5 w-5 text-[--k-primary]" />
              {t.internalNumber}
            </h1>
            <p className="text-[12px] text-[--k-muted] mt-0.5">
              {t.model ? `Modèle ${t.model} · ` : ''}
              {t.sourceApp === 'factory'
                ? 'Fabriquée dans Factory'
                : t.sourceApp === 'bornes'
                  ? 'Uniquement dans le parc Bornes'
                  : 'Non résolue'}
            </p>
          </div>
          {t.parcBorne && (
            <div className="text-right space-y-0.5 text-[12px]">
              <div className="text-[11px] uppercase tracking-wide text-[--k-muted]">
                Actuellement (Parc)
              </div>
              {t.parcBorne.gamme_nom && (
                <div>
                  <span className="text-[--k-muted]">Gamme :</span>{' '}
                  <span className="font-medium">{t.parcBorne.gamme_nom}</span>
                </div>
              )}
              {t.parcBorne.etat_nom && (
                <div>
                  <span className="text-[--k-muted]">État :</span>{' '}
                  <span className="font-medium">{t.parcBorne.etat_nom}</span>
                </div>
              )}
              {t.parcBorne.client_enseigne && (
                <div>
                  <span className="text-[--k-muted]">Client :</span>{' '}
                  {t.parcBorne.client_enseigne}
                </div>
              )}
              {t.parcBorne.antenne_ville && (
                <div className="inline-flex items-center gap-1">
                  <MapPin className="h-3 w-3 text-[--k-muted]" />
                  {t.parcBorne.antenne_ville}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[12px] pt-2 border-t border-[--k-border]">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-[--k-muted] mb-0.5">
              Chantiers
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

      {knownNowhere && (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-2 text-[13px] text-amber-900">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <div>
              Le numéro <span className="font-mono">{t.internalNumber}</span>{' '}
              n'a été trouvé ni côté Factory ni dans l'app Bornes.
              {t.parcError && (
                <div className="text-[11px] italic text-amber-700/80 mt-1">
                  (API Bornes : {t.parcError})
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {t.events.length === 0 ? (
        !knownNowhere && (
          <section className="rounded-xl border border-[--k-border] bg-[--k-surface] p-6 text-center text-[13px] text-[--k-muted] italic">
            Aucun chantier Factory enregistré pour cette borne. Elle vit dans
            le parc Bornes uniquement.
          </section>
        )
      ) : (
        <section className="space-y-6">
          {groupedByYear.map(({ year, events }) => (
            <div key={year}>
              <h2 className="text-[11px] uppercase tracking-wide text-[--k-muted] font-semibold mb-2 sticky top-0 bg-[--k-bg] py-1">
                {year}
              </h2>
              <ol className="relative border-l-2 border-[--k-border] ml-2 space-y-3">
                {events.map((e) => {
                  const meta = KIND_META[e.kind];
                  const statusMeta = STATUS_META[e.status];
                  return (
                    <li key={e.id} className="ml-4">
                      <span
                        className={`absolute -left-3 flex h-6 w-6 items-center justify-center rounded-full ring-4 ${meta.ring} ${meta.color}`}
                      >
                        <meta.Icon className="h-3 w-3" />
                      </span>
                      <div className="rounded-xl border border-[--k-border] bg-[--k-surface] p-3">
                        <div className="flex items-start justify-between gap-2 flex-wrap">
                          <div>
                            <div className="text-[13px] font-medium flex items-center gap-2">
                              {e.title}
                              {statusMeta && (
                                <span
                                  className={`text-[10px] rounded-full px-1.5 py-0.5 font-medium ${statusMeta.cls}`}
                                >
                                  {statusMeta.label}
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
                        {e.subtitle && (
                          <div className="mt-2 text-[12px] text-[--k-text]">
                            {e.subtitle}
                          </div>
                        )}
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-[--k-muted]">
                          <span className="inline-flex items-center gap-1">
                            <Wrench className="h-3 w-3" />
                            {e.componentsCount} composant
                            {e.componentsCount !== 1 ? 's' : ''}
                          </span>
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

/**
 * Page /bornes — search input pour trouver une borne par son n° interne.
 * Simple et direct : on tape, on valide, ça route vers /bornes/:internal.
 */
export function BorneSearch() {
  return (
    <div className="max-w-md mx-auto py-10 space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Recherche borne</h1>
        <p className="text-[13px] text-[--k-muted]">
          Saisis un n° interne (K001, C150, S401…) pour voir tout ce que Factory
          et le parc Bornes savent sur cette borne.
        </p>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const v = String(fd.get('internal') || '').trim();
          if (v) window.location.href = `/bornes/${encodeURIComponent(v)}`;
        }}
        className="rounded-xl border border-[--k-border] bg-[--k-surface] p-4 space-y-3"
      >
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[--k-muted]" />
            <input
              autoFocus
              name="internal"
              className="input-field !pl-10 font-mono"
              placeholder="ex : K001"
            />
          </div>
          <button
            type="submit"
            className="rounded-lg bg-[--k-primary] text-white px-4 py-2 text-[13px] font-medium"
          >
            Chercher
          </button>
        </div>
      </form>
    </div>
  );
}
