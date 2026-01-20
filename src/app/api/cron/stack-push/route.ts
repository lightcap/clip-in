import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { PelotonClient, PelotonAuthError } from "@/lib/peloton/client";
import { format, addDays } from "date-fns";
import { decryptToken, DecryptionError } from "@/lib/crypto";

// This endpoint is called by Vercel Cron daily at midnight (configured in vercel.json)
// It pushes TOMORROW's planned workouts to each user's Peloton stack

export async function GET(request: Request) {
  try {
    // Verify cron secret to prevent unauthorized access
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Use service role for admin access to all users
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Get all users with Peloton connected and valid tokens
    const { data: tokens, error: tokensError } = await supabase
      .from("peloton_tokens")
      .select("*, profiles!inner(*)")
      .gt("expires_at", new Date().toISOString());

    if (tokensError) {
      console.error("Failed to fetch tokens:", tokensError);
      return NextResponse.json(
        { error: "Failed to fetch user tokens" },
        { status: 500 }
      );
    }

    if (!tokens || tokens.length === 0) {
      return NextResponse.json({
        message: "No users with valid Peloton tokens",
        processed: 0,
      });
    }

    const targetDate = format(addDays(new Date(), 1), "yyyy-MM-dd");
    const results = {
      processed: 0,
      success: 0,
      failed: 0,
      errors: [] as string[],
    };

    for (const userToken of tokens) {
      results.processed++;

      try {
        // Get planned workouts for tomorrow
        const { data: workouts, error: workoutsError } = await supabase
          .from("planned_workouts")
          .select("*")
          .eq("user_id", userToken.user_id)
          .eq("scheduled_date", targetDate)
          .eq("status", "planned")
          .eq("pushed_to_stack", false);

        if (workoutsError) {
          // Database error - count as failure, not success
          console.error(`Database error fetching workouts for user ${userToken.user_id}:`, workoutsError);
          results.failed++;
          results.errors.push(`Database error for user ${userToken.user_id}: ${workoutsError.message}`);
          continue;
        }

        if (!workouts || workouts.length === 0) {
          // No workouts to push, still count as success
          results.success++;
          continue;
        }

        const peloton = new PelotonClient(decryptToken(userToken.access_token_encrypted));

        // Push workouts to stack
        const rideIds = workouts
          .map((w) => w.peloton_ride_id)
          .filter((id): id is string => id !== null);

        const pushResults = await peloton.pushWorkoutsToStack(rideIds);

        // Mark successfully pushed workouts
        if (pushResults.success.length > 0) {
          const successfulWorkoutIds = workouts
            .filter(
              (w) =>
                w.peloton_ride_id &&
                pushResults.success.includes(w.peloton_ride_id)
            )
            .map((w) => w.id);

          const { error: updateError } = await supabase
            .from("planned_workouts")
            .update({ pushed_to_stack: true })
            .in("id", successfulWorkoutIds);

          if (updateError) {
            console.error(`Failed to mark workouts as pushed for user ${userToken.user_id}:`, updateError);
          }
        }

        // Log the sync operation
        await supabase.from("stack_sync_logs").insert({
          user_id: userToken.user_id,
          sync_type: "scheduled" as const,
          workouts_pushed: pushResults.success.length,
          success: pushResults.failed.length === 0,
          error_message:
            pushResults.failed.length > 0
              ? `Failed to push ${pushResults.failed.length} workout(s)`
              : null,
        });

        results.success++;
      } catch (error) {
        results.failed++;
        let errorMessage: string;
        if (error instanceof DecryptionError) {
          errorMessage = `Decryption error for user ${userToken.user_id}: ${error.message}`;
        } else if (error instanceof PelotonAuthError) {
          errorMessage = `Auth error for user ${userToken.user_id}`;
        } else {
          errorMessage = `Error for user ${userToken.user_id}: ${error instanceof Error ? error.message : "Unknown error"}`;
        }

        results.errors.push(errorMessage);

        // Log the failed sync
        await supabase.from("stack_sync_logs").insert({
          user_id: userToken.user_id,
          sync_type: "scheduled" as const,
          workouts_pushed: 0,
          success: false,
          error_message: errorMessage,
        });
      }
    }

    console.log("Cron stack push results:", results);

    return NextResponse.json({
      message: `Processed ${results.processed} users`,
      ...results,
      targetDate,
    });
  } catch (error) {
    console.error("Cron stack push error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
