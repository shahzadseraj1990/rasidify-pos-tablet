// Dev-only helper to skip real device/PIN auth and shift-start so the rest of
// the app (cashier screen, cart, checkout) can be exercised without a live
// backend. Never referenced outside __DEV__ guards.
import { useAuthStore } from '../store/authStore';
import { useShiftStore } from '../store/shiftStore';
import { useTaxStore } from '../store/taxStore';
import { Product, Category } from '../types';

export function applyDevBypass() {
  useAuthStore.getState().setDeviceAuthenticated(true);
  useAuthStore.getState().setUser({
    userID: 1,
    subUserID: 1,
    name: 'Dev Cashier',
    email: 'dev@rasidify.test',
    roleID: 1,
    branchID: 1,
    currency: 'SAR',
    currencyID: 1,
    rights: [],
  });
  useShiftStore.getState().setShift({
    shiftID: 999,
    subUserID: 1,
    branchID: 1,
    branchName: 'Dev Branch',
    cashierName: 'Dev Cashier',
    openingCash: 500,
    totalSales: 0,
    totalDiscount: 0,
    totalTax: 0,
    totalRefunds: 0,
    totalPaidIn: 0,
    totalPaidOut: 0,
    orderCount: 0,
    startedAt: new Date().toISOString(),
    statusID: 1,
  });
  useTaxStore.getState().setTax(15, 'VAT', 1);
}

export const DEV_MOCK_CATEGORIES: Category[] = [
  { categoryID: 1, name: 'Burgers', parentID: null, sortOrder: 1 },
  { categoryID: 2, name: 'Platter', parentID: null, sortOrder: 2 },
  { categoryID: 3, name: 'Chicken', parentID: null, sortOrder: 3 },
  { categoryID: 4, name: 'Tea', parentID: null, sortOrder: 4 },
];

export const DEV_MOCK_PRODUCTS: Product[] = [
  { productID: 1, name: 'BBQ Rice Platter', price: 45, categoryID: 2, taxRate: 0.15 },
  { productID: 2, name: 'Signature Burger', price: 21, categoryID: 1, taxRate: 0.15 },
  { productID: 3, name: 'Chicken Shashlik', price: 25, categoryID: 3, taxRate: 0.15 },
  { productID: 4, name: 'Chicken Steak', price: 35, categoryID: 3, taxRate: 0.15 },
  { productID: 5, name: 'Pizza Burger', price: 35, categoryID: 1, taxRate: 0.15 },
  { productID: 6, name: 'Matka Chai', price: 5, categoryID: 4, taxRate: 0.15 },
  { productID: 7, name: 'Chicken Karahi', price: 45, categoryID: 3, taxRate: 0.15 },
];
