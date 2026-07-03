import { Link } from 'react-router-dom';

/**
 * Rend un n° interne de borne comme un lien vers sa timeline.
 * Si le n° est vide, retombe sur un tiret muet.
 */
export default function BorneLink({
  internalNumber,
  className = '',
}: {
  internalNumber: string | null | undefined;
  className?: string;
}) {
  if (!internalNumber || !internalNumber.trim()) {
    return <span className={`italic text-[--k-muted] ${className}`}>—</span>;
  }
  return (
    <Link
      to={`/bornes/${encodeURIComponent(internalNumber)}`}
      className={`font-mono text-[--k-primary] hover:underline ${className}`}
      title="Voir la vie de cette borne"
    >
      {internalNumber}
    </Link>
  );
}
