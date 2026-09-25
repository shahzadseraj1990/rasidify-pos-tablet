import { CartItem, Customer, LineItemSelection } from '../types';
import { buildSelectionSummary } from './selectionTree';

// The saved order's customer, for resuming it. Without this the resumed cart
// falls back to Walk-in, and saving it back (PUT) would overwrite the real
// customer. Walk-in orders (placeholder walkin_* email) resume as Walk-in.
export function customerFromInvoice(inv: any): Customer | null {
  const c = inv?.customer ?? inv?.Customer;
  const id = Number(c?.customerInfoID ?? c?.CustomerInfoID ?? 0);
  const email: string = c?.email ?? c?.Email ?? '';
  if (!id || /^walkin_/i.test(email)) return null;
  return {
    customerID:   id,
    name:         c?.name ?? c?.Name ?? '',
    businessName: c?.businessName ?? c?.BusinessName ?? c?.name ?? '',
    phone:        c?.contact ?? c?.Contact ?? '',
    email,
  };
}

// Rebuilds cart lines from a saved order's line_items (GET /pos/order/{id}),
// for resuming a held order from Orders or Tables. The order is then saved back
// in place (PUT /pos/order/{id}), so every field the invoice needs must survive
// the round trip: product name, unit price (already includes modifier/combo
// upcharges), and the structured selections.
export function cartItemsFromInvoiceLines(lines: any[]): Omit<CartItem, 'lineID' | 'total'>[] {
  return (lines ?? []).map(li => {
    const lineSelections: LineItemSelection[] = (li.selections ?? li.Selections ?? []).map((s: any) => ({
      selectionType:   s.selectionType ?? s.SelectionType,
      groupID:         s.groupID ?? s.GroupID ?? null,
      groupName:       s.groupName ?? s.GroupName ?? undefined,
      itemID:          s.itemID ?? s.ItemID ?? null,
      itemName:        s.itemName ?? s.ItemName ?? '',
      additionalPrice: Number(s.additionalPrice ?? s.AdditionalPrice ?? 0),
    }));
    const description: string = li.productDescription ?? li.ProductDescription ?? '';
    return {
      productID:        li.productID ?? li.ProductID ?? 0,
      name:             li.productName ?? li.ProductName ?? li.name ?? '',
      sku:              li.sku ?? li.SKU ?? '',
      type:             li.productType ?? li.ProductType ?? undefined,
      price:            Number(li.price ?? li.Price ?? li.unitPrice ?? 0),
      qty:              Number(li.qty ?? li.Qty ?? li.quantity ?? 1),
      discount:         Number(li.discount ?? li.Discount ?? 0),
      taxRate:          li.taxRate ?? 0,
      selectionSummary: description || (lineSelections.length > 0 ? buildSelectionSummary(lineSelections) : undefined),
      lineSelections:   lineSelections.length > 0 ? lineSelections : undefined,
    };
  });
}
