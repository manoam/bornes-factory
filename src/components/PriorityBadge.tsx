/**
 * Badge de priorite pour un chantier reparation.
 * NORMAL = discret, HIGH = ambre, URGENT = rouge.
 */

type Priority = 'NORMAL' | 'HIGH' | 'URGENT';

const META: Record<Priority, { label: string; cls: string }> = {
  NORMAL: { label: 'Normale', cls: 'bg-slate-100 text-slate-700' },
  HIGH: { label: 'Haute', cls: 'bg-amber-100 text-amber-800' },
  URGENT: { label: 'Urgente', cls: 'bg-rose-100 text-rose-800' },
};

export default function PriorityBadge({
  priority,
  className = '',
}: {
  priority: Priority | null | undefined;
  className?: string;
}) {
  const meta = META[priority || 'NORMAL'];
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${meta.cls} ${className}`}
    >
      {meta.label}
    </span>
  );
}
