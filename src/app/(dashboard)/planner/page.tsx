"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  pointerWithin,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Minus,
  Clock,
  User,
  Trash2,
  GripVertical,
  Check,
  CalendarCheck,
  CalendarIcon,
  AlertCircle,
  Loader2,
  CheckCircle2,
  CloudUpload,
  Lock,
  MoreVertical,
  Info,
  CalendarDays,
  Copy,
  ExternalLink,
} from "lucide-react";
import {
  format,
  eachDayOfInterval,
  addDays,
  subDays,
  isSameDay,
  isToday,
  isPast,
  startOfDay,
  parseISO,
} from "date-fns";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { toast } from "sonner";
import { useAuthStore } from "@/lib/stores/auth-store";
import { useUndo } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { getDisciplineLabel, getDisciplineColor } from "@/types/peloton";

interface PlannedWorkout {
  id: string;
  peloton_class_id: string;
  ride_title: string;
  ride_image_url: string | null;
  instructor_name: string | null;
  duration_seconds: number;
  discipline: string;
  scheduled_date: string;
  scheduled_time: string | null;
  status: "planned" | "completed" | "skipped" | "postponed";
  pushed_to_stack: boolean;
  sort_order?: number;
}

const MIN_DAYS = 3;
const MAX_DAYS = 14;

export default function PlannerPage() {
  const searchParams = useSearchParams();
  // URL date parameter (e.g., /planner?date=2024-01-15)
  // Expected format: YYYY-MM-DD. Invalid formats are silently ignored (falls back to today).
  // The URL is only read on mount and browser navigation - internal navigation within the
  // planner updates local state but does not update the URL to avoid polluting browser history.
  const dateParam = searchParams.get("date");

  const { isPelotonConnected, pelotonTokenStatus } = useAuthStore();
  const { executeWithUndo } = useUndo({ toastDuration: 5000 });
  const [startDate, setStartDate] = useState(() => {
    if (dateParam) {
      const parsed = parseISO(dateParam);
      if (!isNaN(parsed.getTime())) {
        return startOfDay(parsed);
      }
    }
    return startOfDay(new Date());
  });
  const [numberOfDays, setNumberOfDays] = useState(MIN_DAYS);
  const [workouts, setWorkouts] = useState<PlannedWorkout[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isPushing, setIsPushing] = useState(false);
  const [pushResult, setPushResult] = useState<{ success: boolean; message: string } | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(() => {
    if (dateParam) {
      const parsed = parseISO(dateParam);
      if (!isNaN(parsed.getTime())) {
        return startOfDay(parsed);
      }
    }
    return startOfDay(new Date());
  });
  const [activeId, setActiveId] = useState<string | null>(null);

  // Sync state when URL date parameter changes (e.g., browser back/forward)
  useEffect(() => {
    if (dateParam) {
      const parsed = parseISO(dateParam);
      if (!isNaN(parsed.getTime())) {
        const newDate = startOfDay(parsed);
        setStartDate(newDate);
        setSelectedDate(newDate);
      }
    }
  }, [dateParam]);

  // Ref to track the current fetch request and cancel stale ones
  const abortControllerRef = useRef<AbortController | null>(null);
  // Ref to track the current expected start date - updated on every render
  // Used to discard responses from stale fetches (e.g., from React Strict Mode double-mounting)
  const currentStartDateRef = useRef(format(startDate, "yyyy-MM-dd"));
  currentStartDateRef.current = format(startDate, "yyyy-MM-dd");

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const endDate = addDays(startDate, numberOfDays - 1);
  const displayDays = eachDayOfInterval({ start: startDate, end: endDate });

  const fetchWorkouts = useCallback(async () => {
    if (!isPelotonConnected) {
      setIsLoading(false);
      return;
    }

    // Cancel any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    // Capture the date range for this specific fetch
    const fetchStartDate = format(startDate, "yyyy-MM-dd");
    const end = addDays(startDate, numberOfDays - 1);

    try {
      const response = await fetch(
        `/api/planner/workouts?start=${fetchStartDate}&end=${format(end, "yyyy-MM-dd")}`,
        { signal: abortController.signal }
      );
      if (!response.ok) {
        throw new Error(`Failed to load workouts (${response.status})`);
      }
      const data = await response.json();

      // Only update state if this response matches the current expected date range
      // This handles race conditions from React Strict Mode or rapid state changes
      if (!abortController.signal.aborted && fetchStartDate === currentStartDateRef.current) {
        setWorkouts(data.workouts || []);
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }
      console.error("Failed to fetch workouts:", error);
      toast.error("Failed to load workouts. Please try again.");
    } finally {
      if (!abortController.signal.aborted && fetchStartDate === currentStartDateRef.current) {
        setIsLoading(false);
      }
    }
  }, [isPelotonConnected, startDate, numberOfDays]);

  useEffect(() => {
    fetchWorkouts();
    // Cleanup: abort any in-flight request when dependencies change or component unmounts
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchWorkouts]);

  const getWorkoutsForDay = (date: Date) =>
    workouts
      .filter((w) => isSameDay(parseISO(w.scheduled_date), date))
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  const handleDeleteWorkout = async (workoutId: string) => {
    // Find the workout being deleted (for undo data)
    const deletedWorkout = workouts.find((w) => w.id === workoutId);
    if (!deletedWorkout) return;

    // Store previous state for potential rollback
    const previousWorkouts = workouts;

    await executeWithUndo({
      type: "delete_workout",
      data: deletedWorkout,
      message: "Workout removed",
      execute: async () => {
        // Optimistic update - remove immediately
        setWorkouts((prev) => prev.filter((w) => w.id !== workoutId));

        let response;
        try {
          response = await fetch(`/api/planner/workouts/${workoutId}`, {
            method: "DELETE",
          });
        } catch (error) {
          console.error("Failed to delete workout:", error);
          setWorkouts(previousWorkouts);
          toast.error("Failed to remove workout. Please check your connection.");
          throw error;
        }

        if (!response.ok) {
          console.error("Failed to delete workout: Server returned", response.status);
          setWorkouts(previousWorkouts);
          toast.error("Failed to remove workout. Please try again.");
          throw new Error(`Delete failed: ${response.status}`);
        }
      },
      undo: async () => {
        // Re-add the workout via API
        let response;
        try {
          response = await fetch("/api/planner/workouts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              peloton_class_id: deletedWorkout.peloton_class_id,
              ride_title: deletedWorkout.ride_title,
              ride_image_url: deletedWorkout.ride_image_url,
              instructor_name: deletedWorkout.instructor_name,
              duration_seconds: deletedWorkout.duration_seconds,
              discipline: deletedWorkout.discipline,
              scheduled_date: deletedWorkout.scheduled_date,
              scheduled_time: deletedWorkout.scheduled_time,
              status: deletedWorkout.status,
            }),
          });
        } catch (error) {
          console.error("Failed to restore workout:", error);
          throw error;
        }

        if (!response.ok) {
          console.error("Failed to restore workout: Server returned", response.status);
          throw new Error("Failed to restore workout");
        }
        fetchWorkouts();
      },
    });
  };

  const handleStatusChange = async (
    workoutId: string,
    status: PlannedWorkout["status"]
  ) => {
    // Find the workout and its previous status
    const workout = workouts.find((w) => w.id === workoutId);
    if (!workout) return;

    const previousStatus = workout.status;
    const previousWorkouts = workouts;

    // Create descriptive message based on status change
    const statusLabels: Record<PlannedWorkout["status"], string> = {
      planned: "marked as planned",
      completed: "marked as complete",
      skipped: "marked as skipped",
      postponed: "marked as postponed",
    };
    const message = `Workout ${statusLabels[status]}`;

    await executeWithUndo({
      type: "status_change",
      data: { workoutId, previousStatus, newStatus: status },
      message,
      execute: async () => {
        // Optimistic update - change status immediately
        setWorkouts((prev) =>
          prev.map((w) => (w.id === workoutId ? { ...w, status } : w))
        );

        let response;
        try {
          response = await fetch(`/api/planner/workouts/${workoutId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status }),
          });
        } catch (error) {
          console.error("Failed to update workout:", error);
          setWorkouts(previousWorkouts);
          toast.error("Failed to update workout. Please check your connection.");
          throw error;
        }

        if (!response.ok) {
          console.error("Failed to update workout status: Server returned", response.status);
          setWorkouts(previousWorkouts);
          toast.error("Failed to update workout status. Please try again.");
          throw new Error(`Status update failed: ${response.status}`);
        }
      },
      undo: async () => {
        // Revert to previous status (optimistic)
        setWorkouts((prev) =>
          prev.map((w) => (w.id === workoutId ? { ...w, status: previousStatus } : w))
        );

        let response;
        try {
          response = await fetch(`/api/planner/workouts/${workoutId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: previousStatus }),
          });
        } catch (error) {
          console.error("Failed to undo status change:", error);
          // Revert the optimistic undo
          setWorkouts((prev) =>
            prev.map((w) => (w.id === workoutId ? { ...w, status } : w))
          );
          throw error;
        }

        if (!response.ok) {
          console.error("Failed to undo status change: Server returned", response.status);
          // Revert the optimistic undo
          setWorkouts((prev) =>
            prev.map((w) => (w.id === workoutId ? { ...w, status } : w))
          );
          throw new Error("Failed to undo status change");
        }
      },
    });
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over || active.id === over.id) return;

    const activeWorkout = workouts.find((w) => w.id === active.id);
    if (!activeWorkout) return;

    // Prevent moving completed workouts (defensive check)
    if (activeWorkout.status === "completed") return;

    // Determine the target date
    let targetDate: string;
    const overId = over.id as string;

    if (overId.startsWith("day-")) {
      // Dropped on a day container
      targetDate = overId.replace("day-", "");
    } else {
      // Dropped on another workout card
      const overWorkout = workouts.find((w) => w.id === overId);
      if (!overWorkout) return;
      targetDate = overWorkout.scheduled_date;
    }

    // Check if target day is in the past (not editable)
    const targetDayDate = parseISO(targetDate);
    const isTargetPast = isPast(targetDayDate) && !isToday(targetDayDate);
    if (isTargetPast) return;

    // Cross-day move
    if (activeWorkout.scheduled_date !== targetDate) {
      const previousWorkouts = workouts;
      const previousDate = activeWorkout.scheduled_date;

      // Get workouts in target day to determine sort_order
      const targetDayWorkouts = workouts
        .filter((w) => w.scheduled_date === targetDate)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

      // If dropped on a workout, insert at that position; otherwise append to end
      let newSortOrder: number;
      if (!overId.startsWith("day-")) {
        const overWorkout = workouts.find((w) => w.id === overId);
        newSortOrder = overWorkout?.sort_order ?? targetDayWorkouts.length;
      } else {
        newSortOrder = targetDayWorkouts.length;
      }

      await executeWithUndo({
        type: "move_workout",
        data: { workoutId: activeWorkout.id, previousDate, newDate: targetDate },
        message: `Workout moved to ${format(targetDayDate, "EEE, MMM d")}`,
        execute: async () => {
          // Optimistic update
          setWorkouts((prev) =>
            prev.map((w) =>
              w.id === activeWorkout.id
                ? { ...w, scheduled_date: targetDate, sort_order: newSortOrder }
                : w
            )
          );

          // Persist to server
          let response;
          try {
            response = await fetch(`/api/planner/workouts/${activeWorkout.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ scheduled_date: targetDate }),
            });
          } catch (error) {
            console.error("Failed to move workout:", error);
            setWorkouts(previousWorkouts);
            toast.error("Failed to move workout. Please check your connection.");
            throw error;
          }

          if (!response.ok) {
            console.error("Failed to move workout: Server returned", response.status);
            setWorkouts(previousWorkouts);
            toast.error("Failed to move workout. Please try again.");
            throw new Error(`Move failed: ${response.status}`);
          }
        },
        undo: async () => {
          // Revert to previous date (optimistic)
          setWorkouts((prev) =>
            prev.map((w) =>
              w.id === activeWorkout.id
                ? { ...w, scheduled_date: previousDate, sort_order: activeWorkout.sort_order }
                : w
            )
          );

          let response;
          try {
            response = await fetch(`/api/planner/workouts/${activeWorkout.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ scheduled_date: previousDate }),
            });
          } catch (error) {
            console.error("Failed to undo move:", error);
            setWorkouts(previousWorkouts);
            throw error;
          }

          if (!response.ok) {
            console.error("Failed to undo move: Server returned", response.status);
            setWorkouts(previousWorkouts);
            throw new Error("Failed to undo move");
          }
        },
      });
      return;
    }

    // Same-day reorder (existing logic)
    const overWorkout = workouts.find((w) => w.id === over.id);
    if (!overWorkout) return;

    const dayWorkouts = workouts
      .filter((w) => w.scheduled_date === activeWorkout.scheduled_date)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

    const oldIndex = dayWorkouts.findIndex((w) => w.id === active.id);
    const newIndex = dayWorkouts.findIndex((w) => w.id === over.id);

    const reorderedDayWorkouts = arrayMove(dayWorkouts, oldIndex, newIndex);

    const previousWorkouts = workouts;
    const previousOrder = dayWorkouts.map((w) => w.id);

    const updatedWorkouts = workouts.map((w) => {
      const reorderedIndex = reorderedDayWorkouts.findIndex((rw) => rw.id === w.id);
      if (reorderedIndex !== -1) {
        return { ...w, sort_order: reorderedIndex };
      }
      return w;
    });

    await executeWithUndo({
      type: "reorder_workouts",
      data: { date: activeWorkout.scheduled_date, previousOrder, newOrder: reorderedDayWorkouts.map((w) => w.id) },
      message: "Workouts reordered",
      execute: async () => {
        setWorkouts(updatedWorkouts);

        let response;
        try {
          response = await fetch("/api/planner/workouts/reorder", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              date: activeWorkout.scheduled_date,
              workoutIds: reorderedDayWorkouts.map((w) => w.id),
            }),
          });
        } catch (error) {
          console.error("Failed to reorder workouts:", error);
          setWorkouts(previousWorkouts);
          toast.error("Failed to save workout order. Please check your connection.");
          throw error;
        }

        if (!response.ok) {
          console.error("Failed to reorder workouts: Server returned", response.status);
          setWorkouts(previousWorkouts);
          toast.error("Failed to save workout order. Please try again.");
          throw new Error(`Reorder failed: ${response.status}`);
        }
      },
      undo: async () => {
        setWorkouts(previousWorkouts);

        let response;
        try {
          response = await fetch("/api/planner/workouts/reorder", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              date: activeWorkout.scheduled_date,
              workoutIds: previousOrder,
            }),
          });
        } catch (error) {
          console.error("Failed to undo reorder:", error);
          setWorkouts(updatedWorkouts);
          throw error;
        }

        if (!response.ok) {
          console.error("Failed to undo reorder: Server returned", response.status);
          setWorkouts(updatedWorkouts);
          throw new Error("Failed to undo reorder");
        }
      },
    });
  };

  const handleMoveToDate = async (workoutId: string, newDate: Date) => {
    const workout = workouts.find((w) => w.id === workoutId);
    if (!workout) return;

    const previousWorkouts = workouts;
    const previousDate = workout.scheduled_date;
    const newDateStr = format(newDate, "yyyy-MM-dd");

    await executeWithUndo({
      type: "move_workout",
      data: { workoutId, previousDate, newDate: newDateStr },
      message: `Workout moved to ${format(newDate, "EEE, MMM d")}`,
      execute: async () => {
        // Optimistic update
        setWorkouts((prev) =>
          prev.map((w) =>
            w.id === workoutId ? { ...w, scheduled_date: newDateStr } : w
          )
        );

        let response;
        try {
          response = await fetch(`/api/planner/workouts/${workoutId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ scheduled_date: newDateStr }),
          });
        } catch (error) {
          console.error("Failed to move workout:", error);
          setWorkouts(previousWorkouts);
          toast.error("Failed to move workout. Please check your connection.");
          throw error;
        }

        if (!response.ok) {
          console.error("Failed to move workout: Server returned", response.status);
          setWorkouts(previousWorkouts);
          toast.error("Failed to move workout. Please try again.");
          throw new Error(`Move failed: ${response.status}`);
        }
      },
      undo: async () => {
        setWorkouts((prev) =>
          prev.map((w) =>
            w.id === workoutId ? { ...w, scheduled_date: previousDate } : w
          )
        );

        let response;
        try {
          response = await fetch(`/api/planner/workouts/${workoutId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ scheduled_date: previousDate }),
          });
        } catch (error) {
          console.error("Failed to undo move:", error);
          setWorkouts(previousWorkouts);
          toast.error("Failed to undo. Please check your connection.");
          throw error;
        }

        if (!response.ok) {
          console.error("Failed to undo move: Server returned", response.status);
          setWorkouts(previousWorkouts);
          toast.error("Failed to undo move. Please try again.");
          throw new Error(`Failed to undo move: ${response.status}`);
        }
      },
    });
  };

  const handleDuplicate = async (workout: PlannedWorkout, targetDate: Date) => {
    const targetDateStr = format(targetDate, "yyyy-MM-dd");

    try {
      const response = await fetch("/api/planner/workouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          peloton_class_id: workout.peloton_class_id,
          ride_title: workout.ride_title,
          ride_image_url: workout.ride_image_url,
          instructor_name: workout.instructor_name,
          duration_seconds: workout.duration_seconds,
          discipline: workout.discipline,
          scheduled_date: targetDateStr,
          scheduled_time: workout.scheduled_time,
          status: "planned",
        }),
      });

      if (!response.ok) {
        toast.error("Failed to duplicate workout. Please try again.");
        return;
      }

      const data = await response.json();
      setWorkouts((prev) => [...prev, data.workout]);
      toast.success(`Workout duplicated to ${format(targetDate, "EEE, MMM d")}`);
    } catch (error) {
      console.error("Failed to duplicate workout:", error);
      toast.error("Failed to duplicate workout. Please check your connection.");
    }
  };

  const handlePushToStack = async () => {
    setIsPushing(true);
    setPushResult(null);

    try {
      // Sync today's workouts to stack
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const response = await fetch("/api/stack/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timezone }),
      });

      const data = await response.json();

      if (response.ok) {
        let message = data.message || `Synced ${data.pushed} workout(s) to stack`;
        if (data.warning) {
          message += ` (${data.warning})`;
        }
        setPushResult({
          success: true,
          message,
        });
        // Refresh workouts to update status
        fetchWorkouts();
      } else {
        setPushResult({
          success: false,
          message: data.error || "Failed to sync workouts",
        });
      }
    } catch (error) {
      console.error("Failed to push to stack:", error);
      setPushResult({
        success: false,
        message: "An error occurred while syncing to stack",
      });
    } finally {
      setIsPushing(false);
      // Clear the result after 5 seconds
      setTimeout(() => setPushResult(null), 5000);
    }
  };

  const handleAddDay = () => {
    if (numberOfDays < MAX_DAYS) {
      setNumberOfDays((prev) => prev + 1);
    }
  };

  const handleRemoveDay = () => {
    if (numberOfDays > MIN_DAYS) {
      setNumberOfDays((prev) => prev - 1);
    }
  };

  const handleNavigateBack = () => {
    setStartDate((prev) => subDays(prev, numberOfDays));
  };

  const handleNavigateForward = () => {
    setStartDate((prev) => addDays(prev, numberOfDays));
  };

  const handleResetToToday = () => {
    setStartDate(startOfDay(new Date()));
  };

  // Calculate stats for displayed range
  const rangeStats = {
    planned: workouts.filter((w) => w.status === "planned").length,
    completed: workouts.filter((w) => w.status === "completed").length,
    totalMinutes: workouts.reduce((acc, w) => acc + w.duration_seconds / 60, 0),
  };

  const isExpired = pelotonTokenStatus === "expired";

  // Never connected - show full-page connect prompt
  if (!isPelotonConnected) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center">
        <div className="relative mb-8">
          <div className="absolute -inset-8 rounded-full bg-primary/20 blur-3xl" />
          <div className="relative flex h-24 w-24 items-center justify-center rounded-2xl bg-primary/10">
            <CalendarCheck className="h-12 w-12 text-primary" />
          </div>
        </div>
        <h2 className="font-display text-3xl tracking-wide text-foreground mb-3">
          CONNECT PELOTON TO PLAN WORKOUTS
        </h2>
        <p className="text-muted-foreground text-center max-w-md">
          Link your Peloton account to start planning your weekly workouts and automate your stack.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-4xl tracking-wide text-foreground">
            WORKOUT PLANNER
          </h1>
          <p className="text-muted-foreground mt-1">
            Plan your workouts and automate your Peloton stack
          </p>
        </div>
        <Dialog>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Add Workout
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Workout to Plan</DialogTitle>
              <DialogDescription>
                {selectedDate
                  ? `Adding workout for ${format(selectedDate, "EEEE, MMM d")}`
                  : "Select a day first, then search for classes to add."}
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              {selectedDate ? (
                <Button variant="outline" className="w-full" asChild>
                  <a href={`/search?planDate=${format(selectedDate, "yyyy-MM-dd")}`}>
                    Go to Class Search
                  </a>
                </Button>
              ) : (
                <p className="text-sm text-muted-foreground text-center">
                  Click on a day in the planner to select it, then come back here to add a workout.
                </p>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Reconnect Banner */}
      {isExpired && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="flex items-center gap-4 py-4">
            <AlertCircle className="h-5 w-5 text-amber-500 shrink-0" />
            <div className="flex-1">
              <p className="font-medium text-amber-500">Session Expired</p>
              <p className="text-sm text-muted-foreground">
                Your Peloton session has expired. Reconnect to sync workouts and push to your stack.
              </p>
            </div>
            <Button
              variant="outline"
              className="border-amber-500/50 text-amber-500 hover:bg-amber-500/10"
              onClick={() => window.open("https://members.onepeloton.com", "_blank")}
            >
              Reconnect
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Date Navigation */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="icon"
            onClick={handleNavigateBack}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" className="text-center gap-2">
                <CalendarIcon className="h-4 w-4" />
                <h2 className="font-display text-2xl tracking-wide">
                  {format(startDate, "MMM d")} - {format(endDate, "MMM d, yyyy")}
                </h2>
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={startDate}
                onSelect={(date) => date && setStartDate(startOfDay(date))}
              />
            </PopoverContent>
          </Popover>
          <Button
            variant="outline"
            size="icon"
            onClick={handleNavigateForward}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-border/50 p-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handleRemoveDay}
              disabled={numberOfDays <= MIN_DAYS}
            >
              <Minus className="h-4 w-4" />
            </Button>
            <span className="w-16 text-center text-sm font-medium">
              {numberOfDays} days
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handleAddDay}
              disabled={numberOfDays >= MAX_DAYS}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <Button
            variant="ghost"
            onClick={handleResetToToday}
            className="text-sm"
          >
            Today
          </Button>
        </div>
      </div>

      {/* Weekly Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="bg-secondary/30">
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-3xl font-display">{rangeStats.planned + rangeStats.completed}</p>
              <p className="text-sm text-muted-foreground">Total Workouts</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-secondary/30">
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-3xl font-display text-green-500">{rangeStats.completed}</p>
              <p className="text-sm text-muted-foreground">Completed</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-secondary/30">
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-3xl font-display">{Math.round(rangeStats.totalMinutes)}</p>
              <p className="text-sm text-muted-foreground">Total Minutes</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Days Grid */}
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="pb-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-4">
            {displayDays.map((day) => {
              const dayWorkouts = getWorkoutsForDay(day);
              const isCurrentDay = isToday(day);
              const isPastDay = isPast(day) && !isCurrentDay;
              const isEditable = !isPastDay;
              const isSelected = selectedDate && isSameDay(day, selectedDate);

              return (
                <Card
                  key={day.toISOString()}
                  onClick={() => setSelectedDate(day)}
                  className={cn(
                    "min-h-[420px] transition-all duration-200 cursor-pointer",
                    isPastDay && "opacity-50",
                    // Selection states - mutually exclusive
                    isSelected
                      ? "border-primary bg-primary/5"
                      : isCurrentDay
                        ? "glow-primary-sm border-primary/30"
                        : "hover:border-border/80"
                  )}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                          {format(day, "EEEE")}
                        </p>
                        <p
                          className={cn(
                            "font-display text-3xl",
                            (isCurrentDay || isSelected) && "text-primary"
                          )}
                        >
                          {format(day, "d")}
                        </p>
                      </div>
                      <DayBadge
                        isCurrentDay={isCurrentDay}
                        isSelected={!!isSelected}
                        isPastDay={isPastDay}
                      />
                    </div>
                  </CardHeader>
                  <CardContent>
                    {isLoading ? (
                      <div className="space-y-3">
                        <Skeleton className="h-20 w-full rounded-lg" />
                        <Skeleton className="h-20 w-full rounded-lg" />
                        <Skeleton className="h-20 w-full rounded-lg" />
                      </div>
                    ) : (
                      <DroppableDay
                        dateStr={format(day, "yyyy-MM-dd")}
                        isEditable={isEditable}
                      >
                        {(isOver) => (
                          <>
                            {dayWorkouts.length > 0 ? (
                              <SortableContext
                                items={dayWorkouts.map((w) => w.id)}
                                strategy={verticalListSortingStrategy}
                              >
                                {dayWorkouts.map((workout) => (
                                  <SortableWorkoutCard
                                    key={workout.id}
                                    workout={workout}
                                    isEditable={isEditable}
                                    onDelete={() => handleDeleteWorkout(workout.id)}
                                    onStatusChange={(status) =>
                                      handleStatusChange(workout.id, status)
                                    }
                                    onMoveToDate={(date) => handleMoveToDate(workout.id, date)}
                                    onDuplicate={(date) => handleDuplicate(workout, date)}
                                  />
                                ))}
                              </SortableContext>
                            ) : (
                              <div
                                className={cn(
                                  "flex h-24 items-center justify-center rounded-xl border border-dashed text-sm transition-colors",
                                  activeId && isEditable
                                    ? isOver
                                      ? "border-primary bg-primary/10 text-primary"
                                      : "border-primary/50 bg-primary/5 text-primary/70"
                                    : "border-border/30 bg-secondary/20 text-muted-foreground/60"
                                )}
                              >
                                {activeId && isEditable ? "Drop here" : "No workouts planned"}
                              </div>
                            )}
                            {/* Add workout button */}
                            {isEditable ? (
                              <a
                                href={`/search?planDate=${format(day, "yyyy-MM-dd")}`}
                                onClick={(e) => e.stopPropagation()}
                                className={cn(
                                  "flex h-10 items-center justify-center gap-2 rounded-lg border border-dashed text-sm transition-colors",
                                  isOver && activeId
                                    ? "border-primary/40 bg-primary/5 text-primary"
                                    : "border-border/40 bg-secondary/20 text-muted-foreground/70 hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
                                )}
                              >
                                <Plus className="h-4 w-4" />
                                Add workout
                              </a>
                            ) : (
                              <div
                                className="flex h-10 items-center justify-center gap-2 rounded-lg border border-dashed border-border/30 bg-secondary/10 text-muted-foreground/40 text-sm cursor-not-allowed"
                              >
                                <Lock className="h-3 w-3" />
                                Locked
                              </div>
                            )}
                          </>
                        )}
                      </DroppableDay>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Drag overlay for visual feedback */}
        <DragOverlay>
          {activeId && workouts.find((w) => w.id === activeId) ? (
            <div className="opacity-90 shadow-xl">
              <WorkoutCardWithHandle
                workout={workouts.find((w) => w.id === activeId)!}
                isEditable={true} // Drag is only enabled for editable days
                onDelete={() => {}}
                onStatusChange={() => {}}
              />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Stack Push Info */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="flex items-center gap-4 py-4">
          {pushResult ? (
            pushResult.success ? (
              <CheckCircle2 className="h-5 w-5 text-green-500" />
            ) : (
              <AlertCircle className="h-5 w-5 text-destructive" />
            )
          ) : (
            <AlertCircle className="h-5 w-5 text-primary" />
          )}
          <div className="flex-1">
            {pushResult ? (
              <>
                <p className={cn(
                  "font-medium",
                  pushResult.success ? "text-green-500" : "text-destructive"
                )}>
                  {pushResult.success ? "Success!" : "Push Failed"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {pushResult.message}
                </p>
              </>
            ) : (
              <>
                <p className="font-medium text-foreground">
                  Automatic Stack Push
                </p>
                <p className="text-sm text-muted-foreground">
                  Your planned workouts will be automatically pushed to your Peloton stack each night at midnight.
                </p>
              </>
            )}
          </div>
          <Button
            variant="outline"
            className="ml-auto gap-2"
            onClick={handlePushToStack}
            disabled={isPushing}
          >
            {isPushing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Pushing...
              </>
            ) : (
              "Push Now"
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function DroppableDay({
  dateStr,
  isEditable,
  children,
}: {
  dateStr: string;
  isEditable: boolean;
  children: (isOver: boolean) => React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `day-${dateStr}`,
    disabled: !isEditable,
  });

  return (
    <div ref={setNodeRef} className="space-y-3">
      {children(isOver)}
    </div>
  );
}

function DayBadge({
  isCurrentDay,
  isSelected,
  isPastDay,
}: {
  isCurrentDay: boolean;
  isSelected: boolean;
  isPastDay: boolean;
}) {
  if (isCurrentDay) {
    return (
      <Badge className="bg-primary/15 text-primary border border-primary/20 font-medium">
        Today
      </Badge>
    );
  }
  if (isSelected) {
    return (
      <Badge className="bg-primary/15 text-primary border border-primary/20 font-medium">
        Selected
      </Badge>
    );
  }
  if (isPastDay) {
    return (
      <Badge
        variant="outline"
        className="text-muted-foreground/70 border-border/40 font-medium gap-1"
      >
        <Lock className="h-3 w-3" />
        Locked
      </Badge>
    );
  }
  return null;
}

function DatePickerDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  selectedDate,
  onSelect,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  selectedDate: Date | undefined;
  onSelect: (date: Date | undefined) => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={onSelect}
            disabled={(date) => isPast(date) && !isToday(date)}
            className="rounded-md border mx-auto"
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!selectedDate} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StatusButton({
  workout,
  isEditable,
  onStatusChange,
  onMarkComplete,
}: {
  workout: PlannedWorkout;
  isEditable: boolean;
  onStatusChange: (status: PlannedWorkout["status"]) => void;
  onMarkComplete: () => void;
}) {
  const isCompleted = workout.status === "completed";

  if (workout.pushed_to_stack) {
    return (
      <div className="p-1.5 rounded-md" title="Synced to Peloton stack">
        <CloudUpload className="h-3.5 w-3.5 text-primary" />
      </div>
    );
  }

  if (isCompleted) {
    if (isEditable) {
      return (
        <button
          onClick={() => onStatusChange("planned")}
          className="p-1.5 rounded-md hover:bg-green-500/10 transition-colors"
          title="Mark as planned"
        >
          <Check className="h-3.5 w-3.5 text-green-500" />
        </button>
      );
    }
    return (
      <div className="p-1.5 rounded-md" title="Completed">
        <Check className="h-3.5 w-3.5 text-green-500" />
      </div>
    );
  }

  if (isEditable) {
    return (
      <button
        onClick={onMarkComplete}
        className="p-1.5 rounded-md hover:bg-green-500/10 transition-colors"
        title="Mark as complete"
      >
        <Check className="h-3.5 w-3.5 text-muted-foreground/50 hover:text-green-500 transition-colors" />
      </button>
    );
  }

  return (
    <div className="p-1.5 rounded-md" title="Not completed">
      <Check className="h-3.5 w-3.5 text-muted-foreground/30" />
    </div>
  );
}

function SortableWorkoutCard({
  workout,
  isEditable,
  onDelete,
  onStatusChange,
  onMoveToDate,
  onDuplicate,
}: {
  workout: PlannedWorkout;
  isEditable: boolean;
  onDelete: () => void;
  onStatusChange: (status: PlannedWorkout["status"]) => void;
  onMoveToDate?: (date: Date) => void;
  onDuplicate?: (date: Date) => void;
}) {
  const isCompleted = workout.status === "completed";
  const canDrag = isEditable && !isCompleted;

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: workout.id, disabled: !canDrag });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <WorkoutCardWithHandle
        workout={workout}
        isEditable={isEditable}
        canDrag={canDrag}
        onDelete={onDelete}
        onStatusChange={onStatusChange}
        onMoveToDate={onMoveToDate}
        onDuplicate={onDuplicate}
        dragHandleProps={canDrag ? { ...attributes, ...listeners } : undefined}
      />
    </div>
  );
}

function WorkoutCardWithHandle({
  workout,
  isEditable = true,
  canDrag,
  onDelete,
  onStatusChange,
  onMoveToDate,
  onDuplicate,
  dragHandleProps,
}: {
  workout: PlannedWorkout;
  isEditable?: boolean;
  canDrag?: boolean;
  onDelete: () => void;
  onStatusChange: (status: PlannedWorkout["status"]) => void;
  onMoveToDate?: (date: Date) => void;
  onDuplicate?: (date: Date) => void;
  dragHandleProps?: Record<string, unknown>;
}) {
  // Default canDrag to isEditable if not provided (for DragOverlay usage)
  const isDraggable = canDrag ?? isEditable;
  const [showDetails, setShowDetails] = useState(false);
  const [showMoveDialog, setShowMoveDialog] = useState(false);
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showFutureWarning, setShowFutureWarning] = useState(false);
  const [selectedMoveDate, setSelectedMoveDate] = useState<Date | undefined>();
  const [selectedDuplicateDate, setSelectedDuplicateDate] = useState<Date | undefined>();
  const disciplineLabel = getDisciplineLabel(workout.discipline);
  const disciplineColor = getDisciplineColor(workout.discipline);
  const isCompleted = workout.status === "completed";
  const workoutDate = parseISO(workout.scheduled_date);
  const isFutureWorkout = !isToday(workoutDate) && !isPast(workoutDate);

  const handleMarkComplete = () => {
    if (isFutureWorkout) {
      setShowFutureWarning(true);
    } else {
      onStatusChange("completed");
    }
  };

  return (
    <>
      <div
        className="relative overflow-hidden rounded-xl border border-border/40 bg-secondary/40 transition-all duration-200 hover:border-border/60 cursor-pointer"
        onClick={() => setShowDetails(true)}
      >
        {/* Background cover image */}
        {workout.ride_image_url && (
          <div className="absolute inset-0">
            <Image
              src={workout.ride_image_url}
              alt=""
              fill
              className="object-cover object-[center_15%] opacity-40"
              sizes="(max-width: 768px) 100vw, 50vw"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-background/90 via-background/75 to-background/60" />
          </div>
        )}

        <div className="relative flex">
          {/* Drag Handle - on top of image */}
          <div
            {...dragHandleProps}
            className={cn(
              "flex items-center justify-center w-7 border-r border-border/30 rounded-l-xl transition-colors shrink-0",
              isDraggable
                ? "cursor-grab active:cursor-grabbing hover:bg-white/5 touch-none"
                : "cursor-not-allowed"
            )}
            title={isDraggable ? "Drag to reorder or move to another day" : isCompleted ? "Completed workouts can't be moved" : undefined}
          >
            <GripVertical
              className={cn(
                "h-4 w-4",
                isDraggable ? "text-muted-foreground/60" : "text-muted-foreground/30"
              )}
            />
          </div>

          {/* Content */}
          <div className="flex-1 p-3 pr-2 min-w-0">
            {/* Top row: Discipline + Duration */}
            <div className="flex items-center gap-2 mb-1.5">
              <div className={cn("h-2 w-2 rounded-full shrink-0", disciplineColor)} />
              <span className="text-xs font-medium text-muted-foreground">
                {disciplineLabel}
              </span>
              <span className="text-xs text-muted-foreground/70 ml-auto flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {Math.round(workout.duration_seconds / 60)} min
              </span>
            </div>

            {/* Title */}
            <p className={cn(
              "font-medium text-sm leading-snug line-clamp-2 pr-6",
              isCompleted ? "text-muted-foreground" : "text-foreground"
            )}>
              {workout.ride_title}
            </p>

            {/* Bottom row: Instructor + Actions */}
            <div className="flex items-center justify-between mt-2">
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <User className="h-3 w-3" />
                <span className="truncate max-w-[120px]">
                  {workout.instructor_name || "TBD"}
                </span>
              </p>

              {/* Action buttons - always visible */}
              <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                <StatusButton
                  workout={workout}
                  isEditable={isEditable}
                  onStatusChange={onStatusChange}
                  onMarkComplete={handleMarkComplete}
                />
                {isEditable && (
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="p-1.5 rounded-md hover:bg-destructive/10 transition-colors"
                    title="Remove workout"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground/50 hover:text-destructive" />
                  </button>
                )}
                {/* Context menu */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className="p-1.5 rounded-md hover:bg-accent transition-colors"
                      title="More options"
                    >
                      <MoreVertical className="h-3.5 w-3.5 text-muted-foreground/50" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem onClick={() => setShowDetails(true)}>
                      <Info className="mr-2 h-4 w-4" />
                      View details
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {isEditable && !isCompleted && onMoveToDate && (
                      <DropdownMenuItem onClick={() => setShowMoveDialog(true)}>
                        <CalendarDays className="mr-2 h-4 w-4" />
                        Move to date...
                      </DropdownMenuItem>
                    )}
                    {onDuplicate && (
                      <DropdownMenuItem onClick={() => setShowDuplicateDialog(true)}>
                        <Copy className="mr-2 h-4 w-4" />
                        Duplicate to...
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem asChild>
                      <a
                        href={`https://members.onepeloton.com/classes/cycling?modal=classDetailsModal&classId=${workout.peloton_class_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ExternalLink className="mr-2 h-4 w-4" />
                        Open in Peloton
                      </a>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* Details Dialog */}
      <Dialog open={showDetails} onOpenChange={setShowDetails}>
        <DialogContent className="sm:max-w-md overflow-hidden p-0">
          {/* Class Image */}
          {workout.ride_image_url && (
            <div className="relative h-48 w-full">
              <Image
                src={workout.ride_image_url}
                alt={workout.ride_title}
                fill
                className="object-cover"
                sizes="(max-width: 768px) 100vw, 448px"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent" />
            </div>
          )}

          <div className="p-6 pt-0 -mt-8 relative">
            {/* Discipline Badge */}
            <Badge className={cn("mb-3", disciplineColor, "text-white")}>
              {disciplineLabel}
            </Badge>

            <DialogHeader className="text-left">
              <DialogTitle className="text-xl leading-tight">
                {workout.ride_title}
              </DialogTitle>
              <DialogDescription className="flex items-center gap-4 mt-2">
                <span className="flex items-center gap-1.5">
                  <User className="h-4 w-4" />
                  {workout.instructor_name || "TBD"}
                </span>
                <span className="flex items-center gap-1.5">
                  <Clock className="h-4 w-4" />
                  {Math.round(workout.duration_seconds / 60)} minutes
                </span>
              </DialogDescription>
            </DialogHeader>

            <div className="flex gap-2 mt-6">
              {workout.pushed_to_stack ? (
                <div className="flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-md bg-primary/10 text-primary border border-primary/20">
                  <CloudUpload className="h-4 w-4" />
                  Synced to Stack
                </div>
              ) : isCompleted ? (
                // Completed: show green indicator (clickable to toggle if editable)
                isEditable ? (
                  <Button
                    variant="outline"
                    className="flex-1 gap-2 border-green-500/50 text-green-500"
                    onClick={() => {
                      onStatusChange("planned");
                      setShowDetails(false);
                    }}
                  >
                    <Check className="h-4 w-4" />
                    Mark Planned
                  </Button>
                ) : (
                  <div className="flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-md bg-green-500/10 text-green-500 border border-green-500/20">
                    <Check className="h-4 w-4" />
                    Completed
                  </div>
                )
              ) : isEditable ? (
                // Not completed + editable: show mark complete button
                <Button
                  variant="outline"
                  className="flex-1 gap-2"
                  onClick={() => {
                    if (isFutureWorkout) {
                      setShowDetails(false);
                      setShowFutureWarning(true);
                    } else {
                      onStatusChange("completed");
                      setShowDetails(false);
                    }
                  }}
                >
                  <Check className="h-4 w-4" />
                  Mark Complete
                </Button>
              ) : (
                // Not completed + past day: show not completed indicator
                <div className="flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-md bg-muted/50 text-muted-foreground/50 border border-border/40">
                  <Check className="h-4 w-4" />
                  Not Completed
                </div>
              )}
              {isEditable && (
                <Button
                  variant="destructive"
                  className="gap-2"
                  onClick={() => {
                    setShowDetails(false);
                    setShowDeleteConfirm(true);
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                  Remove
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Move to date dialog */}
      <DatePickerDialog
        open={showMoveDialog}
        onOpenChange={setShowMoveDialog}
        title="Move workout"
        description="Select a new date for this workout"
        confirmLabel="Move"
        selectedDate={selectedMoveDate}
        onSelect={setSelectedMoveDate}
        onConfirm={() => {
          if (selectedMoveDate && onMoveToDate) {
            onMoveToDate(selectedMoveDate);
            setShowMoveDialog(false);
            setSelectedMoveDate(undefined);
          }
        }}
      />

      {/* Duplicate to date dialog */}
      <DatePickerDialog
        open={showDuplicateDialog}
        onOpenChange={setShowDuplicateDialog}
        title="Duplicate workout"
        description="Select a date to copy this workout to"
        confirmLabel="Duplicate"
        selectedDate={selectedDuplicateDate}
        onSelect={setSelectedDuplicateDate}
        onConfirm={() => {
          if (selectedDuplicateDate && onDuplicate) {
            onDuplicate(selectedDuplicateDate);
            setShowDuplicateDialog(false);
            setSelectedDuplicateDate(undefined);
          }
        }}
      />

      {/* Delete confirmation dialog */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove workout?</DialogTitle>
            <DialogDescription>
              This will remove &quot;{workout.ride_title}&quot; from your plan.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                onDelete();
                setShowDeleteConfirm(false);
              }}
            >
              Remove
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Future workout warning dialog */}
      <Dialog open={showFutureWarning} onOpenChange={setShowFutureWarning}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-amber-500" />
              Can&apos;t mark as complete
            </DialogTitle>
            <DialogDescription>
              This workout is scheduled for {format(workoutDate, "EEEE, MMMM d")}. You can only mark workouts as complete on or after their scheduled date.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end mt-4">
            <Button onClick={() => setShowFutureWarning(false)}>
              Got it
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

