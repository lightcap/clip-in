import type {
  PelotonUser,
  PelotonWorkout,
  PelotonPerformanceGraph,
  FtpTestResult,
  PelotonSearchParams,
  PelotonSearchResponse,
  PelotonStack,
  GraphQLStackResponse,
  ModifyStackResult,
} from "@/types/peloton";

const PELOTON_API_URL = "https://api.onepeloton.com";
const PELOTON_GRAPHQL_URL = "https://gql-graphql-gateway.prod.k8s.onepeloton.com/graphql";

/**
 * Validate that a Peloton class/ride ID is in the expected format.
 * Peloton IDs are 32-character hexadecimal strings.
 */
export function isValidPelotonClassId(id: string): boolean {
  return /^[a-f0-9]{32}$/i.test(id);
}

/**
 * Encode a class ID into the base64 format required by Peloton's GraphQL API.
 * Format: base64 of JSON with specific spacing (NOT using JSON.stringify to preserve exact format).
 * The exact format is: {"home_peloton_id": null, "ride_id": "<id>", "studio_peloton_id": null, "type": "<type>"}
 * Note: Peloton requires this exact spacing - do not refactor to use JSON.stringify().
 * @throws {Error} If the classId is not a valid 32-character hex string
 */
export function encodeClassIdForGraphQL(rideId: string, type: "on_demand" | "live" = "on_demand"): string {
  if (!isValidPelotonClassId(rideId)) {
    throw new Error(`Invalid Peloton class ID format: ${rideId.substring(0, 50)}`);
  }
  // Match the exact format Peloton uses (with spaces after colons and commas)
  const json = `{"home_peloton_id": null, "ride_id": "${rideId}", "studio_peloton_id": null, "type": "${type}"}`;
  return Buffer.from(json).toString("base64");
}

/**
 * Decode a base64-encoded class ID from Peloton's GraphQL API back to a ride ID.
 */
export function decodeGraphQLClassId(encodedId: string): string | null {
  try {
    const decoded = JSON.parse(Buffer.from(encodedId, "base64").toString("utf-8"));
    return decoded.ride_id || null;
  } catch (error) {
    console.error("Failed to decode GraphQL class ID:", {
      encodedId: encodedId.substring(0, 50),
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return null;
  }
}

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

    // Include instructor data in results
    searchParams.set("joins", "instructor");

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

  // GraphQL Stack Methods

  private async graphqlFetch<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    const response = await fetch(PELOTON_GRAPHQL_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new PelotonAuthError("Token expired or invalid");
      }
      throw new PelotonApiError(
        `GraphQL request failed: ${response.statusText}`,
        response.status
      );
    }

    const result = await response.json();

    if (result.errors && result.errors.length > 0) {
      const errorMessage = result.errors.map((e: { message: string }) => e.message).join(", ");
      throw new PelotonApiError(`GraphQL error: ${errorMessage}`, 400);
    }

    return result.data;
  }

  /**
   * View the user's current stack using GraphQL.
   * Returns the list of classes in the stack with their order and details.
   * @throws {PelotonAuthError} When authentication fails (token expired/invalid)
   */
  async viewUserStackGraphQL(): Promise<GraphQLStackResponse | null> {
    const query = `
      query ViewUserStack {
        viewUserStack {
          numClasses
          totalTime
          ... on StackResponseSuccess {
            userStack {
              stackedClassList {
                playOrder
                pelotonClass {
                  classId
                  title
                  duration
                  fitnessDiscipline { slug displayName }
                  instructor { name }
                }
              }
            }
          }
        }
      }
    `;

    try {
      const data = await this.graphqlFetch<{ viewUserStack: GraphQLStackResponse }>(query);
      return data.viewUserStack;
    } catch (error) {
      if (error instanceof PelotonAuthError) {
        throw error; // Re-throw auth errors for caller to handle
      }
      console.error("Error fetching stack via GraphQL:", error);
      return null;
    }
  }

  /**
   * Replace the entire stack with a new ordered list of classes using the ModifyStack mutation.
   * This is atomic - the entire stack is replaced at once.
   *
   * @param rideIds - Array of Peloton ride IDs (not encoded). Max 10 classes.
   * @returns Result including success status, number of classes, and the class IDs in the stack
   */
  async modifyStack(rideIds: string[]): Promise<ModifyStackResult> {
    // Peloton stack has a max of 10 classes
    const limitedRideIds = rideIds.slice(0, 10);

    // Encode ride IDs for GraphQL
    const encodedClassIds = limitedRideIds.map(id => encodeClassIdForGraphQL(id));

    const query = `
      mutation ModifyStack($input: ModifyStackInput!) {
        modifyStack(input: $input) {
          numClasses
          totalTime
          userStack {
            stackedClassList {
              playOrder
              pelotonClass {
                classId
                title
              }
            }
          }
        }
      }
    `;

    const variables = {
      input: {
        pelotonClassIdList: encodedClassIds,
      },
    };

    try {
      const data = await this.graphqlFetch<{ modifyStack: GraphQLStackResponse }>(query, variables);
      const response = data.modifyStack;

      // Extract the actual class IDs from the response for verification
      const responseClassIds = response.userStack?.stackedClassList
        .map(item => item.pelotonClass.classId)
        .filter((id): id is string => id !== null) ?? [];

      return {
        success: true,
        numClasses: response.numClasses,
        classIds: responseClassIds,
      };
    } catch (error) {
      if (error instanceof PelotonAuthError) {
        throw error; // Re-throw auth errors for caller to handle
      }
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error("Error modifying stack:", error);
      return {
        success: false,
        numClasses: 0,
        classIds: [],
        error: errorMessage,
      };
    }
  }

  /**
   * Clear the stack completely using the ModifyStack mutation with an empty list.
   */
  async clearStackGraphQL(): Promise<boolean> {
    const result = await this.modifyStack([]);
    return result.success && result.numClasses === 0;
  }

  /**
   * Add a single class to the stack using the AddClassToStack mutation.
   * This is the proper way to add new classes to the stack.
   */
  async addClassToStackGraphQL(rideId: string): Promise<ModifyStackResult> {
    const encodedClassId = encodeClassIdForGraphQL(rideId);

    const query = `
      mutation AddClassToStack($input: AddClassToStackInput!) {
        addClassToStack(input: $input) {
          numClasses
          totalTime
          userStack {
            stackedClassList {
              playOrder
              pelotonClass {
                classId
                title
              }
            }
          }
        }
      }
    `;

    const variables = {
      input: {
        pelotonClassId: encodedClassId,
      },
    };

    try {
      const data = await this.graphqlFetch<{ addClassToStack: GraphQLStackResponse }>(query, variables);
      const response = data.addClassToStack;

      const responseClassIds = response.userStack?.stackedClassList
        .map(item => item.pelotonClass.classId)
        .filter((id): id is string => id !== null) ?? [];

      return {
        success: true,
        numClasses: response.numClasses,
        classIds: responseClassIds,
      };
    } catch (error) {
      if (error instanceof PelotonAuthError) {
        throw error;
      }
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error("Error adding class to stack:", error);
      return {
        success: false,
        numClasses: 0,
        classIds: [],
        error: errorMessage,
      };
    }
  }

  /**
   * Add multiple classes to the stack one at a time using AddClassToStack.
   */
  async addMultipleToStack(rideIds: string[]): Promise<ModifyStackResult> {
    const limitedRideIds = rideIds.slice(0, 10);
    let lastResult: ModifyStackResult = { success: true, numClasses: 0, classIds: [] };

    for (const rideId of limitedRideIds) {
      lastResult = await this.addClassToStackGraphQL(rideId);
      if (!lastResult.success) {
        return lastResult;
      }
    }

    return lastResult;
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
