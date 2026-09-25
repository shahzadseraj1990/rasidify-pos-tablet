import { create } from 'zustand';
import { productService } from '../services/productService';
import { productCatalogService } from '../services/productCatalogService';
import { Product, Category } from '../types';

interface ProductState {
  products: Product[];
  categories: Category[];
  loaded: boolean;
  loading: boolean;
  // Fetches once and caches for the rest of the session — call at login
  // (and on cold-start session restore) so screens like SellScreen never
  // need to hit the API themselves just because they remounted (e.g.
  // switching tabs in PosShellScreen unmounts/remounts each section).
  // Safe to call from multiple places: concurrent calls share one in-flight
  // request, and it's a no-op once already loaded unless `force` is passed.
  load: (force?: boolean) => Promise<void>;
  /** Drop the cached menu — next load() refetches (logout / Switch Device). */
  reset: () => void;
}

let inFlight: Promise<void> | null = null;

export const useProductStore = create<ProductState>((set, get) => ({
  products: [],
  categories: [],
  loaded: false,
  loading: false,

  load: async (force = false) => {
    if (get().loaded && !force) return;
    if (inFlight) return inFlight;

    set({ loading: true });
    inFlight = (async () => {
      try {
        // One call (GET /pos/catalog/menu) — products, categories, and every
        // product's modifier/combo/bundle config, which goes straight into
        // productCatalogService so option lookups never hit the network.
        const { products, categories, configs } = await productService.getMenu();
        productCatalogService.setAll(configs);
        set({ products, categories, loaded: true, loading: false });
      } catch (err) {
        set({ loading: false });
        throw err;
      } finally {
        inFlight = null;
      }
    })();
    return inFlight;
  },

  reset: () => set({ products: [], categories: [], loaded: false, loading: false }),
}));
