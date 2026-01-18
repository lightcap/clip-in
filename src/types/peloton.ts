export interface PelotonTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

export interface PelotonUser {
  id: string;
  username: string;
  email: string;
  name: string;
  image_url: string;
  cycling_ftp: number;
  cycling_ftp_source: string | null;
  cycling_ftp_workout_id: string | null;
  estimated_cycling_ftp: number | null;
  created_at: number;
}

export interface PelotonWorkout {
  id: string;
  created_at: number;
  status: string;
  fitness_discipline: string;
  ride?: PelotonRide;
  ftp_info?: {
    ftp: number;
    ftp_source: string | null;
    ftp_workout_id: string | null;
  };
}

export interface PelotonRide {
  id: string;
  title: string;
  description: string;
  duration: number;
  difficulty_estimate: number;
  image_url: string;
  instructor_id?: string;
  instructor?: PelotonInstructor;
  fitness_discipline: string;
  fitness_discipline_display_name: string;
}

export interface PelotonInstructor {
  id: string;
  name: string;
  image_url: string;
}

export interface PelotonPerformanceGraph {
  duration: number;
  average_summaries: Array<{
    display_name: string;
    display_unit: string;
    value: number;
    slug: string;
  }>;
  summaries: Array<{
    display_name: string;
    display_unit: string;
    value: number;
    slug: string;
  }>;
}

export interface FtpTestResult {
  date: Date;
  workoutId: string;
  rideTitle: string | null;
  avgOutput: number | null;
  calculatedFtp: number | null;
  baselineFtp: number;
  source: string | null;
}

export interface PelotonSearchParams {
  browse_category?: string;
  content_format?: string;
  duration?: number[];
  fitness_discipline?: string;
  instructor_id?: string;
  sort_by?: string;
  page?: number;
  limit?: number;
  muscle_group?: string;
}

export interface PelotonSearchResponse {
  data: PelotonRide[];
  instructors?: PelotonInstructor[];
  page: number;
  page_count: number;
  total: number;
  limit: number;
}

// Muscle groups available in Peloton strength classes
export const MUSCLE_GROUPS = [
  { id: "arms", label: "Arms", subgroups: ["biceps", "triceps", "forearms"] },
  { id: "back", label: "Back", subgroups: ["lats", "upper_back", "lower_back"] },
  { id: "chest", label: "Chest", subgroups: [] },
  { id: "core", label: "Core", subgroups: ["abs", "obliques"] },
  { id: "glutes", label: "Glutes", subgroups: [] },
  { id: "legs", label: "Legs", subgroups: ["quads", "hamstrings", "calves"] },
  { id: "shoulders", label: "Shoulders", subgroups: [] },
  { id: "full_body", label: "Full Body", subgroups: [] },
] as const;

export type MuscleGroup = (typeof MUSCLE_GROUPS)[number]["id"];

// Stack management types
export interface PelotonStackClass {
  id: string;
  peloton_id: string;
  title: string;
  duration: number;
  image_url: string;
  instructor?: PelotonInstructor;
  fitness_discipline: string;
}

export interface PelotonStack {
  id: string;
  classes: PelotonStackClass[];
  total_classes: number;
}
