import { ProductPosConfig } from '../types';
import { useProductStore } from '../store/productStore';

// Per-product option configs (variants / modifier groups / combos / bundles).
// Filled in one go from GET /pos/catalog/menu (see productStore.load) — there
// is no per-product endpoint call any more; the old
// /product-variants/pos-config/{id} fan-out is gone.
const _cache = new Map<number, ProductPosConfig>();

const EMPTY: Omit<ProductPosConfig, 'product'> = {
  variants: [], modifierGroups: [], modifiers: [], comboGroups: [], comboItems: [], bundleItems: [],
};

export const productCatalogService = {
  setAll(configs: ProductPosConfig[]): void {
    _cache.clear();
    for (const c of configs) _cache.set(c.product.productID, c);
  },

  clear(): void {
    _cache.clear();
  },

  // Kept async so callers don't change: if the menu is still loading (e.g. a
  // tap right after login), wait for it instead of reporting "no options".
  async getPosConfig(productID: number): Promise<ProductPosConfig> {
    if (!_cache.has(productID)) {
      await useProductStore.getState().load().catch(() => {});
    }
    const cached = _cache.get(productID);
    if (cached) return cached;
    // Not in the menu (e.g. an inactive product referenced by a combo) — treat
    // as a plain product with no options rather than blocking the sale.
    const p = useProductStore.getState().products.find(x => x.productID === productID);
    return { product: { productID, type: p?.type ?? '', name: p?.name ?? '', price: p?.price ?? 0 }, ...EMPTY };
  },

  hasOptions(config: ProductPosConfig): boolean {
    return config.variants.length > 0
      || config.modifierGroups.length > 0
      || config.comboGroups.length > 0
      || config.bundleItems.length > 0;
  },
};
