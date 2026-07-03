import { Link } from 'react-router-dom';
import { History } from 'lucide-react';

/**
 * Rend un numero de serie comme un lien vers sa timeline.
 *
 * Si serialNumber est null/vide (piece non tracee : vis, fils, colliers),
 * on retombe sur un simple affichage "qte N" — pas de lien puisqu'il n'y
 * a rien a suivre.
 *
 * Le composant a besoin de la reference produit (ou de son id) pour que
 * l'endpoint timeline puisse borner la recherche : deux produits differents
 * peuvent partager un meme SN.
 */
export default function SerialLink({
  serialNumber,
  productReference,
  productId,
  quantity = 1,
  className = '',
}: {
  serialNumber: string | null | undefined;
  productReference: string;
  productId?: string;
  quantity?: number;
  className?: string;
}) {
  if (!serialNumber || !serialNumber.trim()) {
    return (
      <span className={`text-[--k-text] ${className}`}>qté {quantity}</span>
    );
  }
  const params = new URLSearchParams();
  params.set('productRef', productReference);
  if (productId) params.set('productId', productId);
  return (
    <Link
      to={`/components/${encodeURIComponent(serialNumber)}?${params.toString()}`}
      className={`text-[--k-primary] hover:underline inline-flex items-center gap-1 ${className}`}
      title="Voir l'historique de cette pièce"
    >
      {serialNumber}
      <History className="h-3 w-3 opacity-60" />
    </Link>
  );
}
