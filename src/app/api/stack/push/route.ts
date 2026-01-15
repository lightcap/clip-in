import { NextResponse } from "next/server";
import { createUntypedClient } from "@/lib/supabase/admin";
import { PelotonClient, PelotonAuthError } from "@/lib/peloton/client";
import { format, addDays } from "date-fns";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { date, clearExisting = false } = body;

    const supabase = await createUntypedClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user's Peloton tokens
    const { data: tokens, error: tokensError } = await supabase
      .from("peloton_tokens")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (tokensError || !tokens) {
      return NextResponse.json(
        { error: "Peloton not connected" },
        { status: 400 }
      );
    }

    // Check if token is expired
    if (new Date(tokens.expires_at) < new Date()) {
      return NextResponse.json(
        { error: "Peloton token expired. Please reconnect." },
        { status: 401 }
      );
    }

    const peloton = new PelotonClient(tokens.access_token_encrypted);

    // Get planned workouts for the target date (default: tomorrow)
    const targetDate = date || format(addDays(new Date(), 1), "yyyy-MM-dd");

    const { data: workouts, error: workoutsError } = await supabase
      .from("planned_workouts")
      .select("*")
      .eq("user_id", user.id)
      .eq("scheduled_date", targetDate)
      .eq("status", "planned")
      .eq("pushed_to_stack", false);

    if (workoutsError) {
      console.error("Failed to fetch workouts:", workoutsError);
      return NextResponse.json(
        { error: "Failed to fetch planned workouts" },
        { status: 500 }
      );
    }

    if (!workouts || workouts.length === 0) {
      return NextResponse.json({
        message: "No workouts to push",
        pushed: 0,
        failed: 0,
      });
    }

    // Clear existing stack if requested
    if (clearExisting) {
      const cleared = await peloton.clearStack();
      if (!cleared) {
        console.error("Failed to clear existing stack");
      }
    }

    // Push workouts to stack
    const rideIds = workouts
      .map((w: { peloton_ride_id: string | null }) => w.peloton_ride_id)
      .filter((id: string | null): id is string => id !== null);

    const results = await peloton.pushWorkoutsToStack(rideIds);

    // Mark successfully pushed workouts
    if (results.success.length > 0) {
      const successfulWorkoutIds = workouts
        .filter((w: { id: string; peloton_ride_id: string | null }) => w.peloton_ride_id && results.success.includes(w.peloton_ride_id))
        .map((w: { id: string }) => w.id);

      const { error: updateError } = await supabase
        .from("planned_workouts")
        .update({ pushed_to_stack: true })
        .in("id", successfulWorkoutIds);

      if (updateError) {
        console.error("Failed to mark workouts as pushed:", updateError);
      }
    }

    // Log the sync operation
    const { error: logError } = await supabase.from("stack_sync_logs").insert({
      user_id: user.id,
      sync_type: "manual" as const,
      workouts_pushed: results.success.length,
      success: results.failed.length === 0,
      error_message:
        results.failed.length > 0
          ? `Failed to push ${results.failed.length} workout(s)`
          : null,
    });

    if (logError) {
      console.error("Failed to log sync operation:", logError);
    }

    return NextResponse.json({
      message: `Pushed ${results.success.length} workout(s) to stack`,
      pushed: results.success.length,
      failed: results.failed.length,
      targetDate,
    });
  } catch (error) {
    console.error("Stack push error:", error);

    if (error instanceof PelotonAuthError) {
      return NextResponse.json(
        { error: "Peloton authentication failed. Please reconnect." },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// GET endpoint to check stack status
export async function GET() {
  try {
    const supabase = await createUntypedClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user's Peloton tokens
    const { data: tokens, error: tokensError } = await supabase
      .from("peloton_tokens")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (tokensError || !tokens) {
      return NextResponse.json(
        { error: "Peloton not connected" },
        { status: 400 }
      );
    }

    // Check if token is expired
    if (new Date(tokens.expires_at) < new Date()) {
      return NextResponse.json(
        { error: "Peloton token expired. Please reconnect." },
        { status: 401 }
      );
    }

    const peloton = new PelotonClient(tokens.access_token_encrypted);
    const stack = await peloton.getStack();

    // Get recent sync logs
    const { data: syncLogs } = await supabase
      .from("stack_sync_logs")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(5);

    return NextResponse.json({
      stack,
      recentSyncs: syncLogs || [],
    });
  } catch (error) {
    console.error("Stack status error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
