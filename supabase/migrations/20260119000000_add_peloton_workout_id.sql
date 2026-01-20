-- Add peloton_workout_id to planned_workouts table
-- This stores the Peloton workout instance ID after completion is detected,
-- preventing double-matching and allowing lookup of workout details.

ALTER TABLE planned_workouts
ADD COLUMN peloton_workout_id TEXT;

-- Unique partial index to ensure each Peloton workout can only match one planned workout
-- This enforces the constraint at the database level and provides efficient lookup
CREATE UNIQUE INDEX idx_planned_workouts_peloton_workout_id
ON planned_workouts(peloton_workout_id)
WHERE peloton_workout_id IS NOT NULL;
