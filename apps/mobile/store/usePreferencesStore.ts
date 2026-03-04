// Preferences store — owned by Mobile Agent (state management)
// Zustand store for user preference selections

import { create } from 'zustand';
import type { PreferenceKey } from '@fetch/shared';

interface PreferencesState {
  preferences: PreferenceKey[];
  isLoading: boolean;
  setPreferences: (preferences: PreferenceKey[]) => void;
  togglePreference: (key: PreferenceKey) => void;
  setLoading: (loading: boolean) => void;
}

export const usePreferencesStore = create<PreferencesState>((set, get) => ({
  preferences: [],
  isLoading: false,
  setPreferences: (preferences) => set({ preferences }),
  togglePreference: (key) => {
    const current = get().preferences;
    const next = current.includes(key)
      ? current.filter((k) => k !== key)
      : [...current, key];
    set({ preferences: next });
  },
  setLoading: (isLoading) => set({ isLoading }),
}));
