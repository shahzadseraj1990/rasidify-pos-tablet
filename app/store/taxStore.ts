import { create } from 'zustand';

interface TaxState {
  taxRate:    number;   // decimal e.g. 0.15
  taxName:    string;   // e.g. "VAT"
  taxPercent: number;   // whole number e.g. 15
  taxID:      number;   // DB taxID
  setTax: (percentageRate: number, name: string, taxID?: number) => void;
}

export const useTaxStore = create<TaxState>((set) => ({
  taxRate:    0,
  taxName:    'Tax',
  taxPercent: 0,
  taxID:      0,
  setTax: (percentageRate, name, taxID = 0) => set({
    taxPercent: percentageRate,
    taxRate:    percentageRate / 100,
    taxName:    name,
    taxID,
  }),
}));
