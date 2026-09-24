import api from './api';
import { PosTableLayout } from '../types';

// Mirrors web POS's table.service.ts endpoints exactly (same backend).
export const tableService = {
  async getLayout(branchId: number): Promise<PosTableLayout> {
    const res = await api.get(`/table/layout/${branchId}`);
    const d = res.data?.data ?? res.data ?? {};
    return {
      floors: Array.isArray(d.floors) ? d.floors : [],
      sections: Array.isArray(d.sections) ? d.sections : [],
      tables: Array.isArray(d.tables) ? d.tables : [],
    };
  },

  async openTable(tableId: number, invoiceID: number): Promise<void> {
    await api.post(`/table/${tableId}/open`, { invoiceID });
  },

  async releaseTable(tableId: number): Promise<void> {
    await api.post(`/table/${tableId}/release`, {});
  },

  async transferTable(fromTableId: number, toTableID: number): Promise<void> {
    await api.post(`/table/${fromTableId}/transfer`, { toTableID });
  },

  async setStatus(tableId: number, statusID: number): Promise<void> {
    await api.put(`/table/${tableId}/status`, { statusID });
  },
};
