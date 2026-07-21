import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Loader2, Plus, AlertTriangle } from 'lucide-react';
import api from '../services/api';

/**
 * Panel "Ajouter un composant hors nomenclature" affiché sous la
 * checklist BOM de la page assemblage Factory, un par tab de PartType.
 *
 * Flow : Catégorie principale → Produit → (SN si le produit en gère) →
 * bouton Ajouter. Le SN est optionnel : si aucun SN n'est disponible
 * un message s'affiche mais on peut quand même ajouter sans SN.
 *
 * `partType` filtre la 1re dropdown côté serveur. Si null on affiche
 * toutes les catégories (fallback rarissime pour un tab non-typé).
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
  hasSerialNumber: boolean;
  productCategoryId: string | null;
}

interface StockSerialItem {
  id: string;
  serialNumber: string | null;
  status: 'IN_STOCK' | 'OUT' | 'IN_REPAIR' | 'SCRAPPED' | 'LOST';
}

interface Props {
  assemblyId: string;
  partType: PartType | null;
  onAdded: () => void;
}

export default function AddComponentPanel({ assemblyId, partType, onAdded }: Props) {
  const [categoryId, setCategoryId] = useState('');
  const [productId, setProductId] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState<string | null>(null);

  // Reset la chaine de selection quand le tab actif change
  useEffect(() => {
    setCategoryId('');
    setProductId('');
    setSerialNumber('');
    setQuantity(1);
    setError(null);
  }, [partType]);

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

  const productsQ = useQuery({
    queryKey: ['catalog', 'products', categoryId],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: StockProductLite[] }>(
        `/catalog/products?productCategoryId=${categoryId}`,
      );
      return res.data.data;
    },
    enabled: !!categoryId,
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

  const addM = useMutation({
    mutationFn: async () => {
      if (!selectedProduct) throw new Error('Produit requis');
      await api.post(`/assembly-orders/${assemblyId}/components`, {
        productId: selectedProduct.id,
        productReference: selectedProduct.reference,
        serialNumber: selectedProduct.hasSerialNumber ? serialNumber.trim() || null : null,
        quantity: Math.max(1, Number(quantity) || 1),
      });
    },
    onSuccess: () => {
      setError(null);
      setProductId('');
      setSerialNumber('');
      setQuantity(1);
      // On garde la categorie selectionnee pour ajouter en rafale.
      onAdded();
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      setError(err.response?.data?.error || "Impossible d'ajouter le composant");
    },
  });

  const productLabel = (p: StockProductLite): string => {
    if (p.name) return `${p.name} (${p.reference})`;
    // Fallback si pas de nom : brand + model + variant
    const parts = [p.brand, p.model, p.variant].filter(Boolean).join(' ');
    return parts ? `${parts} (${p.reference})` : p.reference;
  };

  const hasSerialNoStock =
    !!selectedProduct?.hasSerialNumber && serialsQ.data && serialsQ.data.length === 0;

  return (
    <div className="border-t border-[--k-border] bg-[--k-surface-2]/30 px-4 py-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-[11px] uppercase tracking-wide text-[--k-muted]">
          Ajouter un composant hors nomenclature
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1fr)_auto_auto] gap-2 items-start">
        {/* Categorie principale */}
        <div>
          <label className="block text-[11px] text-[--k-muted] mb-0.5">Catégorie</label>
          <select
            className="input-field w-full text-[13px]"
            value={categoryId}
            onChange={(e) => {
              setCategoryId(e.target.value);
              setProductId('');
              setSerialNumber('');
            }}
            disabled={categoriesQ.isLoading}
          >
            <option value="">
              {categoriesQ.isLoading ? 'Chargement…' : '— Choisir une catégorie —'}
            </option>
            {categoriesQ.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.codeReference})
              </option>
            ))}
          </select>
          {categoriesQ.data && categoriesQ.data.length === 0 && (
            <p className="mt-1 text-[11px] text-amber-700">
              Aucune catégorie {partType ? `« ${partType} »` : ''} taguée côté Stock.
            </p>
          )}
        </div>

        {/* Produit */}
        <div>
          <label className="block text-[11px] text-[--k-muted] mb-0.5">Produit</label>
          <select
            className="input-field w-full text-[13px]"
            value={productId}
            onChange={(e) => {
              setProductId(e.target.value);
              setSerialNumber('');
            }}
            disabled={!categoryId || productsQ.isLoading}
          >
            <option value="">
              {!categoryId
                ? '— Choisir d\'abord une catégorie —'
                : productsQ.isLoading
                  ? 'Chargement…'
                  : productsQ.data && productsQ.data.length === 0
                    ? 'Aucun produit dans cette catégorie'
                    : '— Choisir un produit —'}
            </option>
            {productsQ.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {productLabel(p)}
              </option>
            ))}
          </select>
        </div>

        {/* N° de serie ou quantite */}
        {selectedProduct?.hasSerialNumber ? (
          <div>
            <label className="block text-[11px] text-[--k-muted] mb-0.5">N° de série</label>
            <div className="flex gap-1">
              <select
                className="input-field w-full text-[13px]"
                value={serialNumber}
                onChange={(e) => setSerialNumber(e.target.value)}
                disabled={serialsQ.isLoading}
              >
                <option value="">
                  {serialsQ.isLoading
                    ? 'Chargement…'
                    : hasSerialNoStock
                      ? '— Aucun SN disponible —'
                      : '— Choisir un SN (facultatif) —'}
                </option>
                {serialsQ.data?.map((s) => (
                  <option key={s.id} value={s.serialNumber || s.id}>
                    {s.serialNumber || `(sans SN — id ${s.id.slice(0, 8)})`}
                  </option>
                ))}
              </select>
            </div>
            {hasSerialNoStock && (
              <p className="mt-1 text-[11px] text-amber-700 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Aucun SN libre en stock. Tu peux ajouter sans SN ou en créer un côté Stock.
              </p>
            )}
          </div>
        ) : (
          <div>
            <label className="block text-[11px] text-[--k-muted] mb-0.5">Quantité</label>
            <input
              type="number"
              min={1}
              className="input-field w-full text-[13px]"
              value={quantity}
              onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
              disabled={!selectedProduct}
            />
          </div>
        )}

        {/* Spacer + bouton */}
        <div />
        <div className="flex items-end">
          <button
            type="button"
            onClick={() => addM.mutate()}
            disabled={!selectedProduct || addM.isPending}
            className="h-9 rounded-lg bg-[--k-primary] text-white px-3 text-[13px] font-medium inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            {addM.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Ajouter
          </button>
        </div>
      </div>

      {error && (
        <p className="text-[12px] text-rose-700">{error}</p>
      )}
    </div>
  );
}
