import { describe, it, expect, beforeEach } from "vitest";
import { useAuthStore } from "./auth-store";
import type { User } from "@supabase/supabase-js";

// Mock profile type for testing
const mockProfile = {
  id: "user-123",
  display_name: "Test User",
  avatar_url: null,
  peloton_user_id: null,
  peloton_username: null,
  current_ftp: null,
  estimated_ftp: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const mockUser: User = {
  id: "user-123",
  email: "test@example.com",
  aud: "authenticated",
  created_at: "2026-01-01T00:00:00Z",
  app_metadata: {},
  user_metadata: {},
};

describe("useAuthStore", () => {
  beforeEach(() => {
    // Reset store to initial state before each test
    useAuthStore.getState().reset();
  });

  describe("initial state", () => {
    it("should have null user and profile", () => {
      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(state.profile).toBeNull();
    });

    it("should have isPelotonConnected as false", () => {
      const state = useAuthStore.getState();
      expect(state.isPelotonConnected).toBe(false);
    });

    it("should have isLoading as false after reset", () => {
      const state = useAuthStore.getState();
      expect(state.isLoading).toBe(false);
    });
  });

  describe("setUser", () => {
    it("should set the user", () => {
      useAuthStore.getState().setUser(mockUser);
      expect(useAuthStore.getState().user).toEqual(mockUser);
    });

    it("should set user to null", () => {
      useAuthStore.getState().setUser(mockUser);
      useAuthStore.getState().setUser(null);
      expect(useAuthStore.getState().user).toBeNull();
    });
  });

  describe("setProfile", () => {
    it("should set the profile", () => {
      useAuthStore.getState().setProfile(mockProfile);
      expect(useAuthStore.getState().profile).toEqual(mockProfile);
    });

    it("should set isPelotonConnected to false when peloton_user_id is null", () => {
      useAuthStore.getState().setProfile(mockProfile);
      expect(useAuthStore.getState().isPelotonConnected).toBe(false);
    });

    it("should set isPelotonConnected to true when peloton_user_id exists", () => {
      const profileWithPeloton = {
        ...mockProfile,
        peloton_user_id: "peloton-123",
        peloton_username: "testuser",
      };
      useAuthStore.getState().setProfile(profileWithPeloton);
      expect(useAuthStore.getState().isPelotonConnected).toBe(true);
    });

    it("should set profile to null", () => {
      useAuthStore.getState().setProfile(mockProfile);
      useAuthStore.getState().setProfile(null);
      expect(useAuthStore.getState().profile).toBeNull();
    });
  });

  describe("setIsLoading", () => {
    it("should set isLoading state", () => {
      useAuthStore.getState().setIsLoading(true);
      expect(useAuthStore.getState().isLoading).toBe(true);

      useAuthStore.getState().setIsLoading(false);
      expect(useAuthStore.getState().isLoading).toBe(false);
    });
  });

  describe("setIsPelotonConnected", () => {
    it("should set isPelotonConnected directly", () => {
      useAuthStore.getState().setIsPelotonConnected(true);
      expect(useAuthStore.getState().isPelotonConnected).toBe(true);

      useAuthStore.getState().setIsPelotonConnected(false);
      expect(useAuthStore.getState().isPelotonConnected).toBe(false);
    });
  });

  describe("reset", () => {
    it("should reset all state to initial values", () => {
      // Set some values first
      useAuthStore.getState().setUser(mockUser);
      useAuthStore.getState().setProfile({
        ...mockProfile,
        peloton_user_id: "peloton-123",
      });
      useAuthStore.getState().setIsLoading(true);

      // Reset
      useAuthStore.getState().reset();

      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(state.profile).toBeNull();
      expect(state.isLoading).toBe(false);
      expect(state.isPelotonConnected).toBe(false);
    });
  });
});
