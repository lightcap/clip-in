import { PelotonClient } from "./client";
import type { PelotonWorkout } from "@/types/peloton";
import type { SupabaseClient } from "@supabase/supabase-js";
import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";

export interface CompletionSyncResult {
  success: boolean;
  matched: number;
  error?: string;
}

interface PlannedWorkoutMatch {
  id: string;
  peloton_ride_id: string;
  sort_order: number;
  peloton_workout_id: string | null;
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
 * Convert a Unix timestamp to a date string in the user's timezone.
 */
function timestampToDateInTimezone(timestamp: number, timezone?: string): string {
  const date = new Date(timestamp * 1000);
  if (timezone && isValidTimezone(timezone)) {
    try {
      const zonedDate = toZonedTime(date, timezone);
      return format(zonedDate, "yyyy-MM-dd");
    } catch (error) {
      console.error(`Timezone conversion failed for "${timezone}", using UTC:`, error);
    }
  }
  return format(date, "yyyy-MM-dd");
}

/**
 * Sync completed workouts from Peloton to our planned workouts.
 *
 * This function:
 * 1. Fetches recent completed workouts from Peloton (last 20)
 * 2. For each completed workout, finds planned workouts with matching:
 *    - peloton_ride_id (class ID)
 *    - scheduled_date (exact match with completion date)
 * 3. Uses FIFO matching if multiple planned workouts exist (by sort_order)
 * 4. Skips if peloton_workout_id already set (already matched)
 * 5. Marks matched workouts as completed
 */
export async function syncCompletedWorkouts(
  userId: string,
  pelotonUserId: string,
  peloton: PelotonClient,
  supabase: SupabaseClient,
  options?: { timezone?: string }
): Promise<CompletionSyncResult> {
  try {
    // 1. Fetch recent completed workouts from Peloton
    const response = await peloton.getUserWorkouts(pelotonUserId, {
      limit: 20,
      joins: "ride",
    });

    const completedWorkouts = response.data.filter(
      (w: PelotonWorkout) => w.status === "COMPLETE" && w.ride?.id
    );

    if (completedWorkouts.length === 0) {
      return { success: true, matched: 0 };
    }

    // 2. Get all planned workouts that could potentially match
    // (status = planned AND no peloton_workout_id yet)
    const { data: plannedWorkouts, error: fetchError } = await supabase
      .from("planned_workouts")
      .select("id, peloton_ride_id, scheduled_date, sort_order, peloton_workout_id")
      .eq("user_id", userId)
      .eq("status", "planned")
      .is("peloton_workout_id", null);

    if (fetchError) {
      return {
        success: false,
        matched: 0,
        error: `Failed to fetch planned workouts: ${fetchError.message}`,
      };
    }

    if (!plannedWorkouts || plannedWorkouts.length === 0) {
      return { success: true, matched: 0 };
    }

    // 3. Build a map for efficient lookup: date -> ride_id -> planned workouts (sorted by sort_order)
    const plannedByDateAndRide = new Map<string, Map<string, PlannedWorkoutMatch[]>>();
    for (const pw of plannedWorkouts) {
      const dateKey = pw.scheduled_date;
      if (!plannedByDateAndRide.has(dateKey)) {
        plannedByDateAndRide.set(dateKey, new Map());
      }
      const byRide = plannedByDateAndRide.get(dateKey)!;
      if (!byRide.has(pw.peloton_ride_id)) {
        byRide.set(pw.peloton_ride_id, []);
      }
      byRide.get(pw.peloton_ride_id)!.push({
        id: pw.id,
        peloton_ride_id: pw.peloton_ride_id,
        sort_order: pw.sort_order,
        peloton_workout_id: pw.peloton_workout_id,
      });
    }

    // Sort each list by sort_order for FIFO matching
    for (const byDate of plannedByDateAndRide.values()) {
      for (const workouts of byDate.values()) {
        workouts.sort((a, b) => a.sort_order - b.sort_order);
      }
    }

    // 4. Match completed workouts to planned workouts
    const successfulUpdates: string[] = [];
    const matchedPelotonWorkoutIds = new Set<string>();
    const attemptedIds: string[] = [];
    let failedUpdates = 0;

    for (const completedWorkout of completedWorkouts) {
      const rideId = completedWorkout.ride!.id;
      const completionDate = timestampToDateInTimezone(
        completedWorkout.created_at,
        options?.timezone
      );

      // Skip if we've already matched this Peloton workout in this sync run
      if (matchedPelotonWorkoutIds.has(completedWorkout.id)) {
        continue;
      }

      // Look up planned workouts for this date and ride
      const byDate = plannedByDateAndRide.get(completionDate);
      if (!byDate) continue;

      const candidates = byDate.get(rideId);
      if (!candidates || candidates.length === 0) continue;

      // FIFO: take the first unmatched one
      const match = candidates.find(
        (c) => !attemptedIds.includes(c.id)
      );
      if (!match) continue;

      attemptedIds.push(match.id);
      matchedPelotonWorkoutIds.add(completedWorkout.id);

      // Update the planned workout
      const { error: updateError } = await supabase
        .from("planned_workouts")
        .update({
          status: "completed",
          completed_at: new Date(completedWorkout.created_at * 1000).toISOString(),
          peloton_workout_id: completedWorkout.id,
        })
        .eq("id", match.id);

      if (updateError) {
        console.error(`Failed to update planned workout ${match.id}:`, updateError);
        failedUpdates++;
      } else {
        successfulUpdates.push(match.id);
      }
    }

    return {
      success: failedUpdates === 0,
      matched: successfulUpdates.length,
      error: failedUpdates > 0
        ? `${failedUpdates} workout(s) failed to update in database`
        : undefined,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Completion sync error:", error);
    return {
      success: false,
      matched: 0,
      error: message,
    };
  }
}
