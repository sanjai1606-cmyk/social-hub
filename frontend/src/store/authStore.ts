import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthState {
  token: string | null;
  userId: string | null;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  isAuthenticated: boolean;
  login: (data: {
    access_token: string;
    user_id: string;
    username: string;
    display_name: string;
    avatar_url?: string;
  }) => void;
  logout: () => void;
  updateProfile: (data: { display_name?: string; avatar_url?: string }) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      userId: null,
      username: null,
      displayName: null,
      avatarUrl: null,
      isAuthenticated: false,
      login: (data) =>
        set({
          token: data.access_token,
          userId: data.user_id,
          username: data.username,
          displayName: data.display_name,
          avatarUrl: data.avatar_url || null,
          isAuthenticated: true,
        }),
      logout: () =>
        set({
          token: null,
          userId: null,
          username: null,
          displayName: null,
          avatarUrl: null,
          isAuthenticated: false,
        }),
      updateProfile: (data) =>
        set((state) => ({
          displayName: data.display_name ?? state.displayName,
          avatarUrl: data.avatar_url ?? state.avatarUrl,
        })),
    }),
    {
      name: 'social-auth-storage',
    }
  )
);
