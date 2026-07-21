import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, X } from 'lucide-react';
import api from '../services/api';

/**
 * Matrice des catégories du partType actif : une ligne par catégorie
 * (Imprimante, PC, Écran, ...). Pour chaque catégorie l'opérateur
 * choisit AU PLUS un produit + qté + SN.
 *
 * Auto-save sur changement (debounce sur qté). Aucun bouton "Ajouter".
 * Repasser le produit à "aucun choix" retire le composant.
 */

export type PartType = 'EQUIPMENT' | 'PROTECTION' | 'ACCESSORY';

interface StockProductCategory {
  id: string;
  name: string;
  codeReference: string;
  partType: PartType | null;
}

interface StockProductLite {
  id: string;
  reference: string;
  name: string | null;
  description: string | null;
  brand: string | null;
  model: string | null;
  variant: string | null;
  imageUrl: string | null;
  hasSerialNumber: boolean;
  productCategoryId: string | null;
}

// Base URL pour les images Stock (les imageUrl sont relatifs, ex /uploads/xxx.jpg)
const STOCK_BASE_URL = (import.meta.env.VITE_STOCK_URL || 'https://stocks.orkessi.com')
  .replace(/\/$/, '');
function fullImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  return `${STOCK_BASE_URL}${url}`;
}

interface StockSerialItem {
  id: string;
  serialNumber: string | null;
}

export interface CategorySelection {
  componentId: string;
  productCategoryId: string;
  productId: string;
  productReference: string;
  serialNumber: string | null;
  quantity: number;
}

interface Props {
  assemblyId: string;
  partType: PartType | null;
  /** Selections existantes cote serveur, indexees par productCategoryId. */
  selections: Record<string, CategorySelection>;
  onChanged: () => void;
}

export default function AddComponentPanel({
  assemblyId,
  partType,
  selections,
  onChanged,
}: Props) {
  const categoriesQ = useQuery({
    queryKey: ['catalog', 'product-categories', partType],
    queryFn: async () => {
      const qs = partType ? `?partType=${partType}` : '';
      const res = await api.get<{ success: boolean; data: StockProductCategory[] }>(
        `/catalog/product-categories${qs}`,
      );
      return res.data.data;
    },
  });

  // Defense en profondeur : filtre cote client au cas ou le backend
  // renvoie des categories du mauvais partType (proxy pas encore
  // deploye, mauvaise version en cache, etc.).
  const categories = (categoriesQ.data || []).filter((c) =>
    partType ? c.partType === partType : true,
  );

  if (categoriesQ.isLoading) {
    return (
      <div className="border-t border-[--k-border] bg-[--k-surface-2]/30 px-4 py-6 flex items-center justify-center text-[--k-muted]">
        <Loader2 className="h-4 w-4 animate-spin mr-2" />
        Chargement des catégories…
      </div>
    );
  }

  if (categoriesQ.data && categories.length === 0) {
    return (
      <div className="border-t border-[--k-border] bg-amber-50/40 px-4 py-3 text-[12px] text-amber-800">
        Aucune catégorie {partType ? `« ${partType} »` : ''} taguée côté Stock — tague-les
        depuis Paramètres → Catégories principales (dropdown « Type de pièce »).
      </div>
    );
  }

  return (
    <div className="border-t border-[--k-border] divide-y divide-[--k-border]">
      {categories.map((cat) => (
        <CategoryRow
          key={cat.id}
          assemblyId={assemblyId}
          category={cat}
          selection={selections[cat.id]}
          onChanged={onChanged}
        />
      ))}
    </div>
  );
}

// ─── Category row ────────────────────────────────────────────────────────

interface RowProps {
  assemblyId: string;
  category: StockProductCategory;
  selection?: CategorySelection;
  onChanged: () => void;
}

function CategoryRow({ assemblyId, category, selection, onChanged }: RowProps) {
  const qc = useQueryClient();
  const [productId, setProductId] = useState(selection?.productId ?? '');
  const [serialNumber, setSerialNumber] = useState(selection?.serialNumber ?? '');
  const [quantity, setQuantity] = useState(selection?.quantity ?? 1);
  const [error, setError] = useState<string | null>(null);

  // Sync l'etat local quand les selections serveur changent (ex : autre
  // operateur, refetch...). On evite d'ecraser une saisie en cours.
  useEffect(() => {
    setProductId(selection?.productId ?? '');
    setSerialNumber(selection?.serialNumber ?? '');
    setQuantity(selection?.quantity ?? 1);
  }, [selection?.componentId, selection?.productId, selection?.serialNumber, selection?.quantity]);

  const productsQ = useQuery({
    queryKey: ['catalog', 'products', category.id],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: StockProductLite[] }>(
        `/catalog/products?productCategoryId=${category.id}`,
      );
      return res.data.data;
    },
  });

  const selectedProduct = productsQ.data?.find((p) => p.id === productId) || null;

  const serialsQ = useQuery({
    queryKey: ['catalog', 'serials', productId],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: StockSerialItem[] }>(
        `/catalog/products/${productId}/serial-items?status=IN_STOCK`,
      );
      return res.data.data;
    },
    enabled: !!productId && !!selectedProduct?.hasSerialNumber,
  });

  const upsertM = useMutation({
    mutationFn: async (payload: {
      productId: string;
      productReference: string;
      serialNumber?: string | null;
      quantity: number;
    }) => {
      await api.put(
        `/assembly-orders/${assemblyId}/categories/${category.id}`,
        payload,
      );
    },
    onSuccess: () => {
      setError(null);
      qc.invalidateQueries({ queryKey: ['assembly-checklist', assemblyId] });
      onChanged();
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      setError(err.response?.data?.error || 'Erreur');
    },
  });

  const removeM = useMutation({
    mutationFn: async () => {
      await api.delete(`/assembly-orders/${assemblyId}/categories/${category.id}`);
    },
    onSuccess: () => {
      setError(null);
      qc.invalidateQueries({ queryKey: ['assembly-checklist', assemblyId] });
      onChanged();
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      setError(err.response?.data?.error || 'Erreur');
    },
  });

  // Debounce sur qte : 500ms apres derniere frappe.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveDebounced = (opts: { qty?: number; sn?: string; pid?: string }) => {
    const nextProductId = opts.pid ?? productId;
    const nextQty = opts.qty ?? quantity;
    const nextSn = opts.sn ?? serialNumber;
    // Si rien a envoyer (pas de produit), on ne save pas.
    if (!nextProductId) return;
    const product = productsQ.data?.find((p) => p.id === nextProductId);
    if (!product) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      upsertM.mutate({
        productId: product.id,
        productReference: product.reference,
        serialNumber: product.hasSerialNumber ? nextSn.trim() || null : null,
        quantity: Math.max(1, Number(nextQty) || 1),
      });
    }, 500);
  };

  const handleProductChange = (newId: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setProductId(newId);
    setSerialNumber(''); // reset SN quand on change de produit
    if (!newId) {
      // Retour a "aucun choix" -> delete la ligne cote serveur
      if (selection) removeM.mutate();
      return;
    }
    const product = productsQ.data?.find((p) => p.id === newId);
    if (!product) return;
    // Save immediat sur choix de produit
    upsertM.mutate({
      productId: product.id,
      productReference: product.reference,
      serialNumber: null,
      quantity: Math.max(1, Number(quantity) || 1),
    });
  };

  const handleSerialChange = (newSn: string) => {
    setSerialNumber(newSn);
    // Save immediat sur choix de SN
    saveDebouncedImmediate({ sn: newSn });
  };

  const saveDebouncedImmediate = (opts: { sn?: string }) => {
    if (!productId) return;
    const product = productsQ.data?.find((p) => p.id === productId);
    if (!product) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    upsertM.mutate({
      productId: product.id,
      productReference: product.reference,
      serialNumber: product.hasSerialNumber ? (opts.sn ?? serialNumber).trim() || null : null,
      quantity: Math.max(1, Number(quantity) || 1),
    });
  };

  const handleQtyChange = (n: number) => {
    setQuantity(n);
    saveDebounced({ qty: n });
  };

  const productLabel = (p: StockProductLite): string => {
    // Priorite : description > name > brand+model+variant. Reference toujours en suffixe.
    const primary =
      p.description?.trim() ||
      p.name?.trim() ||
      [p.brand, p.model, p.variant].filter(Boolean).join(' ');
    return primary ? `${primary} (${p.reference})` : p.reference;
  };

  const hasSelection = !!selection && !!productId;
  const busy = upsertM.isPending || removeM.isPending;

  return (
    <div className="px-4 py-2.5 hover:bg-[--k-surface-2]/30">
      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,180px)_minmax(0,1.4fr)_minmax(0,1fr)_auto_auto] gap-2 items-center">
        {/* Nom de la categorie */}
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-medium text-[13px] truncate">{category.name}</span>
          <span className="font-mono text-[10px] text-[--k-muted] shrink-0">
            {category.codeReference}
          </span>
        </div>

        {/* Produit + thumbnail du produit choisi */}
        <div className="flex items-center gap-2">
          {(() => {
            const thumb = fullImageUrl(selectedProduct?.imageUrl);
            return thumb ? (
              <img
                src={thumb}
                alt=""
                className="h-9 w-9 rounded-md object-cover border border-[--k-border] shrink-0"
                loading="lazy"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                }}
              />
            ) : (
              <div className="h-9 w-9 shrink-0" />
            );
          })()}
          <select
            className="input-field w-full text-[13px] h-9 min-w-0"
            value={productId}
            onChange={(e) => handleProductChange(e.target.value)}
            disabled={productsQ.isLoading || busy}
          >
            <option value="">
              {productsQ.isLoading
                ? 'Chargement…'
                : productsQ.data && productsQ.data.length === 0
                  ? '— Aucun produit —'
                  : '— Aucun choix —'}
            </option>
            {productsQ.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {productLabel(p)}
              </option>
            ))}
          </select>
        </div>

        {/* SN ou placeholder */}
        <div>
          {selectedProduct?.hasSerialNumber ? (
            <select
              className="input-field w-full text-[13px] h-9"
              value={serialNumber}
              onChange={(e) => handleSerialChange(e.target.value)}
              disabled={serialsQ.isLoading || busy}
            >
              <option value="">
                {serialsQ.isLoading
                  ? 'Chargement…'
                  : serialsQ.data && serialsQ.data.length === 0
                    ? '— Aucun SN dispo —'
                    : '— N° de série (facultatif) —'}
              </option>
              {serialsQ.data?.map((s) => (
                <option key={s.id} value={s.serialNumber || s.id}>
                  {s.serialNumber || `(sans SN — id ${s.id.slice(0, 8)})`}
                </option>
              ))}
            </select>
          ) : (
            <div className="text-[11px] text-[--k-muted] italic pl-2">
              {productId ? 'Sans N° de série' : ''}
            </div>
          )}
        </div>

        {/* Quantite */}
        <div>
          <input
            type="number"
            min={1}
            className="input-field text-[13px] h-9 w-16 text-center"
            value={quantity}
            onChange={(e) => handleQtyChange(parseInt(e.target.value) || 1)}
            disabled={!productId || busy}
            title="Quantité"
          />
        </div>

        {/* Bouton retirer */}
        <div className="flex items-center justify-end gap-2 min-w-[24px]">
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-[--k-muted]" />}
          {hasSelection && !busy && (
            <button
              type="button"
              onClick={() => {
                setProductId('');
                setSerialNumber('');
                setQuantity(1);
                removeM.mutate();
              }}
              className="text-[--k-muted] hover:text-rose-700"
              title="Retirer ce composant"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {error && <p className="mt-1 text-[11px] text-rose-700">{error}</p>}
    </div>
  );
}
