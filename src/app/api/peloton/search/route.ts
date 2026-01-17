import { NextResponse } from "next/server";
import { createUntypedClient } from "@/lib/supabase/admin";
import { PelotonClient, PelotonAuthError } from "@/lib/peloton/client";
import type { PelotonSearchParams } from "@/types/peloton";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const supabase = await createUntypedClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user's Peloton token
    const { data: tokenData } = await supabase
      .from("peloton_tokens")
      .select("access_token_encrypted")
      .eq("user_id", user.id)
      .single();

    if (!tokenData?.access_token_encrypted) {
      return NextResponse.json(
        { error: "Peloton not connected" },
        { status: 400 }
      );
    }

    const pelotonClient = new PelotonClient(tokenData.access_token_encrypted);

    // Build search params from query string
    const params: PelotonSearchParams = {
      content_format: "video",
      sort_by: "original_air_time",
      limit: 20,
    };

    const discipline = searchParams.get("discipline");
    if (discipline) {
      params.browse_category = discipline;
    }

    const duration = searchParams.get("duration");
    if (duration) {
      params.duration = [parseInt(duration) * 60];
    }

    const page = searchParams.get("page");
    if (page) {
      params.page = parseInt(page);
    }

    const limit = searchParams.get("limit");
    if (limit) {
      params.limit = parseInt(limit);
    }

    try {
      const results = await pelotonClient.searchRides(params);

      // Transform the response to include instructor names
      const classes = results.data.map((ride) => ({
        id: ride.id,
        title: ride.title,
        description: ride.description,
        duration: ride.duration,
        difficulty_estimate: ride.difficulty_estimate,
        image_url: ride.image_url,
        instructor_name: ride.instructor?.name ?? "Unknown",
        fitness_discipline: ride.fitness_discipline,
        fitness_discipline_display_name: ride.fitness_discipline_display_name,
      }));

      return NextResponse.json({
        classes,
        page: results.page,
        page_count: results.page_count,
        total: results.total,
      });
    } catch (error) {
      if (error instanceof PelotonAuthError) {
        return NextResponse.json(
          { error: "Token expired. Please reconnect your Peloton account.", tokenExpired: true },
          { status: 401 }
        );
      }
      throw error;
    }
  } catch (error) {
    console.error("Peloton search error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
