/**
 * Badge pour l'etat d'une piece apres intervention.
 */

type PartState = 'OK' | 'DEFECTIVE' | 'TO_CHECK' | 'SUSPECT';

const META: Record<PartState, { label: string; cls: string }> = {
  OK: { label: 'OK', cls: 'bg-emerald-100 text-emerald-800' },
  DEFECTIVE: { label: 'Défectueux', cls: 'bg-rose-100 text-rose-800' },
  TO_CHECK: { label: 'À contrôler', cls: 'bg-amber-100 text-amber-800' },
  SUSPECT: { label: 'Suspect', cls: 'bg-orange-100 text-orange-800' },
};

export default function PartStateBadge({
  state,
  className = '',
}: {
  state: PartState;
  className?: string;
}) {
  const meta = META[state] || META.OK;
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${meta.cls} ${className}`}
    >
      {meta.label}
    </span>
  );
}
