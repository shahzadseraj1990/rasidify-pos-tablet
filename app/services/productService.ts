import api from './api';
import { Product, Category } from '../types';

export const productService = {
  async getProducts(): Promise<Product[]> {
    const res = await api.get('/invoicing/get/products/ALL');
    const raw: any[] = Array.isArray(res.data?.data)
      ? res.data.data
      : Array.isArray(res.data)
      ? res.data
      : [];
    return raw.map(p => ({
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
    }));
  },

  async getCategories(): Promise<Category[]> {
    const res = await api.get('/category', { params: { pageSize: 200 } });
    // API returns { data: { categories: [...] } }
    const raw: any[] = Array.isArray(res.data?.data?.categories)
      ? res.data.data.categories
      : Array.isArray(res.data?.categories)
      ? res.data.categories
      : Array.isArray(res.data?.data)
      ? res.data.data
      : Array.isArray(res.data)
      ? res.data
      : [];
    return raw.map(c => ({
      categoryID: c.categoryID,
      name:       c.categoryName ?? c.name ?? '',
      nameAr:     c.categoryNameAr,
      parentID:   c.parentCategoryID ?? c.parentID ?? null,
      sortOrder:  c.displayOrder ?? c.sortOrder ?? 0,
    }));
  },
};
