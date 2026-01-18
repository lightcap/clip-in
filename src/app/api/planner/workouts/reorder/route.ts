import { NextResponse } from "next/server";
import { createUntypedClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { date, workoutIds } = body;

    if (!date || !Array.isArray(workoutIds)) {
      return NextResponse.json(
        { error: "Missing required fields: date and workoutIds" },
        { status: 400 }
      );
    }

    const supabase = await createUntypedClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Update sort_order for each workout
    const updates = workoutIds.map((id: string, index: number) =>
      supabase
        .from("planned_workouts")
        .update({ sort_order: index })
        .eq("id", id)
        .eq("user_id", user.id)
        .then((result: { error: unknown }) => ({ id, index, error: result.error }))
    );

    const results = await Promise.all(updates);
    const failures = results.filter((r) => r.error);

    if (failures.length > 0) {
      console.error(
        "Failed to update some workouts:",
        failures.map((f) => ({ id: f.id, error: f.error }))
      );
      return NextResponse.json(
        { error: `Failed to update ${failures.length} workout(s)` },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Reorder workouts error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
