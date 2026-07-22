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
 * Une card par ProductCategory du tab actif. Sur chaque card :
 *   [ANCIEN (lecture seule, tire de la borne)]  ->  [NOUVEAU (dropdown)]
 *
 * Le "ancien" est le produit d'origine installe sur la borne pour cette
 * categorie, recupere via l'endpoint /refurbishments/:id/suggestions.
 * L'operateur ne choisit pas l'ancien — il choisit uniquement le NOUVEAU
 * produit qui va le remplacer (meme categorie que la card).
 *
 * Auto-save : PUT /refurbishments/:id/categories/:catId au changement.
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

/** Suggestion = composant d'origine sur la borne (renvoye par /suggestions). */
export interface OriginalComponent {
  productId: string;
  productReference: string;
  productDescription: string | null;
  productCategoryId: string | null;
  serialNumber: string | null;
  quantity: number;
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
  /** Composants d'origine de la borne (via /suggestions), indexes par productCategoryId. */
  originalsByCategory: Record<string, OriginalComponent[]>;
  onChanged: () => void;
}

export default function ReplaceComponentPanel({
  refurbId,
  partType,
  selections,
  originalsByCategory,
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
        <div className="font-medium">
          Aucune catégorie {partType ? `« ${partType} »` : ''} taguée
        </div>
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
          Remplacement par catégorie
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
            originals={originalsByCategory[cat.id] || []}
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
  /** Composants d'origine de la borne pour CETTE categorie (0 ou plus). */
  originals: OriginalComponent[];
  selection?: RefurbCategorySelection;
  onChanged: () => void;
}

function CategoryReplaceCard({
  refurbId,
  category,
  originals,
  selection,
  onChanged,
}: CardProps) {
  const qc = useQueryClient();

  // Etat local du NOUVEAU (choix operateur)
  const [installedProductId, setInstalledProductId] = useState<string>(
    selection?.installed?.productId ?? '',
  );
  const [installedSerial, setInstalledSerial] = useState<string>(
    selection?.installed?.serialNumber ?? '',
  );
  const [installedQty, setInstalledQty] = useState<number>(
    selection?.installed?.quantity ?? 1,
  );
  const [disposition, setDisposition] = useState<Disposition>(
    selection?.removed?.disposition || 'STOCK_USED',
  );
  const [error, setError] = useState<string | null>(null);

  // Sync avec le serveur
  useEffect(() => {
    setInstalledProductId(selection?.installed?.productId ?? '');
    setInstalledSerial(selection?.installed?.serialNumber ?? '');
    setInstalledQty(selection?.installed?.quantity ?? 1);
    setDisposition(selection?.removed?.disposition || 'STOCK_USED');
  }, [
    selection?.installed?.componentId,
    selection?.installed?.productId,
    selection?.installed?.serialNumber,
    selection?.installed?.quantity,
    selection?.removed?.disposition,
  ]);

  // L'ancien = premier composant d'origine pour cette categorie (cas usuel :
  // 1 seul par categorie). Si plusieurs, on prend le premier ; les autres
  // pourraient etre traites dans une iteration future.
  const originalToRemove = originals[0] || null;

  const productsQ = useQuery({
    queryKey: ['catalog', 'products', category.id],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: StockProductLite[] }>(
        `/catalog/products?productCategoryId=${category.id}`,
      );
      return res.data.data;
    },
  });

  const products = (productsQ.data || []).filter(
    (p) => p.productCategoryId === category.id,
  );
  const installedProduct = products.find((p) => p.id === installedProductId) || null;

  // SN dispos pour le NOUVEAU (si tracé)
  const installedSerialsQ = useQuery({
    queryKey: ['catalog', 'serials', installedProductId],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: StockSerialItem[] }>(
        `/catalog/products/${installedProductId}/serial-items?status=IN_STOCK`,
      );
      return res.data.data;
    },
    enabled: !!installedProductId && !!installedProduct?.hasSerialNumber,
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
    nextProductId: string,
    nextSerial: string,
    nextQty: number,
    nextDisposition: Disposition,
  ) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const inProd = products.find((p) => p.id === nextProductId);
    upsertM.mutate({
      // Si aucun nouveau produit ET pas d'ancien, on delete les 2. Sinon
      // on retire toujours l'ancien (s'il existe) quand on installe.
      removed:
        inProd && originalToRemove
          ? {
              productId: originalToRemove.productId,
              productReference: originalToRemove.productReference,
              productDescription: originalToRemove.productDescription || null,
              serialNumber: originalToRemove.serialNumber || null,
              quantity: originalToRemove.quantity,
              disposition: nextDisposition,
            }
          : null,
      installed: inProd
        ? {
            productId: inProd.id,
            productReference: inProd.reference,
            productDescription: productLabel(inProd),
            serialNumber: inProd.hasSerialNumber ? nextSerial.trim() || null : null,
            quantity: Math.max(1, nextQty || 1),
          }
        : null,
    });
  };

  const flushDebounced = (
    nextProductId: string,
    nextSerial: string,
    nextQty: number,
    nextDisposition: Disposition,
  ) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(
      () => flush(nextProductId, nextSerial, nextQty, nextDisposition),
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

  const clearInstalled = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setInstalledProductId('');
    setInstalledSerial('');
    setInstalledQty(1);
    // Vide TOUT (removed + installed). L'ancien reste dispo dans la
    // borne, il sera re-propose au prochain edit.
    upsertM.mutate({ removed: null, installed: null });
  };

  const hasSelection = !!selection && (!!selection.removed || !!selection.installed);
  const busy = upsertM.isPending;
  const thumbInstalled = fullImageUrl(installedProduct?.imageUrl);

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
              onClick={clearInstalled}
              className="text-[--k-muted] hover:text-rose-600 rounded p-0.5"
              title="Retirer la sélection"
            >
              <MinusCircle className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* 2 colonnes ancien / nouveau */}
      <div className="px-3 pb-3">
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-2 items-start">
          {/* ANCIEN (READ-ONLY) */}
          <OriginalSlot original={originalToRemove} />

          {/* Fleche */}
          <div className="pt-9 flex justify-center text-[--k-muted]">
            <ArrowRight className="h-4 w-4" />
          </div>

          {/* NOUVEAU (dropdown) */}
          <NewSlot
            productId={installedProductId}
            serial={installedSerial}
            quantity={installedQty}
            products={products}
            productsLoading={productsQ.isLoading}
            product={installedProduct}
            thumbUrl={thumbInstalled}
            serials={installedSerialsQ.data || []}
            serialsLoading={installedSerialsQ.isLoading}
            productLabel={productLabel}
            busy={busy}
            onProductChange={(pid) => {
              setInstalledProductId(pid);
              setInstalledSerial('');
              flush(pid, '', installedQty, disposition);
            }}
            onSerialChange={(sn) => {
              setInstalledSerial(sn);
              flush(installedProductId, sn, installedQty, disposition);
            }}
            onQtyChange={(n) => {
              setInstalledQty(n);
              flushDebounced(installedProductId, installedSerial, n, disposition);
            }}
          />
        </div>

        {/* Disposition du RETIRE (visible si nouveau choisi ET ancien existe) */}
        {installedProductId && originalToRemove && (
          <div className="mt-2 flex items-center gap-1.5 text-[11px] text-[--k-muted]">
            <span>Ancien →</span>
            <select
              className="rounded-md border border-[--k-border] bg-[--k-surface] px-1.5 py-0.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-[--k-primary]/40"
              value={disposition}
              onChange={(e) => {
                const next = e.target.value as Disposition;
                setDisposition(next);
                flush(installedProductId, installedSerial, installedQty, next);
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

// ─── Slot ANCIEN (read-only) ────────────────────────────────────────────

function OriginalSlot({ original }: { original: OriginalComponent | null }) {
  if (!original) {
    return (
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wide font-semibold mb-1 text-rose-700">
          Ancien (dans la borne)
        </div>
        <div className="flex gap-2 items-start">
          <div className="h-12 w-12 rounded-lg border border-dashed border-[--k-border] bg-[--k-surface-2]/40 flex items-center justify-center text-[--k-muted] shrink-0">
            <PackageIcon className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0 pt-1 text-[11px] text-[--k-muted] italic">
            Aucun composant d'origine dans cette catégorie
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wide font-semibold mb-1 text-rose-700">
        Ancien (dans la borne)
      </div>
      <div className="flex gap-2 items-start">
        <div className="h-12 w-12 rounded-lg border border-[--k-border] bg-[--k-surface-2]/40 flex items-center justify-center text-[--k-muted] shrink-0">
          <PackageIcon className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0 space-y-0.5">
          <div className="text-[12px] font-medium text-[--k-text] leading-snug truncate">
            {original.productDescription || original.productReference}
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-[--k-muted]">
            <Hash className="h-2.5 w-2.5 shrink-0" />
            <span className="font-mono truncate">{original.productReference}</span>
          </div>
          {original.serialNumber && (
            <div className="text-[10px] text-[--k-muted]">
              SN <span className="font-mono">{original.serialNumber}</span>
            </div>
          )}
          {original.quantity > 1 && (
            <div className="text-[10px] text-[--k-muted]">Qté {original.quantity}</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Slot NOUVEAU ───────────────────────────────────────────────────────

interface NewSlotProps {
  productId: string;
  serial: string;
  quantity: number;
  products: StockProductLite[];
  productsLoading: boolean;
  product: StockProductLite | null;
  thumbUrl: string | null;
  serials: StockSerialItem[];
  serialsLoading: boolean;
  productLabel: (p: StockProductLite) => string;
  busy: boolean;
  onProductChange: (id: string) => void;
  onSerialChange: (sn: string) => void;
  onQtyChange: (n: number) => void;
}

function NewSlot({
  productId,
  serial,
  quantity,
  products,
  productsLoading,
  product,
  thumbUrl,
  serials,
  serialsLoading,
  productLabel,
  busy,
  onProductChange,
  onSerialChange,
  onQtyChange,
}: NewSlotProps) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wide font-semibold mb-1 text-emerald-700">
        Nouveau (à installer)
      </div>
      <div className="flex gap-2 items-start">
        {thumbUrl ? (
          <img
            src={thumbUrl}
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
          <select
            className="w-full text-[12px] rounded-lg border border-[--k-border] bg-[--k-surface] px-2 py-1 focus:outline-none focus:ring-2 focus:ring-[--k-primary]/40 focus:border-[--k-primary]"
            value={productId}
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
              value={serial}
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
                value={quantity}
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
