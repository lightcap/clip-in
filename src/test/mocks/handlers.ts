import { http, HttpResponse } from "msw";

// Mock API handlers
export const handlers = [
  // Mock planned workouts API
  http.get("/api/planner/workouts", () => {
    return HttpResponse.json({
      workouts: [
        {
          id: "workout-1",
          peloton_ride_id: "ride-1",
          ride_title: "20 min Full Body Strength",
          ride_image_url: null,
          instructor_name: "Adrian Williams",
          duration_seconds: 1200,
          discipline: "strength",
          scheduled_date: "2026-01-15",
          scheduled_time: null,
          status: "planned",
          pushed_to_stack: false,
        },
      ],
    });
  }),

  http.post("/api/planner/workouts", async ({ request }) => {
    const body = await request.json() as Record<string, unknown>;
    return HttpResponse.json({
      workout: {
        id: "workout-new",
        ...body,
        status: "planned",
        pushed_to_stack: false,
      },
    });
  }),

  http.patch("/api/planner/workouts/:id", async ({ params, request }) => {
    const body = await request.json() as Record<string, unknown>;
    return HttpResponse.json({
      workout: {
        id: params.id,
        ...body,
      },
    });
  }),

  http.delete("/api/planner/workouts/:id", () => {
    return HttpResponse.json({ success: true });
  }),

  // Mock FTP API
  http.get("/api/ftp/history", () => {
    return HttpResponse.json({
      records: [
        {
          id: "ftp-1",
          date: "2026-01-10",
          ftp_value: 200,
          source: "ftp_test",
          workout_id: "workout-ftp-1",
        },
        {
          id: "ftp-2",
          date: "2026-01-01",
          ftp_value: 195,
          source: "ftp_test",
          workout_id: "workout-ftp-2",
        },
      ],
    });
  }),

  http.post("/api/ftp/sync", () => {
    return HttpResponse.json({
      synced: 2,
      message: "FTP history synced successfully",
    });
  }),

  // Mock stack API
  http.post("/api/stack/push", () => {
    return HttpResponse.json({
      message: "Pushed 1 workout(s) to stack",
      pushed: 1,
      failed: 0,
      targetDate: "2026-01-16",
    });
  }),

  http.get("/api/stack/push", () => {
    return HttpResponse.json({
      stack: {
        id: "stack-1",
        classes: [],
        total_classes: 0,
      },
      recentSyncs: [],
    });
  }),

  // Mock profile API
  http.patch("/api/profile", async ({ request }) => {
    const body = await request.json() as Record<string, unknown>;
    return HttpResponse.json({
      profile: {
        id: "test-user-id",
        ...body,
      },
    });
  }),

  // Mock Peloton API
  http.post("/api/peloton/connect", () => {
    return HttpResponse.json({
      success: true,
      user: {
        id: "peloton-user-id",
        username: "testuser",
        email: "test@example.com",
        name: "Test User",
        cycling_ftp: 200,
      },
    });
  }),
];
