import { PelotonClient, PelotonAuthError } from "./client";
import type { SyncResult } from "@/types/peloton";
import type { SupabaseClient } from "@supabase/supabase-js";
import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";

const MAX_STACK_SIZE = 10;
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 1000;

interface PlannedWorkout {
  id: string;
  peloton_class_id: string | null;
  sort_order: number;
  status: string;
}

/**
 * Validate that a timezone string is valid.
 */
function isValidTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get today's date in the user's timezone.
 * Falls back to server's local timezone if timezone is invalid or not provided.
 */
function getTodayInTimezone(timezone?: string): string {
  const now = new Date();
  if (timezone && isValidTimezone(timezone)) {
    try {
      const zonedDate = toZonedTime(now, timezone);
      return format(zonedDate, "yyyy-MM-dd");
    } catch (error) {
      console.error(`Timezone conversion failed for "${timezone}", using server time:`, error);
    }
  }
  return format(now, "yyyy-MM-dd");
}

/**
 * Wait for a specified number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Sync today's planned workouts to the user's Peloton stack.
 *
 * This function:
 * 1. Gets today's planned workouts (user's local timezone, ordered by sort_order)
 * 2. Extracts class IDs (max 10)
 * 3. Clears the existing stack using ModifyStack
 * 4. Adds classes one-by-one using AddClassToStack mutation
 * 5. Verifies the response matches expected state
 * 6. Retries with exponential backoff on failure (clears stack before each retry)
 *
 * The app is the source of truth - if the user removes a class from
 * Peloton's stack, it will be pushed back on the next sync.
 */
export async function syncTodayToStack(
  userId: string,
  peloton: PelotonClient,
  supabase: SupabaseClient,
  options?: { timezone?: string }
): Promise<SyncResult> {
  const today = getTodayInTimezone(options?.timezone);

  // 1. Get today's planned workouts, ordered by position
  const { data: workouts, error: workoutsError } = await supabase
    .from("planned_workouts")
    .select("id, peloton_class_id, sort_order, status")
    .eq("user_id", userId)
    .eq("scheduled_date", today)
    .eq("status", "planned")
    .order("sort_order", { ascending: true });

  if (workoutsError) {
    return {
      success: false,
      pushed: 0,
      expected: 0,
      classIds: [],
      error: `Failed to fetch planned workouts: ${workoutsError.message}`,
    };
  }

  const plannedWorkouts = (workouts || []) as PlannedWorkout[];

  // Filter to workouts with valid Peloton class IDs
  const validWorkouts = plannedWorkouts.filter(
    (w): w is PlannedWorkout & { peloton_class_id: string } =>
      w.peloton_class_id !== null
  );

  if (validWorkouts.length === 0) {
    // No workouts to sync - clear the stack (we are source of truth)
    const clearResult = await peloton.modifyStack([]);
    return {
      success: clearResult.success,
      pushed: 0,
      expected: 0,
      classIds: [],
      error: clearResult.error,
    };
  }

  // 2. Extract class IDs (max 10)
  const classIds = validWorkouts.slice(0, MAX_STACK_SIZE).map(w => w.peloton_class_id);
  const willTruncate = validWorkouts.length > MAX_STACK_SIZE;

  // 3. Clear existing stack first
  const clearResult = await peloton.modifyStack([]);
  if (!clearResult.success) {
    return {
      success: false,
      pushed: 0,
      expected: classIds.length,
      classIds: [],
      error: `Failed to clear stack: ${clearResult.error}`,
    };
  }

  // 4. Add classes using AddClassToStack mutation with retry logic
  let lastError: string | undefined;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      // Exponential backoff: 1s, 2s, then give up after 3 total attempts
      const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
      console.warn(`Stack sync retry ${attempt}/${MAX_RETRIES - 1} after: ${lastError}`);
      await sleep(delay);

      // Clear stack before retry to avoid duplicates from partial failures
      const retryClearResult = await peloton.modifyStack([]);
      if (!retryClearResult.success) {
        lastError = `Failed to clear stack before retry: ${retryClearResult.error}`;
        continue;
      }
    }

    try {
      const result = await peloton.addMultipleToStack(classIds);

      if (result.success) {
        // 5. Verify response matches expected state
        if (result.numClasses !== classIds.length) {
          console.warn(`Stack count mismatch: sent ${classIds.length}, got ${result.numClasses}`);
        }

        return {
          success: true,
          pushed: result.numClasses,
          expected: classIds.length,
          classIds: result.classIds,
          error: willTruncate
            ? `Only first ${MAX_STACK_SIZE} of ${validWorkouts.length} classes were pushed (Peloton limit)`
            : undefined,
        };
      }

      lastError = result.error || "Unknown error";
    } catch (error) {
      if (error instanceof PelotonAuthError) {
        // Auth errors should not be retried
        return {
          success: false,
          pushed: 0,
          expected: classIds.length,
          classIds: [],
          error: "Peloton authentication failed. Please reconnect.",
        };
      }
      lastError = error instanceof Error ? error.message : "Unknown error";
    }
  }

  // All retries exhausted
  return {
    success: false,
    pushed: 0,
    expected: classIds.length,
    classIds: [],
    error: lastError || "Max retries exceeded",
  };
}

export interface StackStatusResult {
  numClasses: number;
  totalTime?: number;
  classes: Array<{
    classId: string;
    title: string;
    duration?: number;
    discipline?: string;
    instructor?: string;
    order: number;
  }>;
  error?: string;
  fetchFailed?: boolean;
}

/**
 * Get the current state of the user's Peloton stack.
 * Useful for debugging and status display.
 * Returns fetchFailed: true if unable to retrieve stack (instead of fake empty data).
 */
export async function getStackStatus(peloton: PelotonClient): Promise<StackStatusResult> {
  const stack = await peloton.viewUserStackGraphQL();
  if (!stack) {
    return {
      numClasses: 0,
      classes: [],
      error: "Unable to fetch stack status from Peloton",
      fetchFailed: true,
    };
  }

  return {
    numClasses: stack.numClasses,
    totalTime: stack.totalTime,
    classes: stack.userStack?.stackedClassList.map(item => ({
      classId: item.pelotonClass.classId,
      title: item.pelotonClass.title,
      duration: item.pelotonClass.duration,
      discipline: item.pelotonClass.fitnessDiscipline?.displayName,
      instructor: item.pelotonClass.instructor?.name,
      order: item.playOrder,
    })) ?? [],
  };
}
