"use client";

import { useEffect, useCallback } from "react";
import { useAuthStore } from "@/lib/stores/auth-store";
import type { Database } from "@/types/database";
import type { User } from "@supabase/supabase-js";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];

interface AuthProviderProps {
  children: React.ReactNode;
  initialUser: User;
  initialProfile: Profile | null;
}

export function AuthProvider({ children, initialUser, initialProfile }: AuthProviderProps) {
  const { setUser, setProfile, setIsLoading, setPelotonTokenStatus } = useAuthStore();

  const checkPelotonStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/peloton/status");
      const data = await response.json();
      console.log("[AuthProvider] Peloton status response:", data);

      if (data.tokenValid) {
        setPelotonTokenStatus("valid", data.expiresAt);
      } else if (data.connected && !data.tokenValid) {
        // Has linked before but token expired
        setPelotonTokenStatus("expired");
      } else {
        setPelotonTokenStatus("disconnected");
      }
    } catch (error) {
      console.error("Error checking Peloton status:", error);
      setPelotonTokenStatus("unknown");
    }
  }, [setPelotonTokenStatus]);

  // Initialize auth store with server-provided values (no client-side fetching)
  useEffect(() => {
    setUser(initialUser);
    setProfile(initialProfile);
    setIsLoading(false);

    // Check Peloton token status if connected
    if (initialProfile?.peloton_user_id) {
      checkPelotonStatus();
    } else {
      setPelotonTokenStatus("disconnected");
    }
  }, [initialUser, initialProfile, setUser, setProfile, setIsLoading, setPelotonTokenStatus, checkPelotonStatus]);

  return <>{children}</>;
}
