// Auth store — owned by Auth Agent
// Zustand store for authentication state management

import { create } from 'zustand';
import type { User } from '@fetch/shared';
import type { Session } from '@supabase/supabase-js';

interface AuthState {
  // State
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  emailVerified: boolean;
  hasCompletedOnboarding: boolean;

  // Derived getters (computed via selectors)
  // Use: const isAuthenticated = useAuthStore(s => s.session !== null);

  // Actions
  setUser: (user: User | null) => void;
  setSession: (session: Session | null) => void;
  setLoading: (loading: boolean) => void;
  setEmailVerified: (verified: boolean) => void;
  setHasCompletedOnboarding: (completed: boolean) => void;
  reset: () => void;
}

const initialState = {
  user: null,
  session: null,
  isLoading: true,
  emailVerified: false,
  hasCompletedOnboarding: false,
};

export const useAuthStore = create<AuthState>((set) => ({
  ...initialState,

  setUser: (user) => set({ user }),
  setSession: (session) => set({ session }),
  setLoading: (isLoading) => set({ isLoading }),
  setEmailVerified: (emailVerified) => set({ emailVerified }),
  setHasCompletedOnboarding: (hasCompletedOnboarding) => set({ hasCompletedOnboarding }),
  reset: () => set({ ...initialState, isLoading: false }),
}));
