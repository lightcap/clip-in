import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act, fireEvent } from "@testing-library/react";
import PlannerPage from "./page";
import { format, addDays, startOfDay } from "date-fns";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
  usePathname: () => "/planner",
}));

// Mock the auth store
const mockAuthStore = {
  isPelotonConnected: false,
  pelotonTokenStatus: "unknown" as string,
};

vi.mock("@/lib/stores/auth-store", () => ({
  useAuthStore: () => mockAuthStore,
}));

// Mock fetch globally
const originalFetch = global.fetch;

describe("PlannerPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthStore.isPelotonConnected = false;
    mockAuthStore.pelotonTokenStatus = "unknown";
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ workouts: [] }),
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe("when Peloton is not connected", () => {
    it("should show connect prompt", () => {
      render(<PlannerPage />);

      expect(screen.getByText("CONNECT PELOTON TO PLAN WORKOUTS")).toBeInTheDocument();
      expect(screen.getByText(/Link your Peloton account/)).toBeInTheDocument();
    });

    it("should not fetch data when not connected", () => {
      render(<PlannerPage />);

      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe("when Peloton is connected", () => {
    beforeEach(() => {
      mockAuthStore.isPelotonConnected = true;
      mockAuthStore.pelotonTokenStatus = "valid";
    });

    it("should show the planner title", async () => {
      await act(async () => {
        render(<PlannerPage />);
      });

      expect(screen.getByText("WORKOUT PLANNER")).toBeInTheDocument();
    });

    it("should display 3 days by default", async () => {
      await act(async () => {
        render(<PlannerPage />);
      });

      expect(screen.getByText("3 days")).toBeInTheDocument();
    });

    it("should show correct date range starting from today", async () => {
      const today = startOfDay(new Date());
      const endDate = addDays(today, 2);
      const expectedRange = `${format(today, "MMM d")} - ${format(endDate, "MMM d, yyyy")}`;

      await act(async () => {
        render(<PlannerPage />);
      });

      expect(screen.getByText(expectedRange)).toBeInTheDocument();
    });

    it("should have add day button", async () => {
      await act(async () => {
        render(<PlannerPage />);
      });

      // Find the + button for adding days
      const addButtons = screen.getAllByRole("button");
      const addDayButton = addButtons.find(btn => {
        const svg = btn.querySelector('svg');
        return svg && btn.closest('[class*="rounded-lg border"]');
      });
      expect(addDayButton).toBeTruthy();
    });

    it("should have remove day button disabled at minimum (3 days)", async () => {
      await act(async () => {
        render(<PlannerPage />);
      });

      // The remove button should be disabled when at minimum days
      const disabledButtons = screen.getAllByRole("button").filter(btn => btn.hasAttribute("disabled"));
      expect(disabledButtons.length).toBeGreaterThan(0);
    });

    it("should show stats section", async () => {
      await act(async () => {
        render(<PlannerPage />);
      });

      expect(screen.getByText("Total Workouts")).toBeInTheDocument();
      expect(screen.getByText("Completed")).toBeInTheDocument();
      expect(screen.getByText("Total Minutes")).toBeInTheDocument();
    });

    it("should show day cards for each day in range", async () => {
      await act(async () => {
        render(<PlannerPage />);
      });

      // Should have 3 day cards by default
      const emptyDayElements = screen.getAllByText("No workouts planned");
      expect(emptyDayElements.length).toBe(3);
    });

    it("should show Today button", async () => {
      await act(async () => {
        render(<PlannerPage />);
      });

      expect(screen.getByRole("button", { name: "Today" })).toBeInTheDocument();
    });

    it("should fetch workouts when connected", async () => {
      render(<PlannerPage />);

      // Wait for fetch to be called
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled();
      });

      // Verify the fetch URL includes the date range
      const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(fetchCall[0]).toContain("/api/planner/workouts");
    });

    it("should show Push Now button for stack automation", async () => {
      await act(async () => {
        render(<PlannerPage />);
      });

      expect(screen.getByRole("button", { name: "Push Now" })).toBeInTheDocument();
    });

    it("should increment days when add day is clicked", async () => {
      await act(async () => {
        render(<PlannerPage />);
      });

      // Initially shows 3 days
      expect(screen.getByText("3 days")).toBeInTheDocument();

      // Find and click the add day button (the + button inside the days control)
      const daysControl = screen.getByText("3 days").parentElement;
      const addButton = daysControl?.querySelector('button:not([disabled])');

      if (addButton) {
        await act(async () => {
          fireEvent.click(addButton);
        });

        expect(screen.getByText("4 days")).toBeInTheDocument();
      }
    });
  });

  describe("when token is expired", () => {
    beforeEach(() => {
      mockAuthStore.isPelotonConnected = true;
      mockAuthStore.pelotonTokenStatus = "expired";
    });

    it("should show reconnect banner", async () => {
      await act(async () => {
        render(<PlannerPage />);
      });

      expect(screen.getByText("Session Expired")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Reconnect/i })).toBeInTheDocument();
    });
  });
});
