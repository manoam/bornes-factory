import { Link } from 'react-router-dom';
import { History } from 'lucide-react';

/**
 * Cellule "Borne" enrichie pour les listes chantiers (repair / refurb /
 * disassembly). Rend le n° interne en lien vers la fiche du chantier +
 * icône historique vers la timeline borne. Sous le n°, ligne inline
 * "Gamme — Parc — Enseigne" si l'API Bornes a rendu ces infos.
 *
 * Un tiret muet s'affiche pour les valeurs manquantes plutôt qu'un
 * espace vide, pour que la ligne reste lisible visuellement.
 */

interface Props {
  internalNumber: string;
  chantierLink: string;
  sourceApp: string;
  gamme: string | null;
  parc: string | null;
  enseigne: string | null;
}

export default function BorneCell({
  internalNumber,
  chantierLink,
  sourceApp,
  gamme,
  parc,
  enseigne,
}: Props) {
  const parts = [gamme, parc, enseigne].filter(Boolean) as string[];
  return (
    <div className="font-mono">
      <div className="flex items-center gap-1">
        <Link
          to={chantierLink}
          className="text-[--k-primary] hover:underline"
        >
          {internalNumber}
        </Link>
        <Link
          to={`/bornes/${encodeURIComponent(internalNumber)}`}
          title="Vie de cette borne"
          className="text-[--k-muted] hover:text-[--k-primary]"
        >
          <History className="h-3 w-3" />
        </Link>
      </div>
      {parts.length > 0 ? (
        <div className="text-[10px] text-[--k-muted] mt-0.5 font-sans">
          {parts.join(' — ')}
        </div>
      ) : (
        <div className="text-[10px] text-[--k-muted] mt-0.5 font-sans italic">
          {sourceApp === 'factory'
            ? 'Factory'
            : sourceApp === 'bornes'
              ? 'Parc'
              : 'Non résolue'}
        </div>
      )}
    </div>
  );
}
