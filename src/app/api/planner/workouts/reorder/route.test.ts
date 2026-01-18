import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";
import { createUntypedClient } from "@/lib/supabase/admin";

// Mock Supabase admin client
vi.mock("@/lib/supabase/admin", () => ({
  createUntypedClient: vi.fn(),
}));

describe("POST /api/planner/workouts/reorder", () => {
  const mockSupabase = {
    auth: {
      getUser: vi.fn(),
    },
    from: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (createUntypedClient as ReturnType<typeof vi.fn>).mockResolvedValue(mockSupabase);
  });

  it("should return 400 when date is missing", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-123" } },
      error: null,
    });

    const request = new Request("http://localhost:3002/api/planner/workouts/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workoutIds: ["workout-1", "workout-2"] }),
    });
    const response = await POST(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("Missing required fields: date and workoutIds");
  });

  it("should return 400 when workoutIds is not an array", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-123" } },
      error: null,
    });

    const request = new Request("http://localhost:3002/api/planner/workouts/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: "2026-01-17", workoutIds: "invalid" }),
    });
    const response = await POST(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("Missing required fields: date and workoutIds");
  });

  it("should return 401 when user is not authenticated", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: "Not authenticated" },
    });

    const request = new Request("http://localhost:3002/api/planner/workouts/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: "2026-01-17", workoutIds: ["workout-1"] }),
    });
    const response = await POST(request);

    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.error).toBe("Unauthorized");
  });

  it("should update sort_order for all workouts", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-123" } },
      error: null,
    });

    const mockUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    });

    mockSupabase.from.mockReturnValue({
      update: mockUpdate,
    });

    const request = new Request("http://localhost:3002/api/planner/workouts/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: "2026-01-17",
        workoutIds: ["workout-1", "workout-2", "workout-3"],
      }),
    });
    const response = await POST(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);

    // Verify all workouts were updated
    expect(mockSupabase.from).toHaveBeenCalledTimes(3);
    expect(mockSupabase.from).toHaveBeenCalledWith("planned_workouts");
  });

  it("should only update workouts belonging to the authenticated user", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-123" } },
      error: null,
    });

    const mockEqUserId = vi.fn().mockResolvedValue({ error: null });
    const mockEqId = vi.fn().mockReturnValue({ eq: mockEqUserId });
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEqId });

    mockSupabase.from.mockReturnValue({
      update: mockUpdate,
    });

    const request = new Request("http://localhost:3002/api/planner/workouts/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: "2026-01-17",
        workoutIds: ["workout-1"],
      }),
    });
    await POST(request);

    // Verify user_id filter is applied
    expect(mockEqId).toHaveBeenCalledWith("id", "workout-1");
    expect(mockEqUserId).toHaveBeenCalledWith("user_id", "user-123");
  });

  it("should return 500 when some updates fail", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-123" } },
      error: null,
    });

    let callCount = 0;
    mockSupabase.from.mockReturnValue({
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 2) {
              return Promise.resolve({ error: { message: "Database error" } });
            }
            return Promise.resolve({ error: null });
          }),
        }),
      }),
    });

    const request = new Request("http://localhost:3002/api/planner/workouts/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: "2026-01-17",
        workoutIds: ["workout-1", "workout-2", "workout-3"],
      }),
    });
    const response = await POST(request);

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toBe("Failed to update 1 workout(s)");
  });

  it("should return 500 when all updates fail", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-123" } },
      error: null,
    });

    mockSupabase.from.mockReturnValue({
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: { message: "Database error" } }),
        }),
      }),
    });

    const request = new Request("http://localhost:3002/api/planner/workouts/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: "2026-01-17",
        workoutIds: ["workout-1", "workout-2"],
      }),
    });
    const response = await POST(request);

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toBe("Failed to update 2 workout(s)");
  });

  it("should handle empty workoutIds array", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-123" } },
      error: null,
    });

    const request = new Request("http://localhost:3002/api/planner/workouts/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: "2026-01-17",
        workoutIds: [],
      }),
    });
    const response = await POST(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.success).toBe(true);
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  it("should return 500 on unexpected errors", async () => {
    mockSupabase.auth.getUser.mockRejectedValue(new Error("Unexpected error"));

    const request = new Request("http://localhost:3002/api/planner/workouts/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: "2026-01-17",
        workoutIds: ["workout-1"],
      }),
    });
    const response = await POST(request);

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toBe("Internal server error");
  });
});
