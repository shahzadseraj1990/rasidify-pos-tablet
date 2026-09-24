import api from './api';
import { PosShift, PosShiftSummary, PaymentBreakdown, OrderType } from '../types';

export const shiftService = {
  async getActive(): Promise<PosShift | null> {
    const res = await api.get('/pos/shift/active');
    return res.data?.data ?? null;
  },

  async start(dto: { branchID?: number | null; openingCash: number; openingNotes?: string }): Promise<number> {
    const payload: any = {
      openingCash:  parseFloat(String(dto.openingCash)) || 0,
      openingNotes: dto.openingNotes ?? '',
    };
    if (dto.branchID != null) payload.branchID = dto.branchID;

    const res = await api.post('/pos/shift/start', payload);
    const d = res.data;
    console.log('[START SHIFT] Response:', JSON.stringify(d));

    const failed = d?.status === 0 || d?.status === false || d?.success === false;
    if (failed) throw new Error(d?.message ?? d?.Message ?? 'Failed to start shift');
    return d?.shiftID ?? d?.data?.shiftID ?? d?.id ?? 0;
  },

  async end(id: number, dto: { closingCash: number | string; closingNotes?: string; zReportData?: string }): Promise<void> {
    const payload = {
      closingCash:  parseFloat(String(dto.closingCash)) || 0,
      closingNotes: dto.closingNotes ?? '',
      zReportData:  dto.zReportData ?? '',
    };
    const res = await api.post(`/pos/shift/${id}/end`, payload);
    // Treat explicit status:0 as failure, anything else (including void 200) as success
    if (res?.data?.status === 0 || res?.data?.success === false) {
      throw new Error(res.data?.message ?? res.data?.Message ?? 'Failed to end shift');
    }
  },

  async getSummary(id: number): Promise<{
    summary: PosShiftSummary;
    payments: PaymentBreakdown[];
    entries: any[];
    orderTypes: any[];
  }> {
    const res = await api.get(`/pos/shift/${id}/summary`);
    return res.data?.data;
  },

  async addCashEntry(id: number, dto: { entryType: number; amount: number; notes?: string }): Promise<void> {
    await api.post(`/pos/shift/${id}/cash-entry`, dto);
  },
};
