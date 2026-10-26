import React, { memo, useCallback, useMemo, useState } from 'react';
import { View, FlatList, TouchableOpacity, Image, StyleSheet } from 'react-native';
import { C, F, R, S, T, palette, initials } from '../../theme/tokens';
import { Txt, Glyph, EmptyState } from '../ui';
import Money from '../Money';
import { Product, Category } from '../../types';

// Sell screen catalogue (redesign): category cards first, then the products of
// the picked category with a "Back" tile in the first cell. Fixed card heights
// let FlatList skip measuring (getItemLayout) — keeps scrolling smooth on
// large supermarket menus.

export const GRID_COLUMNS = 5;
export const GRID_GAP = 14;
const CATEGORY_H = 112;
const PRODUCT_H = 196;
const ALL = -1;

const countText = (n: number) => (n === 0 ? 'No items yet' : n === 1 ? '1 item' : `${n} items`);

export const CategoryGrid = memo(function CategoryGrid({ categories, products, cellWidth, onPick }: {
  categories: Category[];
  products: Product[];
  cellWidth?: number;
  onPick: (categoryID: number | null) => void;
}) {
  const cards = useMemo(() => {
    const counts = new Map<number, number>();
    for (const p of products) if (p.categoryID != null) counts.set(p.categoryID, (counts.get(p.categoryID) ?? 0) + 1);
    return [
      ...categories.map(c => ({ id: c.categoryID, name: c.name, count: counts.get(c.categoryID) ?? 0 })),
      { id: ALL, name: 'All items', count: products.length },
    ];
  }, [categories, products]);

  return (
    <FlatList
      data={cards}
      keyExtractor={c => String(c.id)}
      numColumns={GRID_COLUMNS}
      key={`cats-${GRID_COLUMNS}`}
      columnWrapperStyle={styles.row}
      contentContainerStyle={styles.list}
      ListHeaderComponent={<Txt variant="h1" style={styles.title}>Categories</Txt>}
      renderItem={({ item }) => {
        const all = item.id === ALL;
        return (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => onPick(all ? null : item.id)}
            style={[styles.cat, cellWidth != null && { width: cellWidth }, all && styles.catAll]}
          >
            <Txt variant="title" weight="bold" size={T.title + 1} color={all ? C.textOnBrand : C.text} numberOfLines={2} textBreakStrategy="balanced" adjustsFontSizeToFit minimumFontScale={0.8}>{item.name}</Txt>
            <View style={styles.catFoot}>
              <Txt variant="caption" weight="medium" color={all ? C.brandLine : C.textMuted}>{countText(item.count)}</Txt>
              <View style={[styles.arrow, all && styles.arrowAll]}>
                <Glyph name="chevronRight" size={18} color={all ? C.textOnBrand : C.brand} strokeWidth={2.4} />
              </View>
            </View>
          </TouchableOpacity>
        );
      }}
    />
  );
});

const BACK = { productID: -1 } as Product;

export const ProductGrid = memo(function ProductGrid({ products, qtyByProduct, cellWidth, currency, backLabel, onBack, onAdd }: {
  products: Product[];
  qtyByProduct: Map<number, number>;
  cellWidth?: number;
  currency: string;
  backLabel: string;
  onBack: () => void;
  onAdd: (p: Product) => void;
}) {
  const data = useMemo(() => [BACK, ...products], [products]);
  const renderItem = useCallback(({ item }: { item: Product }) => item === BACK ? (
    <TouchableOpacity activeOpacity={0.85} onPress={onBack} style={[styles.back, cellWidth != null && { width: cellWidth }]}>
      <View style={styles.backIcon}><Glyph name="chevronLeft" size={28} color={C.textOnBrand} strokeWidth={2.4} /></View>
      <Txt variant="title" weight="bold" color={C.brand} align="center" numberOfLines={2}>{backLabel}</Txt>
    </TouchableOpacity>
  ) : (
    <ProductCard product={item} qty={qtyByProduct.get(item.productID) ?? 0} width={cellWidth} currency={currency} onPress={onAdd} />
  ), [qtyByProduct, cellWidth, currency, backLabel, onBack, onAdd]);

  return (
    <FlatList
      data={data}
      keyExtractor={p => String(p.productID)}
      numColumns={GRID_COLUMNS}
      key={`products-${GRID_COLUMNS}`}
      columnWrapperStyle={styles.row}
      contentContainerStyle={styles.list}
      renderItem={renderItem}
      getItemLayout={(_, index) => {
        const row = Math.floor(index / GRID_COLUMNS);
        return { length: PRODUCT_H + GRID_GAP, offset: row * (PRODUCT_H + GRID_GAP), index };
      }}
      initialNumToRender={GRID_COLUMNS * 4}
      maxToRenderPerBatch={GRID_COLUMNS * 3}
      windowSize={7}
      removeClippedSubviews
      ListFooterComponent={products.length === 0 ? <EmptyState title="No products here yet." icon="bag" /> : null}
    />
  );
});

const ProductCard = memo(function ProductCard({ product, qty, width, currency, onPress }: {
  product: Product; qty: number; width?: number; currency: string; onPress: (p: Product) => void;
}) {
  // A photo URL that fails to load falls back to the initials tile.
  const [imgFailed, setImgFailed] = useState(false);
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => onPress(product)}
      style={[styles.product, width != null && { width }, qty > 0 && styles.productOn]}
    >
      {product.imageUrl && !imgFailed
        ? <Image source={{ uri: product.imageUrl }} style={styles.image} resizeMode="cover" onError={() => setImgFailed(true)} />
        : <View style={[styles.image, styles.noImage]}><Txt variant="display" color={C.brand}>{initials(product.name)}</Txt></View>}
      {qty > 0 ? <View style={styles.qty}><Txt variant="body" weight="bold" color={palette.ink}>{qty}</Txt></View> : null}
      <View style={styles.info}>
        <Txt variant="body" weight="semibold" numberOfLines={2} style={styles.name}>{product.name}</Txt>
        <Money amount={product.price} currency={currency} style={styles.price} />
      </View>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  list: { paddingBottom: 96, gap: GRID_GAP },
  row: { gap: GRID_GAP },
  title: { marginBottom: S.xs },
  cat: {
    height: CATEGORY_H, paddingTop: S.lg, paddingBottom: 14, paddingLeft: 18, paddingRight: S.lg,
    borderRadius: R.xxl, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, justifyContent: 'space-between',
  },
  catAll: { backgroundColor: C.brand, borderColor: C.brand },
  catFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: S.sm },
  arrow: { width: 32, height: 32, borderRadius: R.sm, backgroundColor: C.brandTint, alignItems: 'center', justifyContent: 'center' },
  arrowAll: { backgroundColor: 'rgba(255,255,255,0.18)' },
  back: {
    height: PRODUCT_H, borderRadius: R.xxl, borderWidth: 1.5, borderStyle: 'dashed', borderColor: palette.indigoLineStrong,
    backgroundColor: C.brandTint, alignItems: 'center', justifyContent: 'center', gap: S.md, paddingHorizontal: S.sm,
  },
  backIcon: { width: 56, height: 56, borderRadius: R.xxl, backgroundColor: C.brand, alignItems: 'center', justifyContent: 'center' },
  product: { height: PRODUCT_H, borderRadius: R.xxl, borderWidth: 2, borderColor: C.border, backgroundColor: C.surface, overflow: 'hidden' },
  productOn: { borderColor: C.brand },
  image: { width: '100%', height: 112 },
  noImage: { backgroundColor: C.brandTint, alignItems: 'center', justifyContent: 'center' },
  qty: {
    position: 'absolute', top: S.sm, right: S.sm, minWidth: 30, height: 30, paddingHorizontal: S.sm,
    borderRadius: 15, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center',
  },
  info: { flex: 1, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 12, justifyContent: 'space-between' },
  name: { lineHeight: 20 },
  price: { fontSize: T.caption, fontFamily: F.semibold, color: C.textMuted },
});
