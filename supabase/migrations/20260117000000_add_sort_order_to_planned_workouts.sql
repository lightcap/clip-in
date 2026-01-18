-- Add sort_order column to planned_workouts for drag-and-drop reordering
ALTER TABLE planned_workouts
ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

-- Create index for efficient ordering queries
CREATE INDEX IF NOT EXISTS idx_planned_workouts_sort_order
ON planned_workouts(user_id, scheduled_date, sort_order);
