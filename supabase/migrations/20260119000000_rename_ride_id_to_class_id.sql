-- Rename peloton_ride_id to peloton_class_id for terminology consistency
-- Peloton uses "classId" in their modern GraphQL API, not "rideId"

-- Rename the column in planned_workouts table
ALTER TABLE planned_workouts
RENAME COLUMN peloton_ride_id TO peloton_class_id;
