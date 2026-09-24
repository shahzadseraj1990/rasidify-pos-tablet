import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Modal } from 'react-native';
import { Colors } from '../utils/colors';
import Icon from './Icon';
import Money from './Money';
import { productCatalogService } from '../services/productCatalogService';
import { buildSelectionSummary } from '../utils/selectionTree';
import { Product, ProductPosConfig, ComboGroupItem, LineItemSelection } from '../types';

export interface ProductOptionsResult {
  computedPrice: number;
  selectionSummary: string;
  lineSelections: LineItemSelection[];
}

interface Props {
  visible: boolean;
  product: Product | null;
  currency: string;
  onClose: () => void;
  onConfirm: (result: ProductOptionsResult) => void;
}

// Nested-modifier selection is keyed by "<comboGroupItemID>:<modifierGroupID>"
// so the same modifier group attached to two different combo items (rare but
// possible) doesn't collide.
const nestedKey = (comboGroupItemID: number, modifierGroupID: number) => `${comboGroupItemID}:${modifierGroupID}`;

interface PickedExtra { label: string; price: number; indent?: boolean }

export default function ProductOptionsModal({ visible, product, currency, onClose, onConfirm }: Props) {
  const [loading, setLoading] = useState(false);
  const [config, setConfig] = useState<ProductPosConfig | null>(null);
  // itemProductID -> its own pos-config, only kept for combo items that carry
  // their own modifier groups (e.g. "Fries" -> Size).
  const [nestedConfigs, setNestedConfigs] = useState<Map<number, ProductPosConfig>>(new Map());

  const [variantID, setVariantID] = useState<number | null>(null);
  const [modifierSel, setModifierSel] = useState<Map<number, Set<number>>>(new Map());
  const [comboSel, setComboSel] = useState<Map<number, Set<number>>>(new Map());
  const [nestedSel, setNestedSel] = useState<Map<string, Set<number>>>(new Map());

  useEffect(() => {
    if (!visible || !product) return;
    setLoading(true);
    setConfig(null);
    setNestedConfigs(new Map());
    setVariantID(null);
    setModifierSel(new Map());
    setComboSel(new Map());
    setNestedSel(new Map());

    (async () => {
      try {
        const cfg = await productCatalogService.getPosConfig(product.productID);
        setConfig(cfg);

        // Fetch pos-config for each distinct combo item once, to discover any
        // modifier groups attached to that item product (e.g. Fries -> Size).
        const itemIDs = Array.from(new Set(cfg.comboItems.map(ci => ci.itemProductID)));
        if (itemIDs.length > 0) {
          const results = await Promise.all(itemIDs.map(id => productCatalogService.getPosConfig(id)));
          const map = new Map<number, ProductPosConfig>();
          itemIDs.forEach((id, i) => {
            if (results[i].modifierGroups.length > 0) map.set(id, results[i]);
          });
          setNestedConfigs(map);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [visible, product]);

  const toggle = (
    map: Map<any, Set<number>>,
    setMap: (m: Map<any, Set<number>>) => void,
    key: any,
    optionId: number,
    max: number,
  ) => {
    const next = new Map(map);
    const cur = new Set(next.get(key) ?? []);
    if (max === 1) {
      next.set(key, cur.has(optionId) ? new Set() : new Set([optionId]));
    } else {
      if (cur.has(optionId)) cur.delete(optionId);
      else if (cur.size < max) cur.add(optionId);
      next.set(key, cur);
    }
    setMap(next);
  };

  const toggleCombo = (comboGroupID: number, comboGroupItemID: number, max: number) => {
    const prevSelected = comboSel.get(comboGroupID);
    // Selecting a different item in this combo slot invalidates any nested
    // modifier picks tied to the previously chosen item (mirrors web's
    // clearNestedFor) — otherwise stale selections could ride along silently.
    if (max === 1 && prevSelected && !prevSelected.has(comboGroupItemID)) {
      const next = new Map(nestedSel);
      for (const id of prevSelected) {
        for (const key of Array.from(next.keys())) {
          if (key.startsWith(`${id}:`)) next.delete(key);
        }
      }
      setNestedSel(next);
    }
    toggle(comboSel, setComboSel, comboGroupID, comboGroupItemID, max);
  };

  const basePrice = config?.product.price ?? product?.price ?? 0;

  // Flattened list of currently-picked extras, for the live summary panel.
  const pickedExtras: PickedExtra[] = useMemo(() => {
    if (!config) return [];
    const out: PickedExtra[] = [];
    if (variantID != null) {
      const v = config.variants.find(v => v.variantID === variantID);
      if (v) out.push({ label: v.name, price: v.price - config.product.price });
    }
    for (const g of config.modifierGroups) {
      for (const id of modifierSel.get(g.modifierGroupID) ?? []) {
        const m = config.modifiers.find(m => m.modifierID === id);
        if (m) out.push({ label: m.name, price: m.price });
      }
    }
    for (const g of config.comboGroups) {
      for (const id of comboSel.get(g.comboGroupID) ?? []) {
        const ci = config.comboItems.find(ci => ci.comboGroupItemID === id);
        if (!ci) continue;
        out.push({ label: ci.itemProductName, price: ci.additionalPrice });
        const nestedCfg = nestedConfigs.get(ci.itemProductID);
        if (!nestedCfg) continue;
        for (const ng of nestedCfg.modifierGroups) {
          for (const nid of nestedSel.get(nestedKey(ci.comboGroupItemID, ng.modifierGroupID)) ?? []) {
            const nm = nestedCfg.modifiers.find(m => m.modifierID === nid);
            if (nm) out.push({ label: `${ng.name}: ${nm.name}`, price: nm.price, indent: true });
          }
        }
      }
    }
    return out;
  }, [config, variantID, modifierSel, comboSel, nestedSel, nestedConfigs]);

  // Derived from pickedExtras (not a separate walk over the selection maps)
  // so the charged price always matches the extras listed in the summary.
  // A separate walk previously looked up nested modifier configs by
  // comboGroupItemID instead of itemProductID and silently dropped nested
  // extras (e.g. combo Fries -> Medium +2) from the total.
  const extraTotal = useMemo(() => pickedExtras.reduce((sum, e) => sum + e.price, 0), [pickedExtras]);
  const computedPrice = basePrice + extraTotal;

  const missingRequirements = useMemo(() => {
    if (!config) return ['loading'];
    const missing: string[] = [];
    if (config.variants.length > 0 && variantID == null) missing.push('Variant');
    for (const g of config.modifierGroups) {
      const count = modifierSel.get(g.modifierGroupID)?.size ?? 0;
      if ((g.isRequired || g.minSelect > 0) && count < Math.max(g.minSelect, g.isRequired ? 1 : 0)) missing.push(g.name);
    }
    for (const g of config.comboGroups) {
      const count = comboSel.get(g.comboGroupID)?.size ?? 0;
      if (count < Math.max(g.minSelect, 1)) missing.push(g.name);
    }
    for (const [itemID, cfg] of nestedConfigs) {
      const selectedComboItemIDs = new Set(Array.from(comboSel.values()).flatMap(s => Array.from(s)));
      const comboItem = config.comboItems.find(ci => ci.itemProductID === itemID && selectedComboItemIDs.has(ci.comboGroupItemID));
      if (!comboItem) continue; // this item's slot isn't currently selected
      for (const g of cfg.modifierGroups) {
        const count = nestedSel.get(nestedKey(comboItem.comboGroupItemID, g.modifierGroupID))?.size ?? 0;
        if ((g.isRequired || g.minSelect > 0) && count < Math.max(g.minSelect, g.isRequired ? 1 : 0)) missing.push(`${comboItem.itemProductName} — ${g.name}`);
      }
    }
    return missing;
  }, [config, variantID, modifierSel, comboSel, nestedSel, nestedConfigs]);

  const canConfirm = !loading && missingRequirements.length === 0;

  const handleConfirm = () => {
    if (!config || !canConfirm) return;
    const lineSelections: LineItemSelection[] = [];

    if (variantID != null) {
      const v = config.variants.find(v => v.variantID === variantID);
      if (v) lineSelections.push({ selectionType: 'Variant', groupID: null, groupName: 'Variant', itemID: v.variantID, itemName: v.name, additionalPrice: v.price - config.product.price });
    }
    for (const g of config.modifierGroups) {
      for (const id of modifierSel.get(g.modifierGroupID) ?? []) {
        const m = config.modifiers.find(m => m.modifierID === id);
        if (m) lineSelections.push({ selectionType: 'Modifier', groupID: g.modifierGroupID, groupName: g.name, itemID: m.modifierID, itemName: m.name, additionalPrice: m.price });
      }
    }
    for (const g of config.comboGroups) {
      for (const id of comboSel.get(g.comboGroupID) ?? []) {
        const ci = config.comboItems.find(ci => ci.comboGroupItemID === id) as ComboGroupItem | undefined;
        if (!ci) continue;
        lineSelections.push({ selectionType: 'Combo', groupID: g.comboGroupID, groupName: g.name, itemID: ci.comboGroupItemID, itemName: ci.itemProductName, additionalPrice: ci.additionalPrice });
        const nestedCfg = nestedConfigs.get(ci.itemProductID);
        if (!nestedCfg) continue;
        for (const ng of nestedCfg.modifierGroups) {
          for (const nid of nestedSel.get(nestedKey(ci.comboGroupItemID, ng.modifierGroupID)) ?? []) {
            const nm = nestedCfg.modifiers.find(m => m.modifierID === nid);
            if (nm) lineSelections.push({ selectionType: 'Modifier', groupID: ng.modifierGroupID, groupName: `${ci.itemProductName} — ${ng.name}`, itemID: nm.modifierID, itemName: nm.name, additionalPrice: nm.price });
          }
        }
      }
    }

    onConfirm({ computedPrice, selectionSummary: buildSelectionSummary(lineSelections), lineSelections });
  };

  if (!product) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title} numberOfLines={1}>{product.name}</Text>
              <Text style={styles.subtitle}>Customize this item</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Icon name="times" size={16} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator color={Colors.primary} />
            </View>
          ) : config ? (
            <View style={styles.body}>
              <ScrollView style={styles.left} contentContainerStyle={{ paddingBottom: 8 }} showsVerticalScrollIndicator={false}>
                {config.variants.length > 0 && (
                  <Group title="Variant" required>
                    {config.variants.map(v => (
                      <Option
                        key={v.variantID}
                        label={v.name}
                        price={v.price - config.product.price}
                        picked={variantID === v.variantID}
                        onPress={() => setVariantID(prev => (prev === v.variantID ? null : v.variantID))}
                      />
                    ))}
                  </Group>
                )}

                {config.modifierGroups.map(g => (
                  <Group key={g.modifierGroupID} title={g.name} required={g.isRequired}>
                    {config.modifiers.filter(m => m.modifierGroupID === g.modifierGroupID).map(m => (
                      <Option
                        key={m.modifierID}
                        label={m.name}
                        price={m.price}
                        picked={(modifierSel.get(g.modifierGroupID) ?? new Set()).has(m.modifierID)}
                        onPress={() => toggle(modifierSel, setModifierSel, g.modifierGroupID, m.modifierID, g.maxSelect || 1)}
                      />
                    ))}
                  </Group>
                ))}

                {config.comboGroups.map(g => {
                  const items = config.comboItems.filter(ci => ci.comboGroupID === g.comboGroupID);
                  return (
                    <Group key={g.comboGroupID} title={g.name} required>
                      {items.map(ci => {
                        const picked = (comboSel.get(g.comboGroupID) ?? new Set()).has(ci.comboGroupItemID);
                        const nestedCfg = nestedConfigs.get(ci.itemProductID);
                        return (
                          <View key={ci.comboGroupItemID}>
                            <Option
                              label={ci.itemProductName}
                              price={ci.additionalPrice}
                              picked={picked}
                              onPress={() => toggleCombo(g.comboGroupID, ci.comboGroupItemID, g.maxSelect || 1)}
                            />
                            {picked && nestedCfg && (
                              <View style={styles.nested}>
                                {nestedCfg.modifierGroups.map(ng => (
                                  <Group key={ng.modifierGroupID} title={ng.name} required={ng.isRequired} compact>
                                    {nestedCfg.modifiers.filter(m => m.modifierGroupID === ng.modifierGroupID).map(m => {
                                      const k = nestedKey(ci.comboGroupItemID, ng.modifierGroupID);
                                      return (
                                        <Option
                                          key={m.modifierID}
                                          label={m.name}
                                          price={m.price}
                                          picked={(nestedSel.get(k) ?? new Set()).has(m.modifierID)}
                                          onPress={() => toggle(nestedSel, setNestedSel, k, m.modifierID, ng.maxSelect || 1)}
                                        />
                                      );
                                    })}
                                  </Group>
                                ))}
                              </View>
                            )}
                          </View>
                        );
                      })}
                    </Group>
                  );
                })}

                {config.bundleItems.length > 0 && (
                  <Group title="Includes">
                    {config.bundleItems.map(b => (
                      <View key={b.bundleItemID} style={styles.bundleRow}>
                        <View style={styles.bundleQtyBadge}>
                          <Text style={styles.bundleQtyText}>{b.quantity}×</Text>
                        </View>
                        <Text style={styles.optionLabel}>{b.itemProductName}</Text>
                      </View>
                    ))}
                  </Group>
                )}
              </ScrollView>

              <View style={styles.right}>
                <Text style={styles.fieldLabel}>ITEM PRICE</Text>
                <View style={styles.summaryBoxSmall}>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel} numberOfLines={1}>{product.name}</Text>
                    <Money amount={basePrice} currency={currency} style={styles.summaryValue} />
                  </View>
                  {pickedExtras.length > 0 && <View style={styles.summaryDivider} />}
                  <ScrollView style={styles.extrasScroll} showsVerticalScrollIndicator={false}>
                    {pickedExtras.map((e, i) => (
                      <View key={i} style={[styles.summaryRow, e.indent && styles.summaryRowIndent]}>
                        <Text style={styles.summaryLabelMuted} numberOfLines={1}>{e.label}</Text>
                        {e.price !== 0 && (
                          <Text style={styles.summaryValueMuted}>{e.price > 0 ? '+' : ''}{e.price.toFixed(2)}</Text>
                        )}
                      </View>
                    ))}
                  </ScrollView>
                </View>

                {missingRequirements.length > 0 && (
                  <View style={styles.requirementNotice}>
                    <Icon name="info-circle" size={12} color={Colors.warning} />
                    <Text style={styles.requirementNoticeText} numberOfLines={2}>
                      Select {missingRequirements.slice(0, 2).join(', ')}{missingRequirements.length > 2 ? '…' : ''}
                    </Text>
                  </View>
                )}

                <View style={{ flex: 1 }} />

                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Total</Text>
                  <Money amount={computedPrice} currency={currency} style={styles.totalValue} />
                </View>
                <TouchableOpacity
                  style={[styles.confirmBtn, !canConfirm && styles.confirmBtnDisabled]}
                  disabled={!canConfirm}
                  onPress={handleConfirm}
                >
                  <Icon name="cart-plus" size={14} color={Colors.textOnDark} />
                  <Text style={styles.confirmBtnText}>Add to Cart</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

function Group({ title, required, compact, children }: { title: string; required?: boolean; compact?: boolean; children: React.ReactNode }) {
  return (
    <View style={[styles.group, compact && styles.groupCompact]}>
      <View style={styles.groupHead}>
        <Text style={styles.groupTitle}>{title}</Text>
        {required && <Text style={styles.requiredBadge}>Required</Text>}
      </View>
      <View style={styles.groupBody}>{children}</View>
    </View>
  );
}

function Option({ label, price, picked, onPress }: { label: string; price: number; picked: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.optionRow, picked && styles.optionRowPicked]} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.dot, picked && styles.dotPicked]}>
        {picked && <Icon name="check" size={9} color={Colors.textOnDark} />}
      </View>
      <Text style={[styles.optionLabel, picked && styles.optionLabelPicked]} numberOfLines={1}>{label}</Text>
      {price !== 0 && (
        <Text style={[styles.optionPrice, picked && styles.optionLabelPicked]}>
          {price > 0 ? '+' : ''}{price.toFixed(2)}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: Colors.overlay, alignItems: 'center', justifyContent: 'center' },
  // Same footprint as the checkout/payment card (paymentCard in SellScreen)
  // so switching between the two modals feels like one consistent app,
  // not two different UI systems.
  card: {
    width: 820, maxWidth: '94%', minHeight: 620, maxHeight: '90%', backgroundColor: Colors.surface,
    borderRadius: 24, overflow: 'hidden',
  },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 28, paddingVertical: 22, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  title: { fontSize: 20, fontWeight: '800', color: Colors.text },
  subtitle: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  loadingBox: { flex: 1, minHeight: 300, alignItems: 'center', justifyContent: 'center' },

  body: { flex: 1, flexDirection: 'row', padding: 28, gap: 32 },
  left: { flex: 1.3 },
  right: { flex: 1 },

  fieldLabel: { fontSize: 12, fontWeight: '700', color: Colors.textMuted, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8 },

  group: { marginBottom: 20 },
  groupCompact: { marginBottom: 8, marginTop: 4 },
  groupHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  groupTitle: { fontSize: 14, fontWeight: '800', color: Colors.text },
  requiredBadge: {
    fontSize: 10, fontWeight: '700', color: Colors.warning, backgroundColor: Colors.warningBg,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, overflow: 'hidden', textTransform: 'uppercase', letterSpacing: 0.4,
  },
  groupBody: { gap: 8 },
  nested: { marginLeft: 30, marginTop: 6, marginBottom: 4, paddingLeft: 14, borderLeftWidth: 2, borderLeftColor: Colors.border },

  optionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14,
    borderRadius: 12, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.background,
  },
  optionRowPicked: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  dot: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surface },
  dotPicked: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  optionLabel: { fontSize: 14, fontWeight: '600', color: Colors.text, flex: 1 },
  optionLabelPicked: { fontWeight: '800', color: Colors.accent },
  optionPrice: { fontSize: 13, fontWeight: '700', color: Colors.textMuted, fontVariant: ['tabular-nums'] },

  bundleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  bundleQtyBadge: { backgroundColor: Colors.surfaceAlt, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  bundleQtyText: { fontSize: 12, fontWeight: '800', color: Colors.textLight },

  summaryBoxSmall: { backgroundColor: Colors.background, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: Colors.border },
  summaryDivider: { height: 1, backgroundColor: Colors.border, marginVertical: 10 },
  extrasScroll: { maxHeight: 220 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 5, gap: 8 },
  summaryRowIndent: { paddingLeft: 14 },
  summaryLabel: { fontSize: 14, fontWeight: '800', color: Colors.text, flex: 1 },
  summaryValue: { fontSize: 14, fontWeight: '800', color: Colors.text },
  summaryLabelMuted: { fontSize: 12.5, fontWeight: '600', color: Colors.textLight, flex: 1 },
  summaryValueMuted: { fontSize: 12.5, fontWeight: '700', color: Colors.textLight },

  requirementNotice: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: Colors.warningBg,
    borderRadius: 12, padding: 12, marginTop: 14,
  },
  requirementNoticeText: { flex: 1, fontSize: 12, fontWeight: '600', color: '#8A5A00', lineHeight: 16 },

  totalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, marginBottom: 12 },
  totalLabel: { fontSize: 13, fontWeight: '700', color: Colors.textLight, textTransform: 'uppercase', letterSpacing: 0.6 },
  totalValue: { fontSize: 26, fontWeight: '900', color: Colors.text },

  confirmBtn: {
    height: 56, borderRadius: 14, backgroundColor: Colors.primary,
    flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center',
  },
  confirmBtnDisabled: { backgroundColor: Colors.border },
  confirmBtnText: { color: Colors.textOnDark, fontWeight: '800', fontSize: 15 },
});
