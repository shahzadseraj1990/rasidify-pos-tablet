import { create } from 'zustand';
import { PosTableLayout, PosTable, POS_TABLE_STATUS } from '../types';
import { tableService } from '../services/tableService';

interface TableState {
  layout: PosTableLayout;
  loading: boolean;
  loadedBranchID: number | null;

  loadLayout: (branchId: number) => Promise<void>;
  patchTableStatus: (tableID: number, statusID: number, invoiceID?: number | null) => void;
  openTable: (tableID: number, invoiceID: number) => Promise<void>;
  releaseTable: (tableID: number) => Promise<void>;
}

const EMPTY_LAYOUT: PosTableLayout = { floors: [], sections: [], tables: [] };

export const useTableStore = create<TableState>((set, get) => ({
  layout: EMPTY_LAYOUT,
  loading: false,
  loadedBranchID: null,

  loadLayout: async (branchId) => {
    set({ loading: true });
    try {
      const layout = await tableService.getLayout(branchId);
      set({ layout, loadedBranchID: branchId });
    } catch {
      // Non-fatal: Tables screen shows empty state, doesn't block the rest of the app.
    } finally {
      set({ loading: false });
    }
  },

  // Optimistic local patch — mirrors web's "cached layout, refreshed on
  // view-activation and after order create/pay/transfer, never polled".
  patchTableStatus: (tableID, statusID, invoiceID) => {
    set(s => ({
      layout: {
        ...s.layout,
        tables: s.layout.tables.map(t =>
          t.tableID === tableID
            ? { ...t, statusID, currentInvoiceID: statusID === POS_TABLE_STATUS.Available ? null : (invoiceID ?? t.currentInvoiceID) }
            : t
        ),
      },
    }));
  },

  openTable: async (tableID, invoiceID) => {
    await tableService.openTable(tableID, invoiceID);
    get().patchTableStatus(tableID, POS_TABLE_STATUS.Occupied, invoiceID);
  },

  releaseTable: async (tableID) => {
    await tableService.releaseTable(tableID);
    get().patchTableStatus(tableID, POS_TABLE_STATUS.Available, null);
  },
}));

export function tablesBySection(layout: PosTableLayout, sectionID: number): PosTable[] {
  return layout.tables
    .filter(t => t.sectionID === sectionID)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export function sectionsByFloor(layout: PosTableLayout, floorID: number) {
  return layout.sections
    .filter(s => s.floorID === floorID)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}
