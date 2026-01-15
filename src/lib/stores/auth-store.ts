import { create } from "zustand";
import type { User } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];

type PelotonTokenStatus = "unknown" | "valid" | "expired" | "disconnected";

interface AuthState {
  user: User | null;
  profile: Profile | null;
  isLoading: boolean;
  isPelotonConnected: boolean;
  pelotonTokenStatus: PelotonTokenStatus;
  tokenExpiresAt: string | null;
  setUser: (user: User | null) => void;
  setProfile: (profile: Profile | null) => void;
  setIsLoading: (isLoading: boolean) => void;
  setIsPelotonConnected: (connected: boolean) => void;
  setPelotonTokenStatus: (status: PelotonTokenStatus, expiresAt?: string | null) => void;
  reset: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  profile: null,
  isLoading: true,
  isPelotonConnected: false,
  pelotonTokenStatus: "unknown",
  tokenExpiresAt: null,
  setUser: (user) => set({ user }),
  setProfile: (profile) =>
    set({
      profile,
      isPelotonConnected: !!profile?.peloton_user_id,
    }),
  setIsLoading: (isLoading) => set({ isLoading }),
  setIsPelotonConnected: (connected) => set({ isPelotonConnected: connected }),
  setPelotonTokenStatus: (status, expiresAt = null) =>
    set({ pelotonTokenStatus: status, tokenExpiresAt: expiresAt }),
  reset: () =>
    set({
      user: null,
      profile: null,
      isLoading: false,
      isPelotonConnected: false,
      pelotonTokenStatus: "unknown",
      tokenExpiresAt: null,
    }),
}));
