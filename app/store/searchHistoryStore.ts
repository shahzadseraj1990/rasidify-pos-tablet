import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Recent product-search terms shown in the Sell screen's search popup.
// Per-device, most recent first, de-duplicated case-insensitively.

const STORAGE_KEY = 'rasidify_search_history';
const MAX_TERMS = 10;

interface SearchHistoryState {
  terms: string[];
  loaded: boolean;
  load: () => Promise<void>;
  add: (term: string) => void;
  remove: (term: string) => void;
  clear: () => void;
}

function persist(terms: string[]) {
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(terms)).catch(() => {});
}

export const useSearchHistoryStore = create<SearchHistoryState>((set, get) => ({
  terms: [],
  loaded: false,

  async load() {
    if (get().loaded) return;
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      set({ terms: Array.isArray(parsed) ? parsed.filter((t: unknown) => typeof t === 'string') : [], loaded: true });
    } catch {
      set({ loaded: true });
    }
  },

  add(term) {
    const t = term.trim();
    if (!t) return;
    const terms = [t, ...get().terms.filter(x => x.toLowerCase() !== t.toLowerCase())].slice(0, MAX_TERMS);
    set({ terms });
    persist(terms);
  },

  remove(term) {
    const terms = get().terms.filter(x => x !== term);
    set({ terms });
    persist(terms);
  },

  clear() {
    set({ terms: [] });
    persist([]);
  },
}));
