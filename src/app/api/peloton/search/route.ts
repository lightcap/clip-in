import { NextResponse } from "next/server";
import { createUntypedClient } from "@/lib/supabase/admin";
import { PelotonClient, PelotonAuthError } from "@/lib/peloton/client";
import { refreshPelotonToken } from "@/lib/peloton/refresh";
import { decryptToken, DecryptionError } from "@/lib/crypto";
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

    // Get user's Peloton tokens
    const { data: tokenData, error: tokenError } = await supabase
      .from("peloton_tokens")
      .select("access_token_encrypted, refresh_token_encrypted")
      .eq("user_id", user.id)
      .single();

    if (tokenError) {
      console.error("Failed to fetch Peloton token:", tokenError);
      return NextResponse.json(
        { error: "Failed to verify Peloton connection" },
        { status: 500 }
      );
    }

    if (!tokenData?.access_token_encrypted) {
      return NextResponse.json(
        { error: "Peloton not connected" },
        { status: 400 }
      );
    }

    const pelotonClient = new PelotonClient(decryptToken(tokenData.access_token_encrypted));

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
      const durationNum = parseInt(duration, 10);
      if (!isNaN(durationNum) && durationNum > 0) {
        params.duration = [durationNum * 60];
      }
    }

    const page = searchParams.get("page");
    if (page) {
      const pageNum = parseInt(page, 10);
      if (!isNaN(pageNum) && pageNum >= 0) {
        params.page = pageNum;
      }
    }

    const limit = searchParams.get("limit");
    if (limit) {
      const limitNum = parseInt(limit, 10);
      if (!isNaN(limitNum) && limitNum > 0 && limitNum <= 100) {
        params.limit = limitNum;
      }
    }

    try {
      const results = await pelotonClient.searchRides(params);

      // Build instructor lookup map from top-level instructors array
      const instructorMap = new Map(
        (results.instructors ?? []).map((i) => [i.id, i.name])
      );

      // Transform the response to include instructor names
      // Check nested instructor first (from joins), then lookup from instructors array
      const classes = results.data.map((ride) => ({
        id: ride.id,
        title: ride.title,
        description: ride.description,
        duration: ride.duration,
        difficulty_estimate: ride.difficulty_estimate,
        image_url: ride.image_url,
        instructor_name:
          ride.instructor?.name ??
          (ride.instructor_id ? instructorMap.get(ride.instructor_id) : null) ??
          null,
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
        // Attempt token refresh before failing
        if (tokenData.refresh_token_encrypted) {
          const refreshResult = await refreshPelotonToken(
            user.id,
            decryptToken(tokenData.refresh_token_encrypted)
          );

          if (refreshResult.success) {
            // Retry with refreshed token - get updated token from DB
            const { data: newTokenData, error: refetchError } = await supabase
              .from("peloton_tokens")
              .select("access_token_encrypted")
              .eq("user_id", user.id)
              .single();

            if (refetchError) {
              console.error("Failed to refetch token after refresh:", refetchError);
              return NextResponse.json(
                { error: "Failed to retrieve refreshed credentials. Please try again." },
                { status: 500 }
              );
            }

            if (newTokenData?.access_token_encrypted) {
              try {
                const newClient = new PelotonClient(decryptToken(newTokenData.access_token_encrypted));
                const results = await newClient.searchRides(params);

                // Build instructor lookup map from top-level instructors array
                const instructorMap = new Map(
                  (results.instructors ?? []).map((i) => [i.id, i.name])
                );

                const classes = results.data.map((ride) => ({
                  id: ride.id,
                  title: ride.title,
                  description: ride.description,
                  duration: ride.duration,
                  difficulty_estimate: ride.difficulty_estimate,
                  image_url: ride.image_url,
                  instructor_name:
                    ride.instructor?.name ??
                    (ride.instructor_id ? instructorMap.get(ride.instructor_id) : null) ??
                    null,
                  fitness_discipline: ride.fitness_discipline,
                  fitness_discipline_display_name: ride.fitness_discipline_display_name,
                }));

                return NextResponse.json({
                  classes,
                  page: results.page,
                  page_count: results.page_count,
                  total: results.total,
                });
              } catch (retryError) {
                // Re-throw DecryptionError to be handled by outer catch
                if (retryError instanceof DecryptionError) {
                  throw retryError;
                }
                console.error("Search failed after token refresh:", retryError);
                return NextResponse.json(
                  { error: "Search failed after refreshing credentials. Please try again." },
                  { status: 500 }
                );
              }
            }
          }
        }

        return NextResponse.json(
          { error: "Token expired. Please reconnect your Peloton account.", tokenExpired: true },
          { status: 401 }
        );
      }
      throw error;
    }
  } catch (error) {
    if (error instanceof DecryptionError) {
      return NextResponse.json(
        { error: error.message, tokenExpired: true },
        { status: 401 }
      );
    }
    console.error("Peloton search error:", error);
    return NextResponse.json(
      { error: "Failed to search classes. Please try again later." },
      { status: 500 }
    );
  }
}
