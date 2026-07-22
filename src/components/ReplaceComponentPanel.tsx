import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Loader2,
  Check,
  Package as PackageIcon,
  Hash,
  MinusCircle,
  ArrowRight,
} from 'lucide-react';
import api from '../services/api';

/**
 * Matrice des categories pour le mode "remplacement" du reconditionnement.
 *
 * Une card par ProductCategory. Chaque card = 2 slots cote a cote :
 *   [ANCIEN a retirer]  ->  [NOUVEAU a installer]
 *
 * Auto-save au changement (debounce 500ms sur qte). Chaque save appelle
 *   PUT /refurbishments/:id/categories/:catId
 * avec `{ removed, installed }` — les 2 blocs sont optionnels : on peut
 * ne retirer que l'ancien, n'installer que le nouveau, ou faire les 2.
 *
 * L'ancien composant a une disposition (Stock occasion / Stock neuf /
 * A tester / Rebut) qu'on choisit dans un mini dropdown.
 */

export type PartType = 'EQUIPMENT' | 'PROTECTION' | 'ACCESSORY';
export type Disposition = 'STOCK_NEW' | 'STOCK_USED' | 'TO_TEST' | 'SCRAP';

const DISPOSITION_LABEL: Record<Disposition, string> = {
  STOCK_NEW: 'Stock neuf',
  STOCK_USED: 'Stock occasion',
  TO_TEST: 'À tester',
  SCRAP: 'Rebut',
};

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

export interface RefurbCategorySelection {
  productCategoryId: string;
  removed: {
    componentId: string;
    productId: string;
    productReference: string;
    serialNumber: string | null;
    quantity: number;
    disposition: Disposition | null;
  } | null;
  installed: {
    componentId: string;
    productId: string;
    productReference: string;
    serialNumber: string | null;
    quantity: number;
  } | null;
}

const STOCK_BASE_URL = (import.meta.env.VITE_STOCK_URL || 'https://stocks.orkessi.com')
  .replace(/\/$/, '');
function fullImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  return `${STOCK_BASE_URL}${url}`;
}

interface Props {
  refurbId: string;
  partType: PartType | null;
  selections: Record<string, RefurbCategorySelection>;
  onChanged: () => void;
}

export default function ReplaceComponentPanel({
  refurbId,
  partType,
  selections,
  onChanged,
}: Props) {
  // Categories filtrees par partType du tab actif (pour les cards principales)
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

  // TOUTES les categories (pour le dropdown "nouveau" qui peut piocher
  // dans une autre categorie que celle de l'ancien — cas metier :
  // remplacer un PC par une tablette).
  const allCategoriesQ = useQuery({
    queryKey: ['catalog', 'product-categories', 'all'],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: StockProductCategory[] }>(
        `/catalog/product-categories`,
      );
      return res.data.data;
    },
  });

  const categories = (categoriesQ.data || []).filter((c) =>
    partType ? c.partType === partType : true,
  );
  const allCategories = allCategoriesQ.data || [];

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
          Tague les catégories dans Stock → Paramètres → Catégories principales.
        </div>
      </div>
    );
  }

  const filledCount = categories.filter((c) => {
    const s = selections[c.id];
    return s && (s.removed || s.installed);
  }).length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <div className="text-[11px] uppercase tracking-wide text-[--k-muted] font-semibold">
          Sélection par catégorie (ancien → nouveau)
        </div>
        <div className="text-[11px] text-[--k-muted] tabular-nums">
          {filledCount} / {categories.length} traitées
        </div>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        {categories.map((cat) => (
          <CategoryReplaceCard
            key={cat.id}
            refurbId={refurbId}
            category={cat}
            allCategories={allCategories}
            selection={selections[cat.id]}
            onChanged={onChanged}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Category card ───────────────────────────────────────────────────────

interface CardProps {
  refurbId: string;
  category: StockProductCategory;
  allCategories: StockProductCategory[];
  selection?: RefurbCategorySelection;
  onChanged: () => void;
}

type SideState = {
  productId: string;
  serialNumber: string;
  quantity: number;
};

function CategoryReplaceCard({
  refurbId,
  category,
  allCategories,
  selection,
  onChanged,
}: CardProps) {
  const qc = useQueryClient();

  // Etat local des 2 slots
  const [removed, setRemoved] = useState<SideState>({
    productId: selection?.removed?.productId ?? '',
    serialNumber: selection?.removed?.serialNumber ?? '',
    quantity: selection?.removed?.quantity ?? 1,
  });
  const [installed, setInstalled] = useState<SideState>({
    productId: selection?.installed?.productId ?? '',
    serialNumber: selection?.installed?.serialNumber ?? '',
    quantity: selection?.installed?.quantity ?? 1,
  });
  const [disposition, setDisposition] = useState<Disposition>(
    selection?.removed?.disposition || 'STOCK_USED',
  );
  // Categorie du nouveau produit — par defaut la meme que la card (cas
  // metier general "remplacement categorie identique"), mais l'operateur
  // peut piocher dans une autre categorie (ex : PC -> Tablette).
  // Etat UI-only (non persiste cote serveur pour l'instant).
  const [installedCategoryId, setInstalledCategoryId] = useState<string>(category.id);
  const [error, setError] = useState<string | null>(null);

  // Sync avec le serveur
  useEffect(() => {
    setRemoved({
      productId: selection?.removed?.productId ?? '',
      serialNumber: selection?.removed?.serialNumber ?? '',
      quantity: selection?.removed?.quantity ?? 1,
    });
    setInstalled({
      productId: selection?.installed?.productId ?? '',
      serialNumber: selection?.installed?.serialNumber ?? '',
      quantity: selection?.installed?.quantity ?? 1,
    });
    setDisposition(selection?.removed?.disposition || 'STOCK_USED');
    // Ne reset PAS installedCategoryId au sync (etat UI-only, pas persiste).
  }, [
    selection?.removed?.componentId,
    selection?.installed?.componentId,
    selection?.removed?.productId,
    selection?.installed?.productId,
    selection?.removed?.serialNumber,
    selection?.installed?.serialNumber,
    selection?.removed?.quantity,
    selection?.installed?.quantity,
    selection?.removed?.disposition,
  ]);

  // Produits de la categorie de l'ANCIEN (fixe = category.id)
  const removedProductsQ = useQuery({
    queryKey: ['catalog', 'products', category.id],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: StockProductLite[] }>(
        `/catalog/products?productCategoryId=${category.id}`,
      );
      return res.data.data;
    },
  });

  // Produits du NOUVEAU (categorie modifiable par l'operateur)
  const installedProductsQ = useQuery({
    queryKey: ['catalog', 'products', installedCategoryId],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: StockProductLite[] }>(
        `/catalog/products?productCategoryId=${installedCategoryId}`,
      );
      return res.data.data;
    },
    enabled: !!installedCategoryId,
  });

  const removedProducts = (removedProductsQ.data || []).filter(
    (p) => p.productCategoryId === category.id,
  );
  const installedProducts = (installedProductsQ.data || []).filter(
    (p) => p.productCategoryId === installedCategoryId,
  );
  const removedProduct = removedProducts.find((p) => p.id === removed.productId) || null;
  const installedProduct = installedProducts.find((p) => p.id === installed.productId) || null;

  // Serial items pour chaque slot (si produit tracé)
  const removedSerialsQ = useQuery({
    queryKey: ['catalog', 'serials', removed.productId],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: StockSerialItem[] }>(
        `/catalog/products/${removed.productId}/serial-items?status=IN_STOCK`,
      );
      return res.data.data;
    },
    enabled: !!removed.productId && !!removedProduct?.hasSerialNumber,
  });

  const installedSerialsQ = useQuery({
    queryKey: ['catalog', 'serials', installed.productId],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: StockSerialItem[] }>(
        `/catalog/products/${installed.productId}/serial-items?status=IN_STOCK`,
      );
      return res.data.data;
    },
    enabled: !!installed.productId && !!installedProduct?.hasSerialNumber,
  });

  const upsertM = useMutation({
    mutationFn: async (body: {
      removed: object | null;
      installed: object | null;
    }) => {
      await api.put(`/refurbishments/${refurbId}/categories/${category.id}`, body);
    },
    onSuccess: () => {
      setError(null);
      qc.invalidateQueries({ queryKey: ['refurbishment', refurbId] });
      onChanged();
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      setError(err.response?.data?.error || 'Erreur');
    },
  });

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = (
    nextRemoved: SideState,
    nextInstalled: SideState,
    nextDisposition: Disposition,
  ) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const rmProd = removedProducts.find((p) => p.id === nextRemoved.productId);
    const inProd = installedProducts.find((p) => p.id === nextInstalled.productId);
    upsertM.mutate({
      removed: rmProd
        ? {
            productId: rmProd.id,
            productReference: rmProd.reference,
            productDescription: productLabel(rmProd),
            serialNumber: rmProd.hasSerialNumber ? nextRemoved.serialNumber.trim() || null : null,
            quantity: Math.max(1, nextRemoved.quantity || 1),
            disposition: nextDisposition,
          }
        : null,
      installed: inProd
        ? {
            productId: inProd.id,
            productReference: inProd.reference,
            productDescription: productLabel(inProd),
            serialNumber: inProd.hasSerialNumber ? nextInstalled.serialNumber.trim() || null : null,
            quantity: Math.max(1, nextInstalled.quantity || 1),
          }
        : null,
    });
  };

  const flushDebounced = (
    nextRemoved: SideState,
    nextInstalled: SideState,
    nextDisposition: Disposition,
  ) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(
      () => flush(nextRemoved, nextInstalled, nextDisposition),
      500,
    );
  };

  const productLabel = (p: StockProductLite): string => {
    return (
      p.description?.trim() ||
      p.name?.trim() ||
      [p.brand, p.model, p.variant].filter(Boolean).join(' ') ||
      p.reference
    );
  };

  const clearAll = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setRemoved({ productId: '', serialNumber: '', quantity: 1 });
    setInstalled({ productId: '', serialNumber: '', quantity: 1 });
    upsertM.mutate({ removed: null, installed: null });
  };

  const hasSelection = !!selection && (!!selection.removed || !!selection.installed);
  const busy = upsertM.isPending;

  return (
    <div
      className={`group relative rounded-xl border transition-all bg-[--k-surface] ${
        hasSelection
          ? 'border-emerald-300 shadow-sm shadow-emerald-100/50 ring-1 ring-emerald-100/60'
          : 'border-[--k-border] hover:border-[--k-primary]/40'
      }`}
    >
      {/* Bandeau haut : nom + statut */}
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
          {!busy && hasSelection && (
            <button
              type="button"
              onClick={clearAll}
              className="text-[--k-muted] hover:text-rose-600 rounded p-0.5"
              title="Retirer la sélection de cette catégorie"
            >
              <MinusCircle className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* 2 colonnes ancien / nouveau */}
      <div className="px-3 pb-3">
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-2 items-start">
          {/* ANCIEN */}
          <ProductSlot
            side="removed"
            label="Ancien (à retirer)"
            product={removedProduct}
            state={removed}
            products={removedProducts}
            productsLoading={removedProductsQ.isLoading}
            serials={removedSerialsQ.data || []}
            serialsLoading={removedSerialsQ.isLoading}
            productLabel={productLabel}
            busy={busy}
            onProductChange={(pid) => {
              const next = { ...removed, productId: pid, serialNumber: '' };
              setRemoved(next);
              flush(next, installed, disposition);
            }}
            onSerialChange={(sn) => {
              const next = { ...removed, serialNumber: sn };
              setRemoved(next);
              flush(next, installed, disposition);
            }}
            onQtyChange={(n) => {
              const next = { ...removed, quantity: n };
              setRemoved(next);
              flushDebounced(next, installed, disposition);
            }}
          />

          {/* Fleche */}
          <div className="pt-9 flex justify-center text-[--k-muted]">
            <ArrowRight className="h-4 w-4" />
          </div>

          {/* NOUVEAU — categorie modifiable (ex: PC -> Tablette) */}
          <ProductSlot
            side="installed"
            label="Nouveau (à installer)"
            product={installedProduct}
            state={installed}
            products={installedProducts}
            productsLoading={installedProductsQ.isLoading}
            serials={installedSerialsQ.data || []}
            serialsLoading={installedSerialsQ.isLoading}
            productLabel={productLabel}
            busy={busy}
            categorySelector={{
              value: installedCategoryId,
              categories: allCategories,
              onChange: (newCatId) => {
                setInstalledCategoryId(newCatId);
                // Reset produit + SN quand on change de categorie
                const next = { productId: '', serialNumber: '', quantity: 1 };
                setInstalled(next);
                flush(removed, next, disposition);
              },
            }}
            onProductChange={(pid) => {
              const next = { ...installed, productId: pid, serialNumber: '' };
              setInstalled(next);
              flush(removed, next, disposition);
            }}
            onSerialChange={(sn) => {
              const next = { ...installed, serialNumber: sn };
              setInstalled(next);
              flush(removed, next, disposition);
            }}
            onQtyChange={(n) => {
              const next = { ...installed, quantity: n };
              setInstalled(next);
              flushDebounced(removed, next, disposition);
            }}
          />
        </div>

        {/* Disposition du RETIRE (visible si retire choisi) */}
        {removed.productId && (
          <div className="mt-2 flex items-center gap-1.5 text-[11px] text-[--k-muted]">
            <span>Ancien →</span>
            <select
              className="rounded-md border border-[--k-border] bg-[--k-surface] px-1.5 py-0.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-[--k-primary]/40"
              value={disposition}
              onChange={(e) => {
                const next = e.target.value as Disposition;
                setDisposition(next);
                flush(removed, installed, next);
              }}
              disabled={busy}
            >
              {(Object.keys(DISPOSITION_LABEL) as Disposition[]).map((d) => (
                <option key={d} value={d}>
                  {DISPOSITION_LABEL[d]}
                </option>
              ))}
            </select>
          </div>
        )}

        {error && <div className="mt-1 text-[11px] text-rose-700">{error}</div>}
      </div>
    </div>
  );
}

// ─── Product slot (used for ancien and nouveau) ─────────────────────────

interface SlotProps {
  side: 'removed' | 'installed';
  label: string;
  product: StockProductLite | null;
  state: SideState;
  products: StockProductLite[];
  productsLoading: boolean;
  serials: StockSerialItem[];
  serialsLoading: boolean;
  productLabel: (p: StockProductLite) => string;
  busy: boolean;
  /** Selecteur de categorie optionnel (uniquement cote nouveau). */
  categorySelector?: {
    value: string;
    categories: StockProductCategory[];
    onChange: (newCatId: string) => void;
  };
  onProductChange: (id: string) => void;
  onSerialChange: (sn: string) => void;
  onQtyChange: (n: number) => void;
}

function ProductSlot({
  side,
  label,
  product,
  state,
  products,
  productsLoading,
  serials,
  serialsLoading,
  productLabel,
  busy,
  categorySelector,
  onProductChange,
  onSerialChange,
  onQtyChange,
}: SlotProps) {
  const thumb = fullImageUrl(product?.imageUrl);
  const sideAccent =
    side === 'removed'
      ? 'text-rose-700'
      : 'text-emerald-700';

  return (
    <div className="min-w-0">
      <div className={`text-[10px] uppercase tracking-wide font-semibold mb-1 ${sideAccent}`}>
        {label}
      </div>
      <div className="flex gap-2 items-start">
        {thumb ? (
          <img
            src={thumb}
            alt=""
            className="h-12 w-12 rounded-lg object-cover border border-[--k-border] bg-white shrink-0"
            loading="lazy"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          <div className="h-12 w-12 rounded-lg border border-dashed border-[--k-border] bg-[--k-surface-2]/40 flex items-center justify-center text-[--k-muted] shrink-0">
            <PackageIcon className="h-4 w-4" />
          </div>
        )}
        <div className="flex-1 min-w-0 space-y-1">
          {categorySelector && (
            <select
              className="w-full text-[11px] rounded-md border border-[--k-border] bg-[--k-surface-2]/40 px-2 py-0.5 text-[--k-muted] focus:outline-none focus:ring-1 focus:ring-[--k-primary]/40"
              value={categorySelector.value}
              onChange={(e) => categorySelector.onChange(e.target.value)}
              disabled={busy}
              title="Catégorie du nouveau composant"
            >
              {categorySelector.categories
                .slice()
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          )}
          <select
            className="w-full text-[12px] rounded-lg border border-[--k-border] bg-[--k-surface] px-2 py-1 focus:outline-none focus:ring-2 focus:ring-[--k-primary]/40 focus:border-[--k-primary]"
            value={state.productId}
            onChange={(e) => onProductChange(e.target.value)}
            disabled={productsLoading || busy}
          >
            <option value="">
              {productsLoading
                ? 'Chargement…'
                : products.length === 0
                  ? '— Aucun produit —'
                  : '— Aucun choix —'}
            </option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {productLabel(p)}
              </option>
            ))}
          </select>
          {product && (
            <div className="flex items-center gap-1.5 text-[10px] text-[--k-muted]">
              <Hash className="h-2.5 w-2.5 shrink-0" />
              <span className="font-mono truncate">{product.reference}</span>
            </div>
          )}
          {product?.hasSerialNumber && (
            <select
              className="w-full text-[11px] rounded-md border border-[--k-border] bg-[--k-surface] px-1.5 py-0.5"
              value={state.serialNumber}
              onChange={(e) => onSerialChange(e.target.value)}
              disabled={serialsLoading || busy}
            >
              <option value="">
                {serialsLoading
                  ? 'SN…'
                  : serials.length === 0
                    ? 'Aucun SN dispo'
                    : '— SN (facultatif) —'}
              </option>
              {serials.map((s) => (
                <option key={s.id} value={s.serialNumber || s.id}>
                  {s.serialNumber || `(id ${s.id.slice(0, 8)})`}
                </option>
              ))}
            </select>
          )}
          {product && (
            <div className="flex items-center gap-1">
              <label className="text-[10px] text-[--k-muted] font-medium">Qté</label>
              <input
                type="number"
                min={1}
                className="w-12 text-[11px] text-center rounded-md border border-[--k-border] bg-[--k-surface] px-1 py-0.5"
                value={state.quantity}
                onChange={(e) => onQtyChange(parseInt(e.target.value) || 1)}
                disabled={busy}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
