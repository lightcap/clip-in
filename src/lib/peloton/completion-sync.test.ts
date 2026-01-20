import { describe, it, expect, vi, beforeEach } from "vitest";
import { syncCompletedWorkouts } from "./completion-sync";
import { PelotonClient } from "./client";

// Mock the Peloton client
vi.mock("./client", () => ({
  PelotonClient: vi.fn(),
}));

// Helper to create a properly chained Supabase mock
function createSupabaseMock(
  plannedWorkouts: {
    id: string;
    peloton_ride_id: string;
    scheduled_date: string;
    sort_order: number;
    peloton_workout_id: string | null;
  }[] | null,
  fetchError?: { message: string } | null
) {
  const updateEqMock = vi.fn().mockResolvedValue({ error: null });
  const updateMock = vi.fn().mockReturnValue({ eq: updateEqMock });

  const isMock = vi.fn().mockResolvedValue({
    data: plannedWorkouts,
    error: fetchError || null,
  });

  const eqMock = vi.fn().mockImplementation(() => ({
    eq: eqMock,
    is: isMock,
  }));

  const selectMock = vi.fn().mockReturnValue({
    eq: eqMock,
  });

  const fromMock = vi.fn().mockImplementation(() => ({
    select: selectMock,
    update: updateMock,
  }));

  return {
    from: fromMock,
    _updateMock: updateMock,
    _updateEqMock: updateEqMock,
  };
}

describe("syncCompletedWorkouts", () => {
  let mockPelotonClient: {
    getUserWorkouts: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mockPelotonClient = {
      getUserWorkouts: vi.fn(),
    };
  });

  it("should return early if no completed workouts from Peloton", async () => {
    mockPelotonClient.getUserWorkouts.mockResolvedValue({
      data: [],
    });

    const mockSupabase = createSupabaseMock([]);

    const result = await syncCompletedWorkouts(
      "user-123",
      "peloton-user-123",
      mockPelotonClient as unknown as PelotonClient,
      mockSupabase as never
    );

    expect(result.success).toBe(true);
    expect(result.matched).toBe(0);
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  it("should return early if no planned workouts to match", async () => {
    mockPelotonClient.getUserWorkouts.mockResolvedValue({
      data: [
        {
          id: "peloton-workout-1",
          created_at: 1705708800, // 2024-01-20 00:00:00 UTC
          status: "COMPLETE",
          ride: { id: "ride-123" },
        },
      ],
    });

    const mockSupabase = createSupabaseMock([]);

    const result = await syncCompletedWorkouts(
      "user-123",
      "peloton-user-123",
      mockPelotonClient as unknown as PelotonClient,
      mockSupabase as never
    );

    expect(result.success).toBe(true);
    expect(result.matched).toBe(0);
  });

  it("should match completed workout to planned workout by ride_id and date", async () => {
    // Peloton completed workout on 2024-01-20
    mockPelotonClient.getUserWorkouts.mockResolvedValue({
      data: [
        {
          id: "peloton-workout-1",
          created_at: 1705708800, // 2024-01-20 00:00:00 UTC
          status: "COMPLETE",
          ride: { id: "ride-123" },
        },
      ],
    });

    // Planned workout for same ride on same date
    const mockSupabase = createSupabaseMock([
      {
        id: "planned-workout-1",
        peloton_ride_id: "ride-123",
        scheduled_date: "2024-01-20",
        sort_order: 0,
        peloton_workout_id: null,
      },
    ]);

    const result = await syncCompletedWorkouts(
      "user-123",
      "peloton-user-123",
      mockPelotonClient as unknown as PelotonClient,
      mockSupabase as never,
      { timezone: "UTC" }
    );

    expect(result.success).toBe(true);
    expect(result.matched).toBe(1);
    expect(mockSupabase._updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "completed",
        peloton_workout_id: "peloton-workout-1",
      })
    );
  });

  it("should not match if dates differ", async () => {
    // Peloton completed workout on 2024-01-20
    mockPelotonClient.getUserWorkouts.mockResolvedValue({
      data: [
        {
          id: "peloton-workout-1",
          created_at: 1705708800, // 2024-01-20 00:00:00 UTC
          status: "COMPLETE",
          ride: { id: "ride-123" },
        },
      ],
    });

    // Planned workout for same ride but different date (2024-01-19)
    const mockSupabase = createSupabaseMock([
      {
        id: "planned-workout-1",
        peloton_ride_id: "ride-123",
        scheduled_date: "2024-01-19", // Different date
        sort_order: 0,
        peloton_workout_id: null,
      },
    ]);

    const result = await syncCompletedWorkouts(
      "user-123",
      "peloton-user-123",
      mockPelotonClient as unknown as PelotonClient,
      mockSupabase as never,
      { timezone: "UTC" }
    );

    expect(result.success).toBe(true);
    expect(result.matched).toBe(0);
  });

  it("should use FIFO matching when same ride planned multiple times on same day", async () => {
    // Peloton completed workout on 2024-01-20
    mockPelotonClient.getUserWorkouts.mockResolvedValue({
      data: [
        {
          id: "peloton-workout-1",
          created_at: 1705708800, // 2024-01-20 00:00:00 UTC
          status: "COMPLETE",
          ride: { id: "ride-123" },
        },
      ],
    });

    // Two planned workouts for same ride on same date
    const mockSupabase = createSupabaseMock([
      {
        id: "planned-workout-2",
        peloton_ride_id: "ride-123",
        scheduled_date: "2024-01-20",
        sort_order: 1, // Second in order
        peloton_workout_id: null,
      },
      {
        id: "planned-workout-1",
        peloton_ride_id: "ride-123",
        scheduled_date: "2024-01-20",
        sort_order: 0, // First in order
        peloton_workout_id: null,
      },
    ]);

    const result = await syncCompletedWorkouts(
      "user-123",
      "peloton-user-123",
      mockPelotonClient as unknown as PelotonClient,
      mockSupabase as never,
      { timezone: "UTC" }
    );

    expect(result.success).toBe(true);
    expect(result.matched).toBe(1);
    // Should match the first one (sort_order: 0)
    expect(mockSupabase._updateEqMock).toHaveBeenCalledWith("id", "planned-workout-1");
  });

  it("should skip workouts without ride info", async () => {
    mockPelotonClient.getUserWorkouts.mockResolvedValue({
      data: [
        {
          id: "peloton-workout-1",
          created_at: 1705708800,
          status: "COMPLETE",
          ride: null, // No ride info
        },
      ],
    });

    const mockSupabase = createSupabaseMock([
      {
        id: "planned-workout-1",
        peloton_ride_id: "ride-123",
        scheduled_date: "2024-01-20",
        sort_order: 0,
        peloton_workout_id: null,
      },
    ]);

    const result = await syncCompletedWorkouts(
      "user-123",
      "peloton-user-123",
      mockPelotonClient as unknown as PelotonClient,
      mockSupabase as never
    );

    expect(result.success).toBe(true);
    expect(result.matched).toBe(0);
  });

  it("should skip non-COMPLETE workouts", async () => {
    mockPelotonClient.getUserWorkouts.mockResolvedValue({
      data: [
        {
          id: "peloton-workout-1",
          created_at: 1705708800,
          status: "IN_PROGRESS", // Not complete
          ride: { id: "ride-123" },
        },
      ],
    });

    const mockSupabase = createSupabaseMock([]);

    const result = await syncCompletedWorkouts(
      "user-123",
      "peloton-user-123",
      mockPelotonClient as unknown as PelotonClient,
      mockSupabase as never
    );

    expect(result.success).toBe(true);
    expect(result.matched).toBe(0);
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  it("should handle database errors gracefully", async () => {
    mockPelotonClient.getUserWorkouts.mockResolvedValue({
      data: [
        {
          id: "peloton-workout-1",
          created_at: 1705708800,
          status: "COMPLETE",
          ride: { id: "ride-123" },
        },
      ],
    });

    const mockSupabase = createSupabaseMock(null, { message: "Database error" });

    const result = await syncCompletedWorkouts(
      "user-123",
      "peloton-user-123",
      mockPelotonClient as unknown as PelotonClient,
      mockSupabase as never
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("Database error");
  });

  it("should handle Peloton API errors gracefully", async () => {
    mockPelotonClient.getUserWorkouts.mockRejectedValue(
      new Error("API error")
    );

    const mockSupabase = createSupabaseMock([]);

    const result = await syncCompletedWorkouts(
      "user-123",
      "peloton-user-123",
      mockPelotonClient as unknown as PelotonClient,
      mockSupabase as never
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("API error");
  });

  it("should handle timezone boundaries correctly (late evening workout)", async () => {
    // Workout completed at 10 PM PST on Jan 19 = 6 AM UTC on Jan 20
    // User's timezone is America/Los_Angeles
    // The workout should match against Jan 19 in the user's timezone
    mockPelotonClient.getUserWorkouts.mockResolvedValue({
      data: [
        {
          id: "peloton-workout-1",
          created_at: 1705730400, // 2024-01-20 06:00:00 UTC = 2024-01-19 22:00:00 PST
          status: "COMPLETE",
          ride: { id: "ride-123" },
        },
      ],
    });

    const mockSupabase = createSupabaseMock([
      {
        id: "planned-workout-1",
        peloton_ride_id: "ride-123",
        scheduled_date: "2024-01-19", // Planned for Jan 19
        sort_order: 0,
        peloton_workout_id: null,
      },
    ]);

    const result = await syncCompletedWorkouts(
      "user-123",
      "peloton-user-123",
      mockPelotonClient as unknown as PelotonClient,
      mockSupabase as never,
      { timezone: "America/Los_Angeles" }
    );

    expect(result.success).toBe(true);
    expect(result.matched).toBe(1);
    expect(mockSupabase._updateEqMock).toHaveBeenCalledWith("id", "planned-workout-1");
  });

  it("should match multiple same-ride completions in FIFO order", async () => {
    // Two completions of the same ride on the same day
    mockPelotonClient.getUserWorkouts.mockResolvedValue({
      data: [
        {
          id: "peloton-workout-2",
          created_at: 1705752000, // 2024-01-20 10:00:00 UTC (later workout)
          status: "COMPLETE",
          ride: { id: "ride-123" },
        },
        {
          id: "peloton-workout-1",
          created_at: 1705708800, // 2024-01-20 00:00:00 UTC (earlier workout)
          status: "COMPLETE",
          ride: { id: "ride-123" },
        },
      ],
    });

    // Two planned workouts for the same ride on the same day
    const mockSupabase = createSupabaseMock([
      {
        id: "planned-workout-1",
        peloton_ride_id: "ride-123",
        scheduled_date: "2024-01-20",
        sort_order: 0,
        peloton_workout_id: null,
      },
      {
        id: "planned-workout-2",
        peloton_ride_id: "ride-123",
        scheduled_date: "2024-01-20",
        sort_order: 1,
        peloton_workout_id: null,
      },
    ]);

    const result = await syncCompletedWorkouts(
      "user-123",
      "peloton-user-123",
      mockPelotonClient as unknown as PelotonClient,
      mockSupabase as never,
      { timezone: "UTC" }
    );

    expect(result.success).toBe(true);
    expect(result.matched).toBe(2);
  });

  it("should not match when ride IDs differ", async () => {
    mockPelotonClient.getUserWorkouts.mockResolvedValue({
      data: [
        {
          id: "peloton-workout-1",
          created_at: 1705708800, // 2024-01-20 00:00:00 UTC
          status: "COMPLETE",
          ride: { id: "ride-456" }, // Different ride ID
        },
      ],
    });

    const mockSupabase = createSupabaseMock([
      {
        id: "planned-workout-1",
        peloton_ride_id: "ride-123", // Different ride ID
        scheduled_date: "2024-01-20",
        sort_order: 0,
        peloton_workout_id: null,
      },
    ]);

    const result = await syncCompletedWorkouts(
      "user-123",
      "peloton-user-123",
      mockPelotonClient as unknown as PelotonClient,
      mockSupabase as never,
      { timezone: "UTC" }
    );

    expect(result.success).toBe(true);
    expect(result.matched).toBe(0);
    expect(mockSupabase._updateMock).not.toHaveBeenCalled();
  });

  it("should only match each Peloton workout once even if duplicated in response", async () => {
    // Same Peloton workout appears twice in the API response (edge case)
    mockPelotonClient.getUserWorkouts.mockResolvedValue({
      data: [
        {
          id: "peloton-workout-1", // Same ID
          created_at: 1705708800,
          status: "COMPLETE",
          ride: { id: "ride-123" },
        },
        {
          id: "peloton-workout-1", // Duplicate
          created_at: 1705708800,
          status: "COMPLETE",
          ride: { id: "ride-123" },
        },
      ],
    });

    // Two planned workouts that could potentially match
    const mockSupabase = createSupabaseMock([
      {
        id: "planned-workout-1",
        peloton_ride_id: "ride-123",
        scheduled_date: "2024-01-20",
        sort_order: 0,
        peloton_workout_id: null,
      },
      {
        id: "planned-workout-2",
        peloton_ride_id: "ride-123",
        scheduled_date: "2024-01-20",
        sort_order: 1,
        peloton_workout_id: null,
      },
    ]);

    const result = await syncCompletedWorkouts(
      "user-123",
      "peloton-user-123",
      mockPelotonClient as unknown as PelotonClient,
      mockSupabase as never,
      { timezone: "UTC" }
    );

    expect(result.success).toBe(true);
    // Should only match once despite duplicate in response
    expect(result.matched).toBe(1);
  });

  it("should report partial failures correctly", async () => {
    // Two completions that should match two planned workouts
    mockPelotonClient.getUserWorkouts.mockResolvedValue({
      data: [
        {
          id: "peloton-workout-1",
          created_at: 1705708800,
          status: "COMPLETE",
          ride: { id: "ride-123" },
        },
        {
          id: "peloton-workout-2",
          created_at: 1705752000,
          status: "COMPLETE",
          ride: { id: "ride-456" },
        },
      ],
    });

    // Create a mock where first update succeeds, second fails
    let updateCallCount = 0;
    const updateEqMock = vi.fn().mockImplementation(() => {
      updateCallCount++;
      if (updateCallCount === 1) {
        return Promise.resolve({ error: null });
      }
      return Promise.resolve({ error: { message: "Constraint violation" } });
    });
    const updateMock = vi.fn().mockReturnValue({ eq: updateEqMock });

    const isMock = vi.fn().mockResolvedValue({
      data: [
        {
          id: "planned-workout-1",
          peloton_ride_id: "ride-123",
          scheduled_date: "2024-01-20",
          sort_order: 0,
          peloton_workout_id: null,
        },
        {
          id: "planned-workout-2",
          peloton_ride_id: "ride-456",
          scheduled_date: "2024-01-20",
          sort_order: 1,
          peloton_workout_id: null,
        },
      ],
      error: null,
    });

    const eqMock = vi.fn().mockImplementation(() => ({
      eq: eqMock,
      is: isMock,
    }));

    const selectMock = vi.fn().mockReturnValue({ eq: eqMock });

    const mockSupabase = {
      from: vi.fn().mockImplementation(() => ({
        select: selectMock,
        update: updateMock,
      })),
    };

    const result = await syncCompletedWorkouts(
      "user-123",
      "peloton-user-123",
      mockPelotonClient as unknown as PelotonClient,
      mockSupabase as never,
      { timezone: "UTC" }
    );

    expect(result.success).toBe(false);
    expect(result.matched).toBe(1); // Only first succeeded
    expect(result.error).toContain("1 workout(s) failed to update");
  });

  it("should work without timezone option (uses system local time)", async () => {
    // This test verifies the function works when no timezone is provided.
    // The date conversion will use system local time in this case.
    // The API route handles the UTC fallback - see sync-completions/route.ts
    mockPelotonClient.getUserWorkouts.mockResolvedValue({
      data: [
        {
          id: "peloton-workout-1",
          created_at: 1705708800, // 2024-01-20 00:00:00 UTC
          status: "COMPLETE",
          ride: { id: "ride-123" },
        },
      ],
    });

    const mockSupabase = createSupabaseMock([
      {
        id: "planned-workout-1",
        peloton_ride_id: "ride-123",
        scheduled_date: "2024-01-20",
        sort_order: 0,
        peloton_workout_id: null,
      },
    ]);

    // No timezone option provided - should not crash
    const result = await syncCompletedWorkouts(
      "user-123",
      "peloton-user-123",
      mockPelotonClient as unknown as PelotonClient,
      mockSupabase as never
    );

    // Function should complete successfully regardless of local timezone
    expect(result.success).toBe(true);
    // Match count depends on system timezone, so just verify it's a valid number
    expect(typeof result.matched).toBe("number");
  });

  it("should handle invalid timezone gracefully (falls back to system local time)", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    mockPelotonClient.getUserWorkouts.mockResolvedValue({
      data: [
        {
          id: "peloton-workout-1",
          created_at: 1705708800, // 2024-01-20 00:00:00 UTC
          status: "COMPLETE",
          ride: { id: "ride-123" },
        },
      ],
    });

    const mockSupabase = createSupabaseMock([
      {
        id: "planned-workout-1",
        peloton_ride_id: "ride-123",
        scheduled_date: "2024-01-20",
        sort_order: 0,
        peloton_workout_id: null,
      },
    ]);

    // Invalid timezone - should handle gracefully without crashing
    const result = await syncCompletedWorkouts(
      "user-123",
      "peloton-user-123",
      mockPelotonClient as unknown as PelotonClient,
      mockSupabase as never,
      { timezone: "Invalid/Timezone" }
    );

    // Function should complete successfully
    expect(result.success).toBe(true);
    // Match count depends on system timezone fallback
    expect(typeof result.matched).toBe("number");

    consoleSpy.mockRestore();
  });
});
