import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Loader2,
  Check,
  Package as PackageIcon,
  Hash,
  ImageOff,
  MinusCircle,
} from 'lucide-react';
import api from '../services/api';

/**
 * Matrice des catégories du partType actif — vue "cards" atelier.
 * Une card par ProductCategory, l'opérateur choisit AU PLUS un produit.
 *
 * Auto-save : choix produit → save immédiat, changement qté → debounce
 * 500 ms, choix SN → save immédiat. Repasser à "aucun choix" → DELETE.
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

// Base URL pour les images Stock
const STOCK_BASE_URL = (import.meta.env.VITE_STOCK_URL || 'https://stocks.orkessi.com')
  .replace(/\/$/, '');
function fullImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  return `${STOCK_BASE_URL}${url}`;
}

interface Props {
  assemblyId: string;
  partType: PartType | null;
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
  // renvoie des categories du mauvais partType.
  const categories = (categoriesQ.data || []).filter((c) =>
    partType ? c.partType === partType : true,
  );

  if (categoriesQ.isLoading) {
    return (
      <div className="rounded-xl border border-dashed border-[--k-border] bg-[--k-surface-2]/30 px-4 py-10 flex items-center justify-center text-[--k-muted]">
        <Loader2 className="h-4 w-4 animate-spin mr-2" />
        Chargement des catégories…
      </div>
    );
  }

  if (categoriesQ.data && categories.length === 0) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3 text-[13px] text-amber-800">
        <div className="font-medium">Aucune catégorie {partType ? `« ${partType} »` : ''} taguée</div>
        <div className="text-[12px] mt-0.5 text-amber-700">
          Tague les catégories dans Stock → Paramètres → Catégories principales (dropdown « Type
          de pièce »).
        </div>
      </div>
    );
  }

  const filledCount = categories.filter((c) => !!selections[c.id]).length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <div className="text-[11px] uppercase tracking-wide text-[--k-muted] font-semibold">
          Sélection par catégorie
        </div>
        <div className="text-[11px] text-[--k-muted] tabular-nums">
          {filledCount} / {categories.length} renseignées
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {categories.map((cat) => (
          <CategoryCard
            key={cat.id}
            assemblyId={assemblyId}
            category={cat}
            selection={selections[cat.id]}
            onChanged={onChanged}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Category card ───────────────────────────────────────────────────────

interface RowProps {
  assemblyId: string;
  category: StockProductCategory;
  selection?: CategorySelection;
  onChanged: () => void;
}

function CategoryCard({ assemblyId, category, selection, onChanged }: RowProps) {
  const qc = useQueryClient();
  const [productId, setProductId] = useState(selection?.productId ?? '');
  const [serialNumber, setSerialNumber] = useState(selection?.serialNumber ?? '');
  const [quantity, setQuantity] = useState(selection?.quantity ?? 1);
  const [error, setError] = useState<string | null>(null);

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

  // Defense en profondeur : le backend Stock (ancienne version) peut ne
  // pas filtrer sur productCategoryId. On refiltre cote client pour ne
  // montrer que les produits vraiment dans cette categorie.
  const products = (productsQ.data || []).filter(
    (p) => p.productCategoryId === category.id,
  );

  const selectedProduct = products.find((p) => p.id === productId) || null;

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
      productDescription?: string | null;
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

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushSave = (opts: { qty?: number; sn?: string; pid?: string } = {}) => {
    const nextProductId = opts.pid ?? productId;
    const nextQty = opts.qty ?? quantity;
    const nextSn = opts.sn ?? serialNumber;
    if (!nextProductId) return;
    const product = products.find((p) => p.id === nextProductId);
    if (!product) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    upsertM.mutate({
      productId: product.id,
      productReference: product.reference,
      productDescription: productLabel(product),
      serialNumber: product.hasSerialNumber ? nextSn.trim() || null : null,
      quantity: Math.max(1, Number(nextQty) || 1),
    });
  };

  const debouncedSaveQty = (n: number) => {
    if (!productId) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => flushSave({ qty: n }), 500);
  };

  const handleProductChange = (newId: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setProductId(newId);
    setSerialNumber('');
    if (!newId) {
      if (selection) removeM.mutate();
      return;
    }
    const product = products.find((p) => p.id === newId);
    if (!product) return;
    upsertM.mutate({
      productId: product.id,
      productReference: product.reference,
      productDescription: productLabel(product),
      serialNumber: null,
      quantity: Math.max(1, Number(quantity) || 1),
    });
  };

  const handleSerialChange = (newSn: string) => {
    setSerialNumber(newSn);
    flushSave({ sn: newSn });
  };

  const handleQtyChange = (n: number) => {
    setQuantity(n);
    debouncedSaveQty(n);
  };

  const productLabel = (p: StockProductLite): string => {
    // Priorite : description > name > brand+model+variant. Reference cachee
    // du dropdown (affichee en sous-ligne quand un produit est selectionne).
    return (
      p.description?.trim() ||
      p.name?.trim() ||
      [p.brand, p.model, p.variant].filter(Boolean).join(' ') ||
      p.reference
    );
  };

  const hasSelection = !!selection && !!productId;
  const busy = upsertM.isPending || removeM.isPending;
  const thumbUrl = fullImageUrl(selectedProduct?.imageUrl);

  return (
    <div
      className={`group relative rounded-xl border transition-all bg-[--k-surface] ${
        hasSelection
          ? 'border-emerald-300 shadow-sm shadow-emerald-100/50 ring-1 ring-emerald-100/60'
          : 'border-[--k-border] hover:border-[--k-primary]/40'
      }`}
    >
      {/* Bandeau haut : nom categorie + statut */}
      <div className="flex items-center justify-between gap-2 px-3 pt-2.5 pb-1.5">
        <span className="text-[13px] font-semibold text-[--k-text] truncate min-w-0">
          {category.name}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-[--k-muted]" />}
          {!busy && hasSelection && (
            <span
              className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-emerald-500 text-white"
              title="Renseigné"
            >
              <Check className="h-3 w-3" strokeWidth={3} />
            </span>
          )}
        </div>
      </div>

      {/* Zone principale : thumbnail + dropdown produit */}
      <div className="px-3 pb-2">
        <div className="flex gap-2.5 items-start">
          {/* Thumbnail 56x56 */}
          <div className="shrink-0">
            {thumbUrl ? (
              <img
                src={thumbUrl}
                alt=""
                className="h-14 w-14 rounded-lg object-cover border border-[--k-border] bg-white"
                loading="lazy"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).src = '';
                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                }}
              />
            ) : (
              <div className="h-14 w-14 rounded-lg border border-dashed border-[--k-border] bg-[--k-surface-2]/40 flex items-center justify-center text-[--k-muted]">
                {hasSelection ? (
                  <ImageOff className="h-5 w-5" />
                ) : (
                  <PackageIcon className="h-5 w-5" />
                )}
              </div>
            )}
          </div>

          {/* Dropdown produit + description */}
          <div className="flex-1 min-w-0">
            <select
              className="w-full text-[12.5px] rounded-lg border border-[--k-border] bg-[--k-surface] px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-[--k-primary]/40 focus:border-[--k-primary]"
              value={productId}
              onChange={(e) => handleProductChange(e.target.value)}
              disabled={productsQ.isLoading || busy}
            >
              <option value="">
                {productsQ.isLoading
                  ? 'Chargement…'
                  : products.length === 0
                    ? '— Aucun produit dans cette catégorie —'
                    : '— Aucun choix —'}
              </option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {productLabel(p)}
                </option>
              ))}
            </select>
            {selectedProduct && (
              <div className="mt-1 flex items-center gap-1.5 text-[10.5px] text-[--k-muted]">
                <Hash className="h-3 w-3 shrink-0" />
                <span className="font-mono truncate">{selectedProduct.reference}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bandeau bas : SN + Qté + retirer */}
      {hasSelection && (
        <div className="flex items-center gap-2 border-t border-[--k-border] px-3 py-2 bg-[--k-surface-2]/30">
          {/* SN ou etat sans SN */}
          <div className="flex-1 min-w-0">
            {selectedProduct?.hasSerialNumber ? (
              <select
                className="w-full text-[12px] rounded-md border border-[--k-border] bg-[--k-surface] px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[--k-primary]/40"
                value={serialNumber}
                onChange={(e) => handleSerialChange(e.target.value)}
                disabled={serialsQ.isLoading || busy}
              >
                <option value="">
                  {serialsQ.isLoading
                    ? 'Chargement SN…'
                    : serialsQ.data && serialsQ.data.length === 0
                      ? 'Aucun SN dispo'
                      : '— N° série (facultatif) —'}
                </option>
                {serialsQ.data?.map((s) => (
                  <option key={s.id} value={s.serialNumber || s.id}>
                    {s.serialNumber || `(id ${s.id.slice(0, 8)})`}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-[11px] text-[--k-muted] italic px-1">Sans N° de série</span>
            )}
          </div>

          {/* Qte */}
          <div className="flex items-center gap-1 shrink-0">
            <label className="text-[11px] text-[--k-muted] font-medium">Qté</label>
            <input
              type="number"
              min={1}
              className="w-14 text-[12px] text-center rounded-md border border-[--k-border] bg-[--k-surface] px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-[--k-primary]/40"
              value={quantity}
              onChange={(e) => handleQtyChange(parseInt(e.target.value) || 1)}
              disabled={busy}
              title="Quantité"
            />
          </div>

          {/* Retirer */}
          <button
            type="button"
            onClick={() => {
              setProductId('');
              setSerialNumber('');
              setQuantity(1);
              removeM.mutate();
            }}
            className="shrink-0 text-[--k-muted] hover:text-rose-600 rounded p-0.5"
            title="Retirer ce composant"
            disabled={busy}
          >
            <MinusCircle className="h-4 w-4" />
          </button>
        </div>
      )}

      {error && (
        <div className="px-3 pb-2 text-[11px] text-rose-700">{error}</div>
      )}
    </div>
  );
}
