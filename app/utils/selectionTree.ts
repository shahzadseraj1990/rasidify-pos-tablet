import { LineItemSelection } from '../types';

export interface SelectionTreeNode {
  label: string;
  extra: number;
  children: { label: string; extra: number }[];
}

// Mirrors the web POS's buildSelectionTree (src/app/core/utils/selection-display.ts):
// nested modifier picks are flattened into the same array with a composite
// groupName "<parent item name> — <nested group name>" — split on that
// separator to recover parent/child for display (cart list + receipt).
export function buildSelectionTree(selections: LineItemSelection[] | undefined): SelectionTreeNode[] {
  if (!selections || selections.length === 0) return [];

  const roots: SelectionTreeNode[] = [];
  const byItemName = new Map<string, SelectionTreeNode>();

  for (const sel of selections) {
    const groupName = sel.groupName ?? '';
    const sep = groupName.indexOf(' — ');
    if (sep === -1) {
      const node: SelectionTreeNode = { label: sel.itemName, extra: sel.additionalPrice, children: [] };
      roots.push(node);
      byItemName.set(sel.itemName, node);
    } else {
      const parentName = groupName.slice(0, sep);
      const parent = byItemName.get(parentName);
      const child = { label: sel.itemName, extra: sel.additionalPrice };
      if (parent) {
        parent.children.push(child);
      } else {
        // Defensive: parent line hasn't been seen yet (shouldn't normally
        // happen since combo items are always emitted before their nested
        // modifier picks) — surface as an orphan top-level line instead of
        // silently dropping it.
        roots.push({ label: sel.itemName, extra: sel.additionalPrice, children: [] });
      }
    }
  }
  return roots;
}

// "Beef Burger +3, Fries, Size: Large +2, Coke" — joined summary for cart
// rows and ProductDescription.
export function buildSelectionSummary(selections: LineItemSelection[] | undefined): string {
  if (!selections || selections.length === 0) return '';
  return selections.map(sel => {
    const label = sel.groupName?.includes(' — ')
      ? `${sel.groupName.split(' — ')[1]}: ${sel.itemName}`
      : sel.itemName;
    return sel.additionalPrice > 0 ? `${label} +${sel.additionalPrice}` : label;
  }).join(', ');
}
