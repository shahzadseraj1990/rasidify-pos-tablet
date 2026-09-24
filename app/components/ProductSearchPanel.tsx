import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, Pressable, FlatList, Image, StyleSheet } from 'react-native';
import { Colors } from '../utils/colors';
import Icon from './Icon';
import Money from './Money';
import { Product } from '../types';
import { useSearchHistoryStore } from '../store/searchHistoryStore';

const MAX_RESULTS = 60;

// Name-prefix matches first, then anything containing the query in the name,
// Arabic name, SKU or barcode — so typing "bur" lists "Burger" before
// "Cheese Burger".
export function searchProducts(products: Product[], query: string): Product[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const starts: Product[] = [];
  const contains: Product[] = [];
  for (const p of products) {
    const name = p.name.toLowerCase();
    if (name.startsWith(q)) starts.push(p);
    else if (
      name.includes(q) ||
      (p.nameAr ?? '').toLowerCase().includes(q) ||
      (p.sku ?? '').toLowerCase().includes(q) ||
      (p.barcode ?? '').toLowerCase().includes(q)
    ) contains.push(p);
    if (starts.length >= MAX_RESULTS) break;
  }
  return [...starts, ...contains].slice(0, MAX_RESULTS);
}

type Props = {
  query: string;
  products: Product[];
  currency: string;
  qtyInCart: (productID: number) => number;
  onSelectProduct: (p: Product) => void;
  onSelectTerm: (term: string) => void;
  onClose: () => void;
};

// Dropdown shown under the Sell screen's search bar while searching: recent
// searches when the field is empty, live product results while typing.
// Rendered as an overlay over the product grid (not a Modal) so it shares
// the window with the search TextInput and never fights it for focus.
export default function ProductSearchPanel({ query, products, currency, qtyInCart, onSelectProduct, onSelectTerm, onClose }: Props) {
  const terms = useSearchHistoryStore(s => s.terms);
  const removeTerm = useSearchHistoryStore(s => s.remove);
  const clearTerms = useSearchHistoryStore(s => s.clear);

  const results = useMemo(() => searchProducts(products, query), [products, query]);
  const hasQuery = query.trim().length > 0;

  return (
    <View style={StyleSheet.absoluteFill}>
      <Pressable style={[StyleSheet.absoluteFill, styles.backdrop]} onPress={onClose} />
      <View style={styles.panel}>
        {!hasQuery ? (
          terms.length === 0 ? (
            <View style={styles.hint}>
              <Icon name="search" size={22} color={Colors.textMuted} />
              <Text style={styles.hintText}>Search products by name, SKU or barcode</Text>
            </View>
          ) : (
            <>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>RECENT SEARCHES</Text>
                <TouchableOpacity onPress={clearTerms} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={styles.clearAll}>Clear all</Text>
                </TouchableOpacity>
              </View>
              <FlatList
                data={terms}
                keyExtractor={t => t}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => (
                  <TouchableOpacity style={styles.termRow} onPress={() => onSelectTerm(item)}>
                    <Icon name="history" size={15} color={Colors.textMuted} />
                    <Text style={styles.termText} numberOfLines={1}>{item}</Text>
                    <TouchableOpacity onPress={() => removeTerm(item)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                      <Icon name="times" size={14} color={Colors.textMuted} />
                    </TouchableOpacity>
                  </TouchableOpacity>
                )}
              />
            </>
          )
        ) : results.length === 0 ? (
          <View style={styles.hint}>
            <Icon name="box-open" size={22} color={Colors.textMuted} />
            <Text style={styles.hintText}>No products match “{query.trim()}”</Text>
          </View>
        ) : (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{results.length}{results.length === MAX_RESULTS ? '+' : ''} {results.length === 1 ? 'PRODUCT' : 'PRODUCTS'}</Text>
            </View>
            <FlatList
              data={results}
              keyExtractor={p => String(p.productID)}
              keyboardShouldPersistTaps="handled"
              ItemSeparatorComponent={() => <View style={styles.separator} />}
              renderItem={({ item }) => {
                const qty = qtyInCart(item.productID);
                return (
                  <TouchableOpacity style={styles.resultRow} onPress={() => onSelectProduct(item)} activeOpacity={0.7}>
                    {item.imageUrl ? (
                      <Image source={{ uri: item.imageUrl }} style={styles.thumb} />
                    ) : (
                      <View style={[styles.thumb, styles.thumbPlaceholder]}>
                        <Icon name="box" size={18} color={Colors.textMuted} />
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.resultName} numberOfLines={1}>{item.name}</Text>
                      {!!(item.sku || item.barcode) && (
                        <Text style={styles.resultMeta} numberOfLines={1}>{[item.sku, item.barcode].filter(Boolean).join('  ·  ')}</Text>
                      )}
                    </View>
                    {qty > 0 && (
                      <View style={styles.qtyBadge}>
                        <Text style={styles.qtyBadgeText}>{qty} in cart</Text>
                      </View>
                    )}
                    <Money amount={item.price} currency={currency} style={styles.resultPrice} />
                    <View style={styles.addBtn}>
                      <Icon name="plus" size={14} color="#fff" />
                    </View>
                  </TouchableOpacity>
                );
              }}
            />
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(13,13,41,0.25)', borderRadius: 12 },
  panel: {
    maxHeight: '100%', backgroundColor: Colors.surface, borderRadius: 14,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden',
    shadowColor: Colors.shadow, shadowOpacity: 0.15, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 8,
  },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 18, paddingTop: 14, paddingBottom: 8,
  },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: Colors.textMuted, letterSpacing: 0.5 },
  clearAll: { fontSize: 13, fontWeight: '700', color: Colors.primary },

  termRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 18, paddingVertical: 14 },
  termText: { flex: 1, fontSize: 16, color: Colors.text },

  resultRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 18, paddingVertical: 10 },
  separator: { height: 1, backgroundColor: Colors.divider, marginLeft: 76 },
  thumb: { width: 44, height: 44, borderRadius: 10 },
  thumbPlaceholder: { backgroundColor: Colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  resultName: { fontSize: 16, fontWeight: '700', color: Colors.text },
  resultMeta: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  resultPrice: { fontSize: 16, fontWeight: '800', color: Colors.text },
  qtyBadge: { backgroundColor: Colors.primaryLight, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  qtyBadgeText: { fontSize: 11, fontWeight: '700', color: Colors.accent },
  addBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },

  hint: { alignItems: 'center', gap: 10, paddingVertical: 32, paddingHorizontal: 20 },
  hintText: { fontSize: 14, color: Colors.textMuted, textAlign: 'center' },
});
