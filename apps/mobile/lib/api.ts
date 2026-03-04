// API client — owned by Auth Agent (interceptors) + Backend Agent (endpoints)
// Axios instance with JWT auth and 401 handling

import axios from 'axios';
import { supabase } from './supabase';
import { useAuthStore } from '../store/useAuthStore';
import { router } from 'expo-router';

const api = axios.create({
  baseURL: process.env.EXPO_PUBLIC_API_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor: attach Supabase JWT from the current session
api.interceptors.request.use(async (config) => {
  const { data } = await supabase.auth.getSession();
  if (data.session?.access_token) {
    config.headers.Authorization = `Bearer ${data.session.access_token}`;
  }
  return config;
});

// Response interceptor: handle 401 Unauthorized responses
api.interceptors.response.use(
  // Success: pass through
  (response) => response,
  // Error: check for 401
  async (error) => {
    if (error.response?.status === 401) {
      // Try refreshing the session first
      const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();

      if (refreshError || !refreshData.session) {
        // Refresh failed — session is expired, sign out and redirect to login
        await supabase.auth.signOut();
        useAuthStore.getState().reset();
        router.replace('/(auth)/login');
      } else {
        // Refresh succeeded — retry the original request with new token
        const originalRequest = error.config;
        if (originalRequest && !originalRequest._retry) {
          originalRequest._retry = true;
          originalRequest.headers.Authorization = `Bearer ${refreshData.session.access_token}`;
          return api(originalRequest);
        }
      }
    }
    return Promise.reject(error);
  }
);

export default api;
