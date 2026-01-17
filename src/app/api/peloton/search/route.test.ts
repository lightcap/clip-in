import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./route";
import { createUntypedClient } from "@/lib/supabase/admin";
import { PelotonClient, PelotonAuthError } from "@/lib/peloton/client";
import { refreshPelotonToken } from "@/lib/peloton/refresh";

// Mock Supabase admin client
vi.mock("@/lib/supabase/admin", () => ({
  createUntypedClient: vi.fn(),
}));

// Mock PelotonClient
vi.mock("@/lib/peloton/client", () => {
  const MockPelotonAuthError = class PelotonAuthError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "PelotonAuthError";
    }
  };
  return {
    PelotonClient: vi.fn(),
    PelotonAuthError: MockPelotonAuthError,
  };
});

// Mock token refresh
vi.mock("@/lib/peloton/refresh", () => ({
  refreshPelotonToken: vi.fn(),
}));

describe("GET /api/peloton/search", () => {
  const mockSupabase = {
    auth: {
      getUser: vi.fn(),
    },
    from: vi.fn(),
  };

  const mockSearchRides = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (createUntypedClient as ReturnType<typeof vi.fn>).mockResolvedValue(mockSupabase);
    (PelotonClient as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      searchRides: mockSearchRides,
    }));
  });

  it("should return 401 when user is not authenticated", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: "Not authenticated" },
    });

    const request = new Request("http://localhost:3002/api/peloton/search");
    const response = await GET(request);

    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.error).toBe("Unauthorized");
  });

  it("should return 400 when Peloton is not connected", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-123" } },
      error: null,
    });

    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null }),
        }),
      }),
    });

    const request = new Request("http://localhost:3002/api/peloton/search");
    const response = await GET(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("Peloton not connected");
  });

  it("should return classes from Peloton API", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-123" } },
      error: null,
    });

    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { access_token_encrypted: "test-token" },
          }),
        }),
      }),
    });

    const mockClasses = {
      data: [
        {
          id: "class-1",
          title: "20 min Strength",
          description: "A great workout",
          duration: 1200,
          difficulty_estimate: 7.5,
          image_url: "https://example.com/image.jpg",
          instructor: { name: "Adrian Williams" },
          fitness_discipline: "strength",
          fitness_discipline_display_name: "Strength",
        },
      ],
      page: 0,
      page_count: 1,
      total: 1,
    };

    mockSearchRides.mockResolvedValue(mockClasses);

    const request = new Request("http://localhost:3002/api/peloton/search?discipline=strength");
    const response = await GET(request);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.classes).toHaveLength(1);
    expect(data.classes[0].id).toBe("class-1");
    expect(data.classes[0].instructor_name).toBe("Adrian Williams");
    expect(data.total).toBe(1);
  });

  it("should pass discipline and duration filters to Peloton API", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-123" } },
      error: null,
    });

    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { access_token_encrypted: "test-token" },
          }),
        }),
      }),
    });

    mockSearchRides.mockResolvedValue({ data: [], page: 0, page_count: 0, total: 0 });

    const request = new Request(
      "http://localhost:3002/api/peloton/search?discipline=cycling&duration=30"
    );
    await GET(request);

    expect(mockSearchRides).toHaveBeenCalledWith(
      expect.objectContaining({
        browse_category: "cycling",
        duration: [1800], // 30 minutes in seconds
      })
    );
  });

  it("should handle instructor without name", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-123" } },
      error: null,
    });

    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { access_token_encrypted: "test-token" },
          }),
        }),
      }),
    });

    mockSearchRides.mockResolvedValue({
      data: [
        {
          id: "class-1",
          title: "20 min Strength",
          description: "A workout",
          duration: 1200,
          difficulty_estimate: 7.0,
          image_url: "https://example.com/image.jpg",
          instructor: null,
          fitness_discipline: "strength",
          fitness_discipline_display_name: "Strength",
        },
      ],
      page: 0,
      page_count: 1,
      total: 1,
    });

    const request = new Request("http://localhost:3002/api/peloton/search");
    const response = await GET(request);
    const data = await response.json();

    expect(data.classes[0].instructor_name).toBe("Unknown");
  });

  it("should return 401 with tokenExpired flag when PelotonAuthError is thrown", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-123" } },
      error: null,
    });

    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { access_token_encrypted: "test-token", refresh_token_encrypted: "refresh-token" },
          }),
        }),
      }),
    });

    mockSearchRides.mockRejectedValue(new PelotonAuthError("Token expired"));
    (refreshPelotonToken as ReturnType<typeof vi.fn>).mockResolvedValue({ success: false });

    const request = new Request("http://localhost:3002/api/peloton/search");
    const response = await GET(request);

    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.error).toBe("Token expired. Please reconnect your Peloton account.");
    expect(data.tokenExpired).toBe(true);
  });

  it("should return 500 on unexpected errors", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-123" } },
      error: null,
    });

    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { access_token_encrypted: "test-token" },
          }),
        }),
      }),
    });

    mockSearchRides.mockRejectedValue(new Error("Network failure"));

    const request = new Request("http://localhost:3002/api/peloton/search");
    const response = await GET(request);

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toBe("Failed to search classes. Please try again later.");
  });

  it("should return 500 when database query fails", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-123" } },
      error: null,
    });

    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: null,
            error: { message: "Database connection failed" },
          }),
        }),
      }),
    });

    const request = new Request("http://localhost:3002/api/peloton/search");
    const response = await GET(request);

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toBe("Failed to verify Peloton connection");
  });

  it("should ignore invalid duration values", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-123" } },
      error: null,
    });

    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { access_token_encrypted: "test-token" },
          }),
        }),
      }),
    });

    mockSearchRides.mockResolvedValue({ data: [], page: 0, page_count: 0, total: 0 });

    const request = new Request(
      "http://localhost:3002/api/peloton/search?duration=invalid"
    );
    await GET(request);

    expect(mockSearchRides).toHaveBeenCalledWith(
      expect.not.objectContaining({ duration: expect.anything() })
    );
  });

  it("should retry with refreshed token when refresh succeeds", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-123" } },
      error: null,
    });

    let dbCallCount = 0;
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockImplementation(() => {
            dbCallCount++;
            if (dbCallCount === 1) {
              return Promise.resolve({
                data: {
                  access_token_encrypted: "old-token",
                  refresh_token_encrypted: "refresh-token",
                },
              });
            }
            return Promise.resolve({
              data: { access_token_encrypted: "new-token" },
            });
          }),
        }),
      }),
    });

    const mockClasses = {
      data: [
        {
          id: "class-1",
          title: "Test Class",
          description: "A workout",
          duration: 1200,
          difficulty_estimate: 7.0,
          image_url: "https://example.com/image.jpg",
          instructor: { name: "Test Instructor" },
          fitness_discipline: "strength",
          fitness_discipline_display_name: "Strength",
        },
      ],
      page: 0,
      page_count: 1,
      total: 1,
    };

    mockSearchRides
      .mockRejectedValueOnce(new PelotonAuthError("Token expired"))
      .mockResolvedValueOnce(mockClasses);

    (refreshPelotonToken as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true });

    const request = new Request("http://localhost:3002/api/peloton/search");
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(refreshPelotonToken).toHaveBeenCalledWith("user-123", "refresh-token");
    expect(mockSearchRides).toHaveBeenCalledTimes(2);

    const data = await response.json();
    expect(data.classes).toHaveLength(1);
    expect(data.classes[0].id).toBe("class-1");
  });

  it("should return 401 immediately when no refresh token is available", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-123" } },
      error: null,
    });

    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: {
              access_token_encrypted: "test-token",
              refresh_token_encrypted: null,
            },
          }),
        }),
      }),
    });

    mockSearchRides.mockRejectedValue(new PelotonAuthError("Token expired"));

    const request = new Request("http://localhost:3002/api/peloton/search");
    const response = await GET(request);

    expect(response.status).toBe(401);
    expect(refreshPelotonToken).not.toHaveBeenCalled();
    const data = await response.json();
    expect(data.tokenExpired).toBe(true);
  });

  it("should return 500 when token refetch fails after successful refresh", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-123" } },
      error: null,
    });

    let dbCallCount = 0;
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockImplementation(() => {
            dbCallCount++;
            if (dbCallCount === 1) {
              return Promise.resolve({
                data: {
                  access_token_encrypted: "old-token",
                  refresh_token_encrypted: "refresh-token",
                },
              });
            }
            return Promise.resolve({
              data: null,
              error: { message: "Database error" },
            });
          }),
        }),
      }),
    });

    mockSearchRides.mockRejectedValue(new PelotonAuthError("Token expired"));
    (refreshPelotonToken as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true });

    const request = new Request("http://localhost:3002/api/peloton/search");
    const response = await GET(request);

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toBe("Failed to retrieve refreshed credentials. Please try again.");
  });

  it("should return 500 when retry search fails after token refresh", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-123" } },
      error: null,
    });

    let dbCallCount = 0;
    mockSupabase.from.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockImplementation(() => {
            dbCallCount++;
            if (dbCallCount === 1) {
              return Promise.resolve({
                data: {
                  access_token_encrypted: "old-token",
                  refresh_token_encrypted: "refresh-token",
                },
              });
            }
            return Promise.resolve({
              data: { access_token_encrypted: "new-token" },
            });
          }),
        }),
      }),
    });

    mockSearchRides
      .mockRejectedValueOnce(new PelotonAuthError("Token expired"))
      .mockRejectedValueOnce(new Error("API unavailable"));

    (refreshPelotonToken as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true });

    const request = new Request("http://localhost:3002/api/peloton/search");
    const response = await GET(request);

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toBe("Search failed after refreshing credentials. Please try again.");
  });
});
