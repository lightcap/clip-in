import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, act, fireEvent } from "@testing-library/react";
import SearchPage from "./page";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
  usePathname: () => "/search",
}));

// Mock the auth store
const mockAuthStore = {
  isPelotonConnected: false,
};

vi.mock("@/lib/stores/auth-store", () => ({
  useAuthStore: () => mockAuthStore,
}));

// Mock fetch globally
const originalFetch = global.fetch;

describe("SearchPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthStore.isPelotonConnected = false;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ classes: [], total: 0 }),
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe("when Peloton is not connected", () => {
    it("should show connect prompt", () => {
      render(<SearchPage />);

      expect(screen.getByText("CONNECT PELOTON TO SEARCH CLASSES")).toBeInTheDocument();
      expect(screen.getByText(/Link your Peloton account/)).toBeInTheDocument();
    });

    it("should not fetch classes when not connected", () => {
      render(<SearchPage />);

      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe("when Peloton is connected", () => {
    beforeEach(() => {
      mockAuthStore.isPelotonConnected = true;
    });

    it("should render search interface", async () => {
      await act(async () => {
        render(<SearchPage />);
      });

      expect(screen.getByText("CLASS SEARCH")).toBeInTheDocument();
      expect(screen.getByPlaceholderText("Search classes or instructors...")).toBeInTheDocument();
    });

    it("should fetch initial classes on mount", async () => {
      await act(async () => {
        render(<SearchPage />);
      });

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining("/api/peloton/search")
        );
      });
    });

    it("should display classes when fetched", async () => {
      const mockClasses = [
        {
          id: "1",
          title: "30 min Upper Body Strength",
          description: "A great workout",
          duration: 1800,
          difficulty_estimate: 7.5,
          image_url: "https://example.com/image.jpg",
          instructor_name: "Adrian Williams",
          fitness_discipline: "strength",
          fitness_discipline_display_name: "Strength",
        },
      ];

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ classes: mockClasses, total: 1 }),
      });

      await act(async () => {
        render(<SearchPage />);
      });

      await waitFor(() => {
        expect(screen.getByText("30 min Upper Body Strength")).toBeInTheDocument();
      });
    });

    it("should show loading skeletons initially", async () => {
      global.fetch = vi.fn().mockImplementation(() => new Promise(() => {}));

      render(<SearchPage />);

      const skeletons = document.querySelectorAll('[class*="animate-pulse"]');
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it("should show empty state when no classes found", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ classes: [], total: 0 }),
      });

      await act(async () => {
        render(<SearchPage />);
      });

      await waitFor(() => {
        expect(screen.getByText(/No classes found matching your criteria/)).toBeInTheDocument();
      });
    });

    it("should show error banner when API fails", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: "Internal server error" }),
      });

      await act(async () => {
        render(<SearchPage />);
      });

      await waitFor(() => {
        expect(screen.getByText("Search Error")).toBeInTheDocument();
      });
    });

    it("should show token expired error when API returns 401 with tokenExpired", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: "Token expired", tokenExpired: true }),
      });

      await act(async () => {
        render(<SearchPage />);
      });

      await waitFor(() => {
        expect(screen.getByText(/Peloton session has expired/)).toBeInTheDocument();
      });
    });

    it("should handle null difficulty_estimate gracefully", async () => {
      const mockClasses = [
        {
          id: "1",
          title: "Test Class",
          description: "A workout",
          duration: 1200,
          difficulty_estimate: null,
          image_url: "https://example.com/image.jpg",
          instructor_name: "Test Instructor",
          fitness_discipline: "strength",
        },
      ];

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ classes: mockClasses, total: 1 }),
      });

      await act(async () => {
        render(<SearchPage />);
      });

      await waitFor(() => {
        expect(screen.getByText("N/A")).toBeInTheDocument();
      });
    });

    it("should call search API when search button is clicked", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ classes: [], total: 0 }),
      });

      await act(async () => {
        render(<SearchPage />);
      });

      // Wait for initial fetch
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled();
      });

      // Clear previous calls
      vi.mocked(global.fetch).mockClear();

      // Click search button to trigger another search
      const searchButton = screen.getByRole("button", { name: /search/i });
      await act(async () => {
        fireEvent.click(searchButton);
      });

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining("/api/peloton/search")
        );
      });
    });
  });
});
