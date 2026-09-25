import { posApi } from './api';
import { Product, Category, ProductPosConfig } from '../types';

const arr = (v: any): any[] => (Array.isArray(v) ? v : []);

function mapProduct(p: any): Product {
  return {
    productID:   p.productID,
    name:        p.name ?? '',
    nameAr:      p.alternateName,
    price:       Number(p.price ?? 0),
    categoryID:  p.categoryID ?? null,
    sku:         p.sku,
    barcode:     p.barcode,
    description: p.description,
    imageUrl:    p.imageURL ?? p.imageUrl,
    taxRate:     0.15,
    type:        p.type ?? p.productType,
  };
}

function mapCategory(c: any): Category {
  return {
    categoryID: c.categoryID,
    name:       c.categoryName ?? c.name ?? '',
    nameAr:     c.categoryNameAr,
    parentID:   c.parentCategoryID ?? c.parentID ?? null,
    sortOrder:  c.displayOrder ?? c.sortOrder ?? 0,
  };
}

export const productService = {
  // GET /pos/catalog/menu — categories + every product with its variants /
  // modifiers / combos / bundle contents inlined, so selecting a product
  // never needs its own network call. Each item nests the product's own
  // fields under `product` (same as Web POS's _flattenMenuProducts input).
  async getMenu(): Promise<{ products: Product[]; categories: Category[]; configs: ProductPosConfig[] }> {
    // Longer timeout than the default 15s: the server builds every
    // product's options in one response, which took ~20s on a cold call.
    const res = await posApi.get('/pos/catalog/menu', { timeout: 60000 });
    const d = res.data?.data ?? res.data ?? {};
    const items = arr(d.products);

    const products = items.map(item => mapProduct(item.product ?? item));
    const configs: ProductPosConfig[] = items.map(item => {
      const p = item.product ?? item;
      return {
        product:        { productID: p.productID, type: p.type ?? p.productType ?? '', name: p.name ?? '', price: Number(p.price ?? 0) },
        variants:       arr(item.variants),
        modifierGroups: arr(item.modifierGroups),
        modifiers:      arr(item.modifiers),
        comboGroups:    arr(item.comboGroups),
        comboItems:     arr(item.comboItems),
        bundleItems:    arr(item.bundleItems),
      };
    });

    return { products, categories: arr(d.categories).map(mapCategory), configs };
  },
};
