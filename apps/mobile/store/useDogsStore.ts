// Dogs store — owned by Mobile Agent (state management)
// Zustand store for dog data, swipe deck state, liked dogs, and match celebration

import { create } from 'zustand';
import type { Dog } from '@fetch/shared';
import api from '../lib/api';

interface DogsState {
  dogs: Dog[];
  likedDogs: Dog[];
  currentIndex: number;
  isLoading: boolean;
  showMatchCelebration: boolean;
  matchedDog: Dog | null;
  setDogs: (dogs: Dog[]) => void;
  setLikedDogs: (dogs: Dog[]) => void;
  setCurrentIndex: (index: number) => void;
  setLoading: (loading: boolean) => void;
  addLikedDog: (dog: Dog) => void;
  removeLikedDog: (dogId: string) => void;
  triggerMatch: (dog: Dog) => void;
  dismissMatch: () => void;
  fetchLikedDogs: () => Promise<void>;
}

export const useDogsStore = create<DogsState>((set, get) => ({
  dogs: [],
  likedDogs: [],
  currentIndex: 0,
  isLoading: false,
  showMatchCelebration: false,
  matchedDog: null,
  setDogs: (dogs) => set({ dogs }),
  setLikedDogs: (likedDogs) => set({ likedDogs }),
  setCurrentIndex: (currentIndex) => set({ currentIndex }),
  setLoading: (isLoading) => set({ isLoading }),
  addLikedDog: (dog) => set((state) => ({ likedDogs: [...state.likedDogs, dog] })),
  removeLikedDog: (dogId) =>
    set((state) => ({ likedDogs: state.likedDogs.filter((d) => d.id !== dogId) })),
  triggerMatch: (dog) => set({ showMatchCelebration: true, matchedDog: dog }),
  dismissMatch: () => set({ showMatchCelebration: false, matchedDog: null }),
  fetchLikedDogs: async () => {
    try {
      set({ isLoading: true });
      const { data: response } = await api.get('/swipes/liked');
      // Backend returns { data: Dog[], error: null }
      const raw = response?.data;
      const list = Array.isArray(raw) ? raw : [];
      const items = list.map((dog: Dog) => ({
        ...dog,
        name: dog.name.replace(/^\*+/, '').trim(),
        photos: typeof dog.photos === 'string' ? JSON.parse(dog.photos) : dog.photos,
      }));
      // Merge: keep locally-added dogs that haven't been saved to backend yet
      const backendIds = new Set(items.map((d) => d.id));
      const localOnly = get().likedDogs.filter((d) => !backendIds.has(d.id));
      set({ likedDogs: [...items, ...localOnly] });
    } catch (err) {
      console.error('[DOGS] Failed to fetch liked dogs:', err);
    } finally {
      set({ isLoading: false });
    }
  },
}));
