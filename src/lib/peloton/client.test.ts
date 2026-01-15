import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  PelotonClient,
  PelotonAuthError,
  PelotonApiError,
} from "./client";
import { server } from "@/test/setup";

// Disable MSW for these tests since we're mocking fetch directly
const mockFetch = vi.fn();
const originalFetch = global.fetch;

describe("PelotonClient", () => {
  let client: PelotonClient;

  beforeEach(() => {
    server.close(); // Disable MSW
    global.fetch = mockFetch;
    vi.clearAllMocks();
    client = new PelotonClient("test-access-token");
  });

  afterEach(() => {
    global.fetch = originalFetch;
    server.listen({ onUnhandledRequest: "bypass" }); // Re-enable MSW
  });

  describe("constructor", () => {
    it("should create client with access token", () => {
      expect(client).toBeInstanceOf(PelotonClient);
    });
  });

  describe("getMe", () => {
    it("should fetch user profile", async () => {
      const mockUser = {
        id: "user-123",
        username: "testuser",
        email: "test@example.com",
        name: "Test User",
        cycling_ftp: 200,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockUser),
      });

      const result = await client.getMe();

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.onepeloton.com/api/me",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer test-access-token",
          }),
        })
      );
      expect(result).toEqual(mockUser);
    });

    it("should throw PelotonAuthError on 401", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
      });

      await expect(client.getMe()).rejects.toThrow(PelotonAuthError);
    });

    it("should throw PelotonApiError on other errors", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      });

      await expect(client.getMe()).rejects.toThrow(PelotonApiError);
    });
  });

  describe("getWorkout", () => {
    it("should fetch workout by id", async () => {
      const mockWorkout = {
        id: "workout-123",
        created_at: 1704067200,
        status: "complete",
        fitness_discipline: "cycling",
        ftp_info: {
          ftp: 200,
          ftp_source: "ftp_test",
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockWorkout),
      });

      const result = await client.getWorkout("workout-123");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.onepeloton.com/api/workout/workout-123",
        expect.any(Object)
      );
      expect(result).toEqual(mockWorkout);
    });
  });

  describe("getWorkoutPerformanceGraph", () => {
    it("should fetch performance graph", async () => {
      const mockPerf = {
        duration: 1200,
        average_summaries: [
          { display_name: "Avg Output", slug: "avg_output", value: 180 },
        ],
        summaries: [],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockPerf),
      });

      const result = await client.getWorkoutPerformanceGraph("workout-123");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.onepeloton.com/api/workout/workout-123/performance_graph",
        expect.any(Object)
      );
      expect(result).toEqual(mockPerf);
    });
  });

  describe("getUserWorkouts", () => {
    it("should fetch user workouts with pagination", async () => {
      const mockResponse = {
        data: [{ id: "workout-1" }, { id: "workout-2" }],
        page: 0,
        page_count: 5,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await client.getUserWorkouts("user-123", {
        limit: 10,
        page: 0,
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/user/user-123/workouts"),
        expect.any(Object)
      );
      expect(result.data).toHaveLength(2);
    });
  });

  describe("searchRides", () => {
    it("should search rides with filters", async () => {
      const mockResponse = {
        data: [{ id: "ride-1", title: "20 min Strength" }],
        page: 0,
        page_count: 1,
        total: 1,
        limit: 20,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await client.searchRides({
        fitness_discipline: "strength",
        duration: [1200],
        limit: 20,
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("fitness_discipline=strength"),
        expect.any(Object)
      );
      expect(result.data).toHaveLength(1);
    });
  });

  describe("getFtpHistory", () => {
    it("should fetch FTP history following workout chain", async () => {
      // First workout
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: "workout-1",
            created_at: 1704067200,
            ftp_info: {
              ftp: 200,
              ftp_source: "ftp_test",
              ftp_workout_id: "workout-2",
            },
            ride: { title: "FTP Test" },
          }),
      });

      // Performance graph for first workout
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            average_summaries: [{ slug: "avg_output", value: 210 }],
          }),
      });

      // Second workout
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: "workout-2",
            created_at: 1703462400,
            ftp_info: {
              ftp: 195,
              ftp_source: "ftp_test",
              ftp_workout_id: null,
            },
            ride: { title: "FTP Test 2" },
          }),
      });

      // Performance graph for second workout
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            average_summaries: [{ slug: "avg_output", value: 205 }],
          }),
      });

      const result = await client.getFtpHistory("workout-1");

      expect(result).toHaveLength(2);
      expect(result[0].calculatedFtp).toBe(200); // 210 * 0.95 = 199.5 rounded
      expect(result[1].calculatedFtp).toBe(195); // 205 * 0.95 = 194.75 rounded
    });

    it("should return empty array if startWorkoutId is null", async () => {
      const result = await client.getFtpHistory(null);
      expect(result).toEqual([]);
    });
  });

  describe("Stack Management", () => {
    describe("getStack", () => {
      it("should fetch user stack", async () => {
        const mockUser = { id: "user-123" };
        const mockStack = {
          id: "stack-1",
          classes: [],
          total_classes: 0,
        };

        mockFetch
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(mockUser),
          })
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(mockStack),
          });

        const result = await client.getStack();

        expect(result).toEqual(mockStack);
      });

      it("should return null on error", async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 404,
          statusText: "Not Found",
        });

        const result = await client.getStack();
        expect(result).toBeNull();
      });
    });

    describe("addToStack", () => {
      it("should add ride to stack", async () => {
        const mockUser = { id: "user-123" };

        mockFetch
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(mockUser),
          })
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({ success: true }),
          });

        const result = await client.addToStack("ride-123");
        expect(result).toBe(true);
      });

      it("should return false on error", async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: "Error",
        });

        const result = await client.addToStack("ride-123");
        expect(result).toBe(false);
      });
    });

    describe("pushWorkoutsToStack", () => {
      it("should push multiple workouts and return results", async () => {
        const mockUser = { id: "user-123" };

        // Mock successful push for first ride
        mockFetch
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(mockUser),
          })
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve({ success: true }),
          })
          // Mock failed push for second ride
          .mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(mockUser),
          })
          .mockResolvedValueOnce({
            ok: false,
            status: 500,
            statusText: "Error",
          });

        const result = await client.pushWorkoutsToStack(["ride-1", "ride-2"]);

        expect(result.success).toContain("ride-1");
        expect(result.failed).toContain("ride-2");
      });
    });
  });
});

describe("PelotonAuthError", () => {
  it("should be an instance of Error", () => {
    const error = new PelotonAuthError("Token expired");
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("PelotonAuthError");
    expect(error.message).toBe("Token expired");
  });
});

describe("PelotonApiError", () => {
  it("should include status code", () => {
    const error = new PelotonApiError("Server error", 500);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("PelotonApiError");
    expect(error.status).toBe(500);
  });
});
