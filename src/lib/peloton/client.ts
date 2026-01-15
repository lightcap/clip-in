import type {
  PelotonUser,
  PelotonWorkout,
  PelotonPerformanceGraph,
  FtpTestResult,
  PelotonSearchParams,
  PelotonSearchResponse,
  PelotonStack,
} from "@/types/peloton";

const PELOTON_API_URL = "https://api.onepeloton.com";

export class PelotonClient {
  private accessToken: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  private async fetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const response = await fetch(`${PELOTON_API_URL}${endpoint}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
        ...options?.headers,
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new PelotonAuthError("Token expired or invalid");
      }
      throw new PelotonApiError(
        `API request failed: ${response.statusText}`,
        response.status
      );
    }

    return response.json();
  }

  async getMe(): Promise<PelotonUser> {
    return this.fetch<PelotonUser>("/api/me");
  }

  async getWorkout(workoutId: string): Promise<PelotonWorkout> {
    return this.fetch<PelotonWorkout>(`/api/workout/${workoutId}`);
  }

  async getWorkoutPerformanceGraph(
    workoutId: string
  ): Promise<PelotonPerformanceGraph> {
    return this.fetch<PelotonPerformanceGraph>(
      `/api/workout/${workoutId}/performance_graph`
    );
  }

  async getUserWorkouts(
    userId: string,
    options?: { limit?: number; page?: number; joins?: string }
  ): Promise<{ data: PelotonWorkout[]; page: number; page_count: number }> {
    const params = new URLSearchParams();
    if (options?.limit) params.set("limit", options.limit.toString());
    if (options?.page) params.set("page", options.page.toString());
    if (options?.joins) params.set("joins", options.joins);

    const queryString = params.toString();
    const endpoint = `/api/user/${userId}/workouts${queryString ? `?${queryString}` : ""}`;
    return this.fetch(endpoint);
  }

  async searchRides(params: PelotonSearchParams): Promise<PelotonSearchResponse> {
    const searchParams = new URLSearchParams();

    if (params.browse_category) searchParams.set("browse_category", params.browse_category);
    if (params.content_format) searchParams.set("content_format", params.content_format);
    if (params.fitness_discipline) searchParams.set("fitness_discipline", params.fitness_discipline);
    if (params.instructor_id) searchParams.set("instructor_id", params.instructor_id);
    if (params.sort_by) searchParams.set("sort_by", params.sort_by);
    if (params.page) searchParams.set("page", params.page.toString());
    if (params.limit) searchParams.set("limit", params.limit.toString());
    if (params.duration) {
      params.duration.forEach(d => searchParams.append("duration", d.toString()));
    }

    return this.fetch<PelotonSearchResponse>(
      `/api/v2/ride/archived?${searchParams.toString()}`
    );
  }

  async getFtpHistory(startWorkoutId: string | null): Promise<FtpTestResult[]> {
    const results: FtpTestResult[] = [];
    let workoutId = startWorkoutId;

    while (workoutId && results.length < 50) {
      try {
        const workout = await this.getWorkout(workoutId);

        // Get performance data to calculate actual FTP result
        let avgOutput: number | null = null;
        let calculatedFtp: number | null = null;

        try {
          const perf = await this.getWorkoutPerformanceGraph(workoutId);
          const avgSummary = perf.average_summaries?.find(
            (s) => s.slug === "avg_output"
          );
          if (avgSummary) {
            avgOutput = avgSummary.value;
            // FTP = 95% of 20-minute average power (standard FTP calculation)
            calculatedFtp = Math.round(avgOutput * 0.95);
          }
        } catch {
          // Performance graph may not be available for all workouts
        }

        results.push({
          date: new Date(workout.created_at * 1000),
          workoutId: workout.id,
          rideTitle: workout.ride?.title ?? null,
          avgOutput,
          calculatedFtp,
          baselineFtp: workout.ftp_info?.ftp ?? 0,
          source: workout.ftp_info?.ftp_source ?? null,
        });

        // Follow chain to previous FTP test
        const nextId = workout.ftp_info?.ftp_workout_id;
        if (nextId === workoutId) break; // Prevent infinite loop
        workoutId = nextId ?? null;
      } catch (error) {
        // Stop if we hit an error (e.g., workout not found)
        console.error("Error fetching FTP history:", error);
        break;
      }
    }

    return results;
  }

  // Stack Management Methods

  async getStack(): Promise<PelotonStack | null> {
    try {
      const user = await this.getMe();
      return this.fetch<PelotonStack>(`/api/user/${user.id}/stack`);
    } catch (error) {
      // User may not have a stack yet
      console.error("Error fetching stack:", error);
      return null;
    }
  }

  async addToStack(rideId: string): Promise<boolean> {
    try {
      const user = await this.getMe();
      await this.fetch(`/api/user/${user.id}/stack`, {
        method: "POST",
        body: JSON.stringify({ peloton_class_id: rideId }),
      });
      return true;
    } catch (error) {
      console.error("Error adding to stack:", error);
      return false;
    }
  }

  async removeFromStack(stackClassId: string): Promise<boolean> {
    try {
      const user = await this.getMe();
      await this.fetch(`/api/user/${user.id}/stack/${stackClassId}`, {
        method: "DELETE",
      });
      return true;
    } catch (error) {
      console.error("Error removing from stack:", error);
      return false;
    }
  }

  async clearStack(): Promise<boolean> {
    try {
      const stack = await this.getStack();
      if (!stack || stack.classes.length === 0) return true;

      // Remove each class from stack
      for (const stackClass of stack.classes) {
        await this.removeFromStack(stackClass.id);
      }
      return true;
    } catch (error) {
      console.error("Error clearing stack:", error);
      return false;
    }
  }

  async pushWorkoutsToStack(rideIds: string[]): Promise<{ success: string[]; failed: string[] }> {
    const results = { success: [] as string[], failed: [] as string[] };

    for (const rideId of rideIds) {
      const added = await this.addToStack(rideId);
      if (added) {
        results.success.push(rideId);
      } else {
        results.failed.push(rideId);
      }
    }

    return results;
  }
}

export class PelotonAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PelotonAuthError";
  }
}

export class PelotonApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "PelotonApiError";
    this.status = status;
  }
}
