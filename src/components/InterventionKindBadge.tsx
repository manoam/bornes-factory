/**
 * Badge pour l'action realisee sur une piece.
 */

type Kind = 'REPLACED' | 'CHECKED' | 'DIAGNOSED';

const META: Record<Kind, { label: string; cls: string }> = {
  REPLACED: { label: 'Remplacé', cls: 'bg-orange-100 text-orange-800' },
  CHECKED: { label: 'Contrôlé', cls: 'bg-blue-100 text-blue-800' },
  DIAGNOSED: { label: 'Diagnostic', cls: 'bg-purple-100 text-purple-800' },
};

export default function InterventionKindBadge({
  kind,
  className = '',
}: {
  kind: Kind;
  className?: string;
}) {
  const meta = META[kind] || META.CHECKED;
  return (
    <span
      className={`inline-flex rounded-md px-2 py-0.5 text-[11px] font-medium ${meta.cls} ${className}`}
    >
      {meta.label}
    </span>
  );
}
