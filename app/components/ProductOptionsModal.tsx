import React, { useEffect, useMemo, useState } from 'react';
import { View, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Modal } from 'react-native';
import { C, F, R, S, T, palette } from '../theme/tokens';
import { Txt, Glyph, Button, IconButton } from './ui';
import Money from './Money';
import { productCatalogService } from '../services/productCatalogService';
import { buildSelectionSummary } from '../utils/selectionTree';
import { Product, ProductPosConfig, ComboGroupItem, LineItemSelection } from '../types';

export interface ProductOptionsResult {
  computedPrice: number;
  /** Quantity chosen in the popup's stepper (design: "Quantity − 1 +"). */
  quantity: number;
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

interface PickedExtra { group: string; label: string; price: number; indent?: boolean }

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
  const [qty, setQty] = useState(1);

  useEffect(() => {
    if (!visible || !product) return;
    setLoading(true);
    setConfig(null);
    setNestedConfigs(new Map());
    setVariantID(null);
    setModifierSel(new Map());
    setComboSel(new Map());
    setNestedSel(new Map());
    setQty(1);

    (async () => {
      try {
        const cfg = await productCatalogService.getPosConfig(product.productID);
        setConfig(cfg);

        // Look up each distinct combo item's own config (from the cached
        // catalog menu — no network call), to discover any modifier groups
        // attached to that item product (e.g. Fries -> Size).
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
      if (v) out.push({ group: 'Variant', label: v.name, price: v.price - config.product.price });
    }
    for (const g of config.modifierGroups) {
      for (const id of modifierSel.get(g.modifierGroupID) ?? []) {
        const m = config.modifiers.find(m => m.modifierID === id);
        if (m) out.push({ group: g.name, label: m.name, price: m.price });
      }
    }
    for (const g of config.comboGroups) {
      for (const id of comboSel.get(g.comboGroupID) ?? []) {
        const ci = config.comboItems.find(ci => ci.comboGroupItemID === id);
        if (!ci) continue;
        out.push({ group: g.name, label: ci.itemProductName, price: ci.additionalPrice });
        const nestedCfg = nestedConfigs.get(ci.itemProductID);
        if (!nestedCfg) continue;
        for (const ng of nestedCfg.modifierGroups) {
          for (const nid of nestedSel.get(nestedKey(ci.comboGroupItemID, ng.modifierGroupID)) ?? []) {
            const nm = nestedCfg.modifiers.find(m => m.modifierID === nid);
            if (nm) out.push({ group: ng.name, label: nm.name, price: nm.price, indent: true });
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
      // A "required" group with no options can never be satisfied — skip it,
      // or Add to Cart stays disabled forever (seen on subscription products).
      if (!config.modifiers.some(m => m.modifierGroupID === g.modifierGroupID)) continue;
      const count = modifierSel.get(g.modifierGroupID)?.size ?? 0;
      if ((g.isRequired || g.minSelect > 0) && count < Math.max(g.minSelect, g.isRequired ? 1 : 0)) missing.push(g.name);
    }
    for (const g of config.comboGroups) {
      if (!config.comboItems.some(ci => ci.comboGroupID === g.comboGroupID)) continue; // no options
      const count = comboSel.get(g.comboGroupID)?.size ?? 0;
      if (count < Math.max(g.minSelect, 1)) missing.push(g.name);
    }
    for (const [itemID, cfg] of nestedConfigs) {
      const selectedComboItemIDs = new Set(Array.from(comboSel.values()).flatMap(s => Array.from(s)));
      const comboItem = config.comboItems.find(ci => ci.itemProductID === itemID && selectedComboItemIDs.has(ci.comboGroupItemID));
      if (!comboItem) continue; // this item's slot isn't currently selected
      for (const g of cfg.modifierGroups) {
        if (!cfg.modifiers.some(m => m.modifierGroupID === g.modifierGroupID)) continue; // no options
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

    onConfirm({ computedPrice, quantity: qty, selectionSummary: buildSelectionSummary(lineSelections), lineSelections });
  };

  if (!product) return null;

  const kind = product.type === 'CB' ? 'Combo' : product.type === 'BN' ? 'Bundle' : 'Options';
  const fmtExtra = (p: number) => (p === 0 ? 'Included' : `${p > 0 ? '+' : '−'}${Math.abs(p).toFixed(2)}`);
  const rule = (required: boolean, max: number) =>
    required
      ? (max > 1 ? `Required, choose up to ${max}` : 'Required, choose 1')
      : (max > 1 ? `Optional, up to ${max}` : max === 1 ? 'Optional, choose 1' : 'Optional, any number');

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.head}>
            <View style={styles.flex}>
              <Txt variant="caption" weight="semibold" color={C.brand}>{kind}</Txt>
              <Txt variant="h1" numberOfLines={1}>{product.name}</Txt>
            </View>
            {!loading && config ? (
              missingRequirements.length === 0 ? (
                <View style={[styles.chip, styles.chipOk]}>
                  <Glyph name="check" size={16} color={C.brand} strokeWidth={2.6} />
                  <Txt variant="caption" weight="semibold" color={C.brand}>All required choices made</Txt>
                </View>
              ) : (
                <View style={[styles.chip, styles.chipDue]}>
                  <Txt variant="caption" weight="semibold" color={C.warningText} numberOfLines={1}>
                    Choose {missingRequirements.slice(0, 2).join(', ')}{missingRequirements.length > 2 ? '…' : ''}
                  </Txt>
                </View>
              )
            ) : null}
            <IconButton icon="close" variant="outline" size={52} onPress={onClose} />
          </View>

          {loading || !config ? (
            <View style={styles.loading}><ActivityIndicator color={C.brand} /></View>
          ) : (
            <View style={styles.body}>
              <ScrollView style={styles.flex} contentContainerStyle={styles.groups} showsVerticalScrollIndicator={false}>
                {config.variants.length > 0 && (
                  <GroupRow title="Variant" rule={rule(true, 1)}>
                    {config.variants.map(v => (
                      <Choice
                        key={v.variantID}
                        label={v.name}
                        price={fmtExtra(v.price - config.product.price)}
                        picked={variantID === v.variantID}
                        multi={false}
                        onPress={() => setVariantID(prev => (prev === v.variantID ? null : v.variantID))}
                      />
                    ))}
                  </GroupRow>
                )}

                {config.modifierGroups.filter(g => config.modifiers.some(m => m.modifierGroupID === g.modifierGroupID)).map(g => (
                  <GroupRow key={g.modifierGroupID} title={g.name} rule={rule(g.isRequired || g.minSelect > 0, g.maxSelect || 1)}>
                    {config.modifiers.filter(m => m.modifierGroupID === g.modifierGroupID).map(m => (
                      <Choice
                        key={m.modifierID}
                        label={m.name}
                        price={fmtExtra(m.price)}
                        picked={(modifierSel.get(g.modifierGroupID) ?? new Set()).has(m.modifierID)}
                        multi={(g.maxSelect || 1) > 1}
                        onPress={() => toggle(modifierSel, setModifierSel, g.modifierGroupID, m.modifierID, g.maxSelect || 1)}
                      />
                    ))}
                  </GroupRow>
                ))}

                {config.comboGroups.map(g => {
                  const items = config.comboItems.filter(ci => ci.comboGroupID === g.comboGroupID);
                  if (items.length === 0) return null;
                  const pickedItems = items.filter(ci => (comboSel.get(g.comboGroupID) ?? new Set()).has(ci.comboGroupItemID));
                  return (
                    <React.Fragment key={g.comboGroupID}>
                      <GroupRow title={g.name} rule={rule(true, g.maxSelect || 1)}>
                        {items.map(ci => (
                          <Choice
                            key={ci.comboGroupItemID}
                            label={ci.itemProductName}
                            price={fmtExtra(ci.additionalPrice)}
                            picked={pickedItems.includes(ci)}
                            multi={(g.maxSelect || 1) > 1}
                            onPress={() => toggleCombo(g.comboGroupID, ci.comboGroupItemID, g.maxSelect || 1)}
                          />
                        ))}
                      </GroupRow>
                      {/* Options of the picked item (e.g. Fries → Size), as their own rows. */}
                      {pickedItems.map(ci => {
                        const nestedCfg = nestedConfigs.get(ci.itemProductID);
                        if (!nestedCfg) return null;
                        return nestedCfg.modifierGroups
                          .filter(ng => nestedCfg.modifiers.some(m => m.modifierGroupID === ng.modifierGroupID))
                          .map(ng => {
                            const k = nestedKey(ci.comboGroupItemID, ng.modifierGroupID);
                            return (
                              <GroupRow key={k} title={ng.name} hint={ci.itemProductName} rule={rule(ng.isRequired || ng.minSelect > 0, ng.maxSelect || 1)}>
                                {nestedCfg.modifiers.filter(m => m.modifierGroupID === ng.modifierGroupID).map(m => (
                                  <Choice
                                    key={m.modifierID}
                                    label={m.name}
                                    price={fmtExtra(m.price)}
                                    picked={(nestedSel.get(k) ?? new Set()).has(m.modifierID)}
                                    multi={(ng.maxSelect || 1) > 1}
                                    onPress={() => toggle(nestedSel, setNestedSel, k, m.modifierID, ng.maxSelect || 1)}
                                  />
                                ))}
                              </GroupRow>
                            );
                          });
                      })}
                    </React.Fragment>
                  );
                })}

                {config.bundleItems.length > 0 && (
                  <GroupRow title="What's included" rule={`${config.bundleItems.length} item${config.bundleItems.length === 1 ? '' : 's'} in this bundle`}>
                    {config.bundleItems.map(b => (
                      <View key={b.bundleItemID} style={[styles.choice, styles.bundleItem]}>
                        <View style={styles.bundleQty}><Txt variant="caption" weight="bold" color={C.brand}>{b.quantity}×</Txt></View>
                        <Txt variant="label" weight="semibold" numberOfLines={2} style={styles.flex}>{b.itemProductName}</Txt>
                      </View>
                    ))}
                  </GroupRow>
                )}
              </ScrollView>

              <View style={styles.summary}>
                <Txt variant="title" weight="bold">Summary</Txt>
                <ScrollView style={styles.summaryList} showsVerticalScrollIndicator={false}>
                  <View style={styles.sumLine}>
                    <Txt variant="label" weight="semibold" numberOfLines={1} style={styles.flex}>{product.name}</Txt>
                    <Txt variant="label" weight="semibold">{basePrice.toFixed(2)}</Txt>
                  </View>
                  {pickedExtras.map((e, i) => (
                    <View key={i} style={[styles.sumLine, e.indent && styles.sumIndent]}>
                      <Txt variant="label" weight="regular" color={C.textMuted} numberOfLines={1} style={styles.flex}>
                        {e.group} · <Txt variant="label" weight="regular">{e.label}</Txt>
                      </Txt>
                      <Txt variant="label" weight="regular" color={C.textMuted}>{fmtExtra(e.price)}</Txt>
                    </View>
                  ))}
                  <View style={styles.sumRule} />
                  <View style={styles.sumLine}>
                    <Txt variant="label" weight="semibold" style={styles.flex}>Price each</Txt>
                    <Money amount={computedPrice} currency={currency} style={styles.each} />
                  </View>
                </ScrollView>

                <View style={styles.qtyRow}>
                  <Txt variant="label" weight="semibold" style={styles.flex}>Quantity</Txt>
                  <IconButton icon="minus" variant="outline" size={52} disabled={qty <= 1} onPress={() => setQty(q => Math.max(1, q - 1))} />
                  <Txt variant="h3" weight="bold" align="center" style={styles.qtyValue}>{qty}</Txt>
                  <IconButton icon="plus" variant="outline" size={52} onPress={() => setQty(q => q + 1)} />
                </View>
                <View style={styles.totalRow}>
                  <Txt variant="title" weight="semibold">Total</Txt>
                  <Money amount={computedPrice * qty} currency={currency} style={styles.total} />
                </View>
                <Button size="xl" label="Add to order" disabled={!canConfirm} onPress={handleConfirm} />
              </View>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

/** One option group: name + rule on the left, its choices in a 2-column grid. */
function GroupRow({ title, hint, rule, children }: { title: string; hint?: string; rule: string; children: React.ReactNode }) {
  return (
    <View style={styles.groupRow}>
      <View style={styles.groupHead}>
        {hint ? <Txt variant="small" weight="medium" color={C.brand} numberOfLines={1}>{hint}</Txt> : null}
        <Txt variant="title" weight="semibold">{title}</Txt>
        <Txt variant="small" weight="regular" color={C.textMuted}>{rule}</Txt>
      </View>
      <View style={styles.choices}>{children}</View>
    </View>
  );
}

/** Selectable tile: radio (single choice) or checkbox (multi), name, price. */
function Choice({ label, price, picked, multi, onPress }: {
  label: string; price: string; picked: boolean; multi: boolean; onPress: () => void;
}) {
  return (
    <TouchableOpacity activeOpacity={0.8} onPress={onPress} style={[styles.choice, picked && styles.choiceOn]}>
      <View style={[multi ? styles.box : styles.radio, picked && styles.markOn]}>
        {picked ? <Glyph name="check" size={14} color={palette.white} strokeWidth={3} /> : null}
      </View>
      <Txt variant="label" weight="semibold" numberOfLines={2} style={styles.flex}>{label}</Txt>
      <Txt variant="caption" weight="semibold" color={price === 'Included' ? C.textMuted : C.brand}>{price}</Txt>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  overlay: { flex: 1, backgroundColor: C.overlay, alignItems: 'center', justifyContent: 'center' },
  sheet: { width: '82%', maxWidth: 1100, height: '92%', maxHeight: 780, borderRadius: R.sheet, backgroundColor: C.surface, overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'center', gap: S.lg, paddingHorizontal: 28, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: C.border },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 40, borderRadius: R.pill, maxWidth: 360 },
  chipOk: { backgroundColor: C.brandTint },
  chipDue: { backgroundColor: C.warningBg },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, flexDirection: 'row' },

  groups: { paddingHorizontal: 28, paddingTop: 8, paddingBottom: 24 },
  groupRow: { flexDirection: 'row', gap: S.lg, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: C.divider },
  groupHead: { width: 170, paddingTop: 10 },
  choices: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 },
  choice: {
    width: '48.8%', minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: R.lg, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface,
  },
  choiceOn: { borderColor: C.brand, backgroundColor: C.brandTint },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: palette.subtle, alignItems: 'center', justifyContent: 'center' },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: palette.subtle, alignItems: 'center', justifyContent: 'center' },
  markOn: { backgroundColor: C.brand, borderColor: C.brand },
  bundleItem: { backgroundColor: C.bg },
  bundleQty: { minWidth: 34, height: 28, paddingHorizontal: 6, borderRadius: R.sm, backgroundColor: C.brandTint, alignItems: 'center', justifyContent: 'center' },

  summary: { width: 340, padding: 24, gap: 14, backgroundColor: C.brandSoft, borderLeftWidth: 1, borderLeftColor: C.border },
  summaryList: { flex: 1 },
  sumLine: { flexDirection: 'row', alignItems: 'center', gap: S.sm, paddingVertical: 5 },
  sumIndent: { paddingLeft: 12 },
  sumRule: { height: 1, backgroundColor: C.border, marginVertical: 10 },
  each: { fontSize: T.label, fontFamily: F.bold, color: C.text },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  qtyValue: { minWidth: 36 },
  totalRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  total: { fontSize: 30, fontFamily: F.bold, color: C.text },
});
