import api from './api';
import { ProductPosConfig } from '../types';

// Cached per productID for the whole session — mirrors productStore's
// products/categories cache. A product's modifier/combo config essentially
// never changes mid-shift, and every plain product tap also hits this
// endpoint (to check whether it has any options at all), so caching keeps
// the common case (a plain product with no options) fast after the first tap.
const _cache = new Map<number, ProductPosConfig>();
const _inFlight = new Map<number, Promise<ProductPosConfig>>();

function normalizeConfig(raw: any): ProductPosConfig {
  return {
    product:        raw.product ?? {},
    variants:       Array.isArray(raw.variants) ? raw.variants : [],
    modifierGroups: Array.isArray(raw.modifierGroups) ? raw.modifierGroups : [],
    modifiers:      Array.isArray(raw.modifiers) ? raw.modifiers : [],
    comboGroups:    Array.isArray(raw.comboGroups) ? raw.comboGroups : [],
    comboItems:     Array.isArray(raw.comboItems) ? raw.comboItems : [],
    bundleItems:    Array.isArray(raw.bundleItems) ? raw.bundleItems : [],
  };
}

export const productCatalogService = {
  async getPosConfig(productID: number, force = false): Promise<ProductPosConfig> {
    if (!force && _cache.has(productID)) return _cache.get(productID)!;
    if (!force && _inFlight.has(productID)) return _inFlight.get(productID)!;

    const p = (async () => {
      try {
        const res = await api.get(`/product-variants/pos-config/${productID}`);
        const raw = res.data?.data ?? res.data?.Data ?? res.data ?? {};
        const config = normalizeConfig(raw);
        _cache.set(productID, config);
        return config;
      } finally {
        _inFlight.delete(productID);
      }
    })();
    _inFlight.set(productID, p);
    return p;
  },

  hasOptions(config: ProductPosConfig): boolean {
    return config.variants.length > 0
      || config.modifierGroups.length > 0
      || config.comboGroups.length > 0
      || config.bundleItems.length > 0;
  },
};
