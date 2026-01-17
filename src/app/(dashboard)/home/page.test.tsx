import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import DashboardPage from "./page";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
  usePathname: () => "/home",
}));

// Mock the auth store
const mockAuthStore = {
  profile: null as { display_name?: string; current_ftp?: number; estimated_ftp?: number } | null,
  isPelotonConnected: false,
  pelotonTokenStatus: "unknown" as string,
};

vi.mock("@/lib/stores/auth-store", () => ({
  useAuthStore: () => mockAuthStore,
}));

// Mock fetch globally
const originalFetch = global.fetch;

describe("DashboardPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthStore.profile = null;
    mockAuthStore.isPelotonConnected = false;
    mockAuthStore.pelotonTokenStatus = "unknown";
    // Reset fetch to a simple mock
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ workouts: [], records: [] }),
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe("when Peloton is not connected", () => {
    it("should show connect prompt", () => {
      render(<DashboardPage />);

      expect(screen.getByText("CONNECT YOUR PELOTON")).toBeInTheDocument();
      expect(screen.getByText(/Link your Peloton account/)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Connect Peloton/i })).toBeInTheDocument();
    });

    it("should not fetch data when not connected", () => {
      render(<DashboardPage />);

      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe("when Peloton is connected", () => {
    beforeEach(() => {
      mockAuthStore.isPelotonConnected = true;
      mockAuthStore.profile = {
        display_name: "Test User",
        current_ftp: 200,
        estimated_ftp: 210,
      };
    });

    it("should show personalized greeting with user name", async () => {
      render(<DashboardPage />);

      // The greeting should show "Test" (first word of display_name)
      await waitFor(() => {
        expect(screen.getByText(/Test/)).toBeInTheDocument();
      });
    });

    it("should display current FTP from profile", () => {
      render(<DashboardPage />);

      expect(screen.getByText("200")).toBeInTheDocument();
      expect(screen.getByText("Current FTP")).toBeInTheDocument();
    });

    it("should display estimated FTP from profile", () => {
      render(<DashboardPage />);

      expect(screen.getByText("210")).toBeInTheDocument();
      expect(screen.getByText("Estimated FTP")).toBeInTheDocument();
    });

    it("should show loading skeletons initially", async () => {
      // Use a fetch that never resolves to keep loading state
      global.fetch = vi.fn().mockImplementation(() => new Promise(() => {}));

      render(<DashboardPage />);

      // Should show skeleton loaders
      const skeletons = document.querySelectorAll('[class*="animate-pulse"]');
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it("should display upcoming workouts when fetched", async () => {
      const mockWorkouts = [
        {
          id: "1",
          ride_title: "30 min Power Zone",
          instructor_name: "Matt Wilpers",
          scheduled_date: new Date().toISOString().split("T")[0],
          discipline: "cycling",
        },
      ];

      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes("/api/planner/workouts")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ workouts: mockWorkouts }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ records: [] }),
        });
      });

      await act(async () => {
        render(<DashboardPage />);
      });

      await waitFor(() => {
        expect(screen.getByText("30 min Power Zone")).toBeInTheDocument();
      });
    });

    it("should show empty state when no upcoming workouts", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ workouts: [], records: [] }),
      });

      await act(async () => {
        render(<DashboardPage />);
      });

      await waitFor(() => {
        expect(
          screen.getByText(/No upcoming workouts planned/)
        ).toBeInTheDocument();
      });
    });

    it("should display FTP history when fetched", async () => {
      const mockFtpRecords = [
        {
          id: "1",
          workout_date: "2026-01-15T00:00:00Z",
          calculated_ftp: 200,
          baseline_ftp: 195,
        },
        {
          id: "2",
          workout_date: "2025-12-15T00:00:00Z",
          calculated_ftp: 195,
          baseline_ftp: 190,
        },
      ];

      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url === "/api/ftp/history") {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ records: mockFtpRecords }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ workouts: [] }),
        });
      });

      await act(async () => {
        render(<DashboardPage />);
      });

      await waitFor(() => {
        expect(screen.getByText("200w")).toBeInTheDocument();
        expect(screen.getByText("195w")).toBeInTheDocument();
      });
    });

    it("should show empty state when no FTP history", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ workouts: [], records: [] }),
      });

      await act(async () => {
        render(<DashboardPage />);
      });

      await waitFor(() => {
        expect(screen.getByText(/No FTP tests recorded/)).toBeInTheDocument();
      });
    });
  });

  describe("when token is expired", () => {
    beforeEach(() => {
      mockAuthStore.isPelotonConnected = true;
      mockAuthStore.pelotonTokenStatus = "expired";
      mockAuthStore.profile = {
        display_name: "Test User",
        current_ftp: 200,
      };
    });

    it("should show reconnect banner", () => {
      render(<DashboardPage />);

      expect(screen.getByText("Session Expired")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Reconnect/i })).toBeInTheDocument();
    });
  });
});
