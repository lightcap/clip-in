import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { format, addDays } from "date-fns";
import DashboardPage from "./page";

// Mock router with accessible push function
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
  }),
  usePathname: () => "/home",
}));

// Mock the auth store
const mockAuthStore = {
  profile: null as { display_name?: string; current_ftp?: number } | null,
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
    mockPush.mockClear();
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
      };
    });

    it("should show personalized greeting with user name", async () => {
      render(<DashboardPage />);

      // The greeting should show "Test" (first word of display_name)
      await waitFor(() => {
        expect(screen.getByText(/Test/)).toBeInTheDocument();
      });
    });

    it("should display current FTP from ftp_records", async () => {
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes("/api/ftp/history")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              records: [{ id: "1", workout_date: "2024-01-15", calculated_ftp: 200, baseline_ftp: 190 }],
            }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ workouts: [] }),
        });
      });

      render(<DashboardPage />);

      await waitFor(() => {
        expect(screen.getByText("200")).toBeInTheDocument();
        expect(screen.getByText("Current FTP")).toBeInTheDocument();
      });
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
          ride_image_url: "https://example.com/image.jpg",
          instructor_name: "Matt Wilpers",
          duration_seconds: 1800,
          scheduled_date: new Date().toISOString().split("T")[0],
          scheduled_time: null,
          discipline: "cycling",
          status: "planned",
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

    it("should open workout details dialog when clicking View details", async () => {
      const user = userEvent.setup();
      const mockWorkouts = [
        {
          id: "1",
          ride_title: "45 min Climb Ride",
          ride_image_url: "https://example.com/climb.jpg",
          instructor_name: "Alex Toussaint",
          duration_seconds: 2700,
          scheduled_date: new Date().toISOString().split("T")[0],
          scheduled_time: "08:30:00",
          discipline: "cycling",
          status: "planned",
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

      // Wait for workout to appear
      await waitFor(() => {
        expect(screen.getByText("45 min Climb Ride")).toBeInTheDocument();
      });

      // Find the workout card that contains our title, then find its menu button
      const workoutCard = screen.getByText("45 min Climb Ride").closest('[class*="rounded-xl border"]');
      expect(workoutCard).toBeTruthy();

      // The menu button is the last button inside the card (the one with the MoreVertical icon)
      const buttons = workoutCard!.querySelectorAll('button');
      const menuButton = buttons[buttons.length - 1];
      expect(menuButton).toBeTruthy();
      await user.click(menuButton);

      // Click "View details" menu item
      const viewDetailsItem = await screen.findByRole("menuitem", { name: /View details/i });
      await user.click(viewDetailsItem);

      // Dialog should open with workout details (dialog is rendered in a portal)
      await waitFor(() => {
        expect(screen.getByRole("dialog")).toBeInTheDocument();
      });

      // Check dialog content
      expect(screen.getByRole("dialog")).toHaveTextContent("Alex Toussaint");
      expect(screen.getByRole("dialog")).toHaveTextContent("45 minutes");
    });

    it("should navigate to planner when clicking 'See it in your plan' from context menu", async () => {
      const user = userEvent.setup();
      const scheduledDate = format(addDays(new Date(), 2), "yyyy-MM-dd");
      const mockWorkouts = [
        {
          id: "1",
          ride_title: "20 min Low Impact",
          ride_image_url: null,
          instructor_name: "Hannah Corbin",
          duration_seconds: 1200,
          scheduled_date: scheduledDate,
          scheduled_time: null,
          discipline: "cycling",
          status: "planned",
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
        expect(screen.getByText("20 min Low Impact")).toBeInTheDocument();
      });

      // Find the workout card that contains our title, then find its menu button
      const workoutCard = screen.getByText("20 min Low Impact").closest('[class*="rounded-xl border"]');
      expect(workoutCard).toBeTruthy();

      // The menu button is the last button inside the card (the one with the MoreVertical icon)
      const buttons = workoutCard!.querySelectorAll('button');
      const menuButton = buttons[buttons.length - 1];
      expect(menuButton).toBeTruthy();
      await user.click(menuButton);

      // Click "See it in your plan" menu item
      const seeInPlanItem = await screen.findByRole("menuitem", { name: /See it in your plan/i });
      await user.click(seeInPlanItem);

      // Should navigate to planner with date param
      expect(mockPush).toHaveBeenCalledWith(`/planner?date=${scheduledDate}`);
    });

    it("should group workouts by date with dividers showing Today, Tomorrow, or full date", async () => {
      const today = format(new Date(), "yyyy-MM-dd");
      const tomorrow = format(addDays(new Date(), 1), "yyyy-MM-dd");
      const dayAfterTomorrow = format(addDays(new Date(), 2), "yyyy-MM-dd");

      const mockWorkouts = [
        {
          id: "1",
          ride_title: "Morning Ride",
          ride_image_url: null,
          instructor_name: "Instructor 1",
          duration_seconds: 1800,
          scheduled_date: today,
          scheduled_time: null,
          discipline: "cycling",
          status: "planned",
        },
        {
          id: "2",
          ride_title: "Tomorrow Ride",
          ride_image_url: null,
          instructor_name: "Instructor 2",
          duration_seconds: 1800,
          scheduled_date: tomorrow,
          scheduled_time: null,
          discipline: "cycling",
          status: "planned",
        },
        {
          id: "3",
          ride_title: "Future Ride",
          ride_image_url: null,
          instructor_name: "Instructor 3",
          duration_seconds: 1800,
          scheduled_date: dayAfterTomorrow,
          scheduled_time: null,
          discipline: "cycling",
          status: "planned",
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

      // Wait for workouts to appear and check date dividers
      await waitFor(() => {
        expect(screen.getByText("Today")).toBeInTheDocument();
        expect(screen.getByText("Tomorrow")).toBeInTheDocument();
        // Day after tomorrow should show full date format
        const futureDate = addDays(new Date(), 2);
        const expectedDateText = futureDate.toLocaleDateString("en-US", {
          weekday: "long",
          month: "short",
          day: "numeric",
        });
        expect(screen.getByText(expectedDateText)).toBeInTheDocument();
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
