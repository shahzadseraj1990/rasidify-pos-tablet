import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface FavouriteGroup {
  id: string;
  name: string;
  productIDs: number[];
}

interface PosSettingsState {
  favourites:          FavouriteGroup[];
  categoryDisplayLevel: number;
  showTopSelling:      boolean;
  // Cart row interaction: when on, swipe-left reveals Edit/Remove actions;
  // when off, the row is static — just the +/- buttons and the trailing X.
  swipeToDeleteEnabled: boolean;
  loaded:              boolean;

  load:              () => Promise<void>;
  setCategoryDisplayLevel: (level: number) => Promise<void>;
  setShowTopSelling: (v: boolean) => Promise<void>;
  setSwipeToDeleteEnabled: (v: boolean) => Promise<void>;
  saveFavourites:    (groups: FavouriteGroup[]) => Promise<void>;
  addGroup:          (name: string) => Promise<FavouriteGroup>;
  removeGroup:       (id: string) => Promise<void>;
  toggleProductInGroup: (groupID: string, productID: number) => Promise<void>;
}

const STORAGE_KEY = 'rasidify_pos_settings';

export const usePosSettingsStore = create<PosSettingsState>((set, get) => ({
  favourites:           [],
  categoryDisplayLevel: 2,
  showTopSelling:       true,
  swipeToDeleteEnabled: true,
  loaded:               false,

  async load() {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        set({
          favourites:           parsed.favourites ?? [],
          categoryDisplayLevel: parsed.categoryDisplayLevel ?? 2,
          showTopSelling:       parsed.showTopSelling ?? true,
          swipeToDeleteEnabled: parsed.swipeToDeleteEnabled ?? true,
          loaded: true,
        });
        return;
      }
    } catch {}
    set({ loaded: true });
  },

  async setCategoryDisplayLevel(level) {
    set({ categoryDisplayLevel: level });
    try {
      const current = await AsyncStorage.getItem(STORAGE_KEY);
      const parsed = current ? JSON.parse(current) : {};
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ ...parsed, categoryDisplayLevel: level }));
    } catch {}
  },

  async setShowTopSelling(v) {
    set({ showTopSelling: v });
    try {
      const current = await AsyncStorage.getItem(STORAGE_KEY);
      const parsed = current ? JSON.parse(current) : {};
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ ...parsed, showTopSelling: v }));
    } catch {}
  },

  async setSwipeToDeleteEnabled(v) {
    set({ swipeToDeleteEnabled: v });
    try {
      const current = await AsyncStorage.getItem(STORAGE_KEY);
      const parsed = current ? JSON.parse(current) : {};
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ ...parsed, swipeToDeleteEnabled: v }));
    } catch {}
  },

  async saveFavourites(groups) {
    set({ favourites: groups });
    try {
      const current = await AsyncStorage.getItem(STORAGE_KEY);
      const parsed  = current ? JSON.parse(current) : {};
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ ...parsed, favourites: groups }));
    } catch {}
  },

  async addGroup(name) {
    const group: FavouriteGroup = { id: String(Date.now()), name, productIDs: [] };
    const groups = [...get().favourites, group];
    await get().saveFavourites(groups);
    return group;
  },

  async removeGroup(id) {
    await get().saveFavourites(get().favourites.filter(g => g.id !== id));
  },

  async toggleProductInGroup(groupID, productID) {
    const groups = get().favourites.map(g => {
      if (g.id !== groupID) return g;
      const has = g.productIDs.includes(productID);
      return { ...g, productIDs: has ? g.productIDs.filter(id => id !== productID) : [...g.productIDs, productID] };
    });
    await get().saveFavourites(groups);
  },
}));
