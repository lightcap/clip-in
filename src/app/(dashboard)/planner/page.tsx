"use client";

import { useEffect, useState, useCallback } from "react";
import Image from "next/image";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  closestCenter,
  PointerSensor,
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
  Maximize2,
  CloudUpload,
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { toast } from "sonner";
import { useAuthStore } from "@/lib/stores/auth-store";
import { cn } from "@/lib/utils";

interface PlannedWorkout {
  id: string;
  peloton_ride_id: string;
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

const DISCIPLINES: Record<string, { label: string; color: string }> = {
  cycling: { label: "Cycling", color: "bg-blue-500" },
  strength: { label: "Strength", color: "bg-orange-500" },
  running: { label: "Running", color: "bg-green-500" },
  caesar: { label: "Rowing", color: "bg-cyan-500" },
  yoga: { label: "Yoga", color: "bg-purple-500" },
  meditation: { label: "Meditation", color: "bg-indigo-500" },
  stretching: { label: "Stretching", color: "bg-teal-500" },
  cardio: { label: "Cardio", color: "bg-red-500" },
};

const MIN_DAYS = 3;
const MAX_DAYS = 14;

export default function PlannerPage() {
  const { isPelotonConnected, pelotonTokenStatus } = useAuthStore();
  const [startDate, setStartDate] = useState(() => startOfDay(new Date()));
  const [numberOfDays, setNumberOfDays] = useState(MIN_DAYS);
  const [workouts, setWorkouts] = useState<PlannedWorkout[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isPushing, setIsPushing] = useState(false);
  const [pushResult, setPushResult] = useState<{ success: boolean; message: string } | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

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

    const end = addDays(startDate, numberOfDays - 1);
    try {
      const response = await fetch(
        `/api/planner/workouts?start=${format(startDate, "yyyy-MM-dd")}&end=${format(end, "yyyy-MM-dd")}`
      );
      if (!response.ok) {
        throw new Error(`Failed to load workouts (${response.status})`);
      }
      const data = await response.json();
      setWorkouts(data.workouts || []);
    } catch (error) {
      console.error("Failed to fetch workouts:", error);
      toast.error("Failed to load workouts. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [isPelotonConnected, startDate, numberOfDays]);

  useEffect(() => {
    fetchWorkouts();
  }, [fetchWorkouts]);

  const getWorkoutsForDay = (date: Date) =>
    workouts
      .filter((w) => isSameDay(new Date(w.scheduled_date), date))
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  const handleDeleteWorkout = async (workoutId: string) => {
    // Optimistic update - remove immediately
    const previousWorkouts = workouts;
    setWorkouts((prev) => prev.filter((w) => w.id !== workoutId));

    try {
      const response = await fetch(`/api/planner/workouts/${workoutId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        // Revert on failure
        setWorkouts(previousWorkouts);
        toast.error("Failed to remove workout. Please try again.");
      }
    } catch (error) {
      console.error("Failed to delete workout:", error);
      // Revert on error
      setWorkouts(previousWorkouts);
      toast.error("Failed to remove workout. Please check your connection.");
    }
  };

  const handleStatusChange = async (
    workoutId: string,
    status: PlannedWorkout["status"]
  ) => {
    // Optimistic update - change status immediately
    const previousWorkouts = workouts;
    setWorkouts((prev) =>
      prev.map((w) => (w.id === workoutId ? { ...w, status } : w))
    );

    try {
      const response = await fetch(`/api/planner/workouts/${workoutId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) {
        // Revert on failure
        setWorkouts(previousWorkouts);
        toast.error("Failed to update workout status. Please try again.");
      }
    } catch (error) {
      console.error("Failed to update workout:", error);
      // Revert on error
      setWorkouts(previousWorkouts);
      toast.error("Failed to update workout. Please check your connection.");
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over || active.id === over.id) return;

    // Find the workouts being reordered
    const activeWorkout = workouts.find((w) => w.id === active.id);
    const overWorkout = workouts.find((w) => w.id === over.id);

    if (!activeWorkout || !overWorkout) return;

    // Only allow reordering within the same day
    if (activeWorkout.scheduled_date !== overWorkout.scheduled_date) return;

    // Get workouts for this day and reorder
    const dayWorkouts = workouts
      .filter((w) => w.scheduled_date === activeWorkout.scheduled_date)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

    const oldIndex = dayWorkouts.findIndex((w) => w.id === active.id);
    const newIndex = dayWorkouts.findIndex((w) => w.id === over.id);

    const reorderedDayWorkouts = arrayMove(dayWorkouts, oldIndex, newIndex);

    // Optimistic update
    const previousWorkouts = workouts;
    const updatedWorkouts = workouts.map((w) => {
      const reorderedIndex = reorderedDayWorkouts.findIndex((rw) => rw.id === w.id);
      if (reorderedIndex !== -1) {
        return { ...w, sort_order: reorderedIndex };
      }
      return w;
    });
    setWorkouts(updatedWorkouts);

    // Persist to server
    try {
      const response = await fetch("/api/planner/workouts/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: activeWorkout.scheduled_date,
          workoutIds: reorderedDayWorkouts.map((w) => w.id),
        }),
      });
      if (!response.ok) {
        setWorkouts(previousWorkouts);
        toast.error("Failed to save workout order. Please try again.");
      }
    } catch (error) {
      console.error("Failed to reorder workouts:", error);
      setWorkouts(previousWorkouts);
      toast.error("Failed to save workout order. Please check your connection.");
    }
  };

  const handlePushToStack = async () => {
    setIsPushing(true);
    setPushResult(null);

    try {
      // Push tomorrow's workouts to stack
      const tomorrow = format(new Date(), "yyyy-MM-dd");
      const response = await fetch("/api/stack/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: tomorrow,
          clearExisting: false,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setPushResult({
          success: true,
          message: data.message || `Pushed ${data.pushed} workout(s) to stack`,
        });
        // Refresh workouts to update pushed_to_stack status
        fetchWorkouts();
      } else {
        setPushResult({
          success: false,
          message: data.error || "Failed to push workouts",
        });
      }
    } catch (error) {
      console.error("Failed to push to stack:", error);
      setPushResult({
        success: false,
        message: "An error occurred while pushing to stack",
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
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="pb-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-4">
            {displayDays.map((day) => {
              const dayWorkouts = getWorkoutsForDay(day);
              const isCurrentDay = isToday(day);
              const isPastDay = isPast(day) && !isCurrentDay;
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
                      {isCurrentDay && (
                        <Badge className="bg-primary/15 text-primary border border-primary/20 font-medium">
                          Today
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {isLoading ? (
                      <>
                        <Skeleton className="h-20 w-full rounded-lg" />
                        <Skeleton className="h-20 w-full rounded-lg" />
                        <Skeleton className="h-20 w-full rounded-lg" />
                      </>
                    ) : (
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
                                onDelete={() => handleDeleteWorkout(workout.id)}
                                onStatusChange={(status) =>
                                  handleStatusChange(workout.id, status)
                                }
                              />
                            ))}
                          </SortableContext>
                        ) : (
                          <div className="flex h-24 items-center justify-center rounded-xl border border-dashed border-border/30 bg-secondary/20 text-muted-foreground/60 text-sm">
                            No workouts planned
                          </div>
                        )}
                        {/* Add workout button */}
                        <a
                          href={`/search?planDate=${format(day, "yyyy-MM-dd")}`}
                          onClick={(e) => e.stopPropagation()}
                          className="flex h-10 items-center justify-center gap-2 rounded-lg border border-dashed border-border/40 bg-secondary/20 text-muted-foreground/70 text-sm hover:border-primary/40 hover:bg-primary/5 hover:text-primary transition-colors"
                        >
                          <Plus className="h-4 w-4" />
                          Add workout
                        </a>
                      </>
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

function SortableWorkoutCard({
  workout,
  onDelete,
  onStatusChange,
}: {
  workout: PlannedWorkout;
  onDelete: () => void;
  onStatusChange: (status: PlannedWorkout["status"]) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: workout.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <WorkoutCardWithHandle
        workout={workout}
        onDelete={onDelete}
        onStatusChange={onStatusChange}
        dragHandleProps={{ ...attributes, ...listeners }}
      />
    </div>
  );
}

function WorkoutCardWithHandle({
  workout,
  onDelete,
  onStatusChange,
  dragHandleProps,
}: {
  workout: PlannedWorkout;
  onDelete: () => void;
  onStatusChange: (status: PlannedWorkout["status"]) => void;
  dragHandleProps?: Record<string, unknown>;
}) {
  const [showDetails, setShowDetails] = useState(false);
  const discipline = DISCIPLINES[workout.discipline] || {
    label: workout.discipline,
    color: "bg-gray-500",
  };
  const isCompleted = workout.status === "completed";

  return (
    <>
      <div
        className={cn(
          "relative overflow-hidden rounded-xl border border-border/40 bg-secondary/40 transition-all duration-200 hover:border-border/60",
          isCompleted && "opacity-50"
        )}
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
            className="flex items-center justify-center w-7 border-r border-border/30 cursor-grab active:cursor-grabbing hover:bg-white/5 rounded-l-xl transition-colors shrink-0 touch-none"
          >
            <GripVertical className="h-4 w-4 text-muted-foreground/60" />
          </div>

          {/* Content */}
          <div className="flex-1 p-3 pr-2 min-w-0">
            {/* Top row: Discipline + Duration */}
            <div className="flex items-center gap-2 mb-1.5">
              <div className={cn("h-2 w-2 rounded-full shrink-0", discipline.color)} />
              <span className="text-xs font-medium text-muted-foreground">
                {discipline.label}
              </span>
              <span className="text-xs text-muted-foreground/70 ml-auto flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {Math.round(workout.duration_seconds / 60)} min
              </span>
            </div>

            {/* Title */}
            <p className="font-medium text-sm text-foreground leading-snug line-clamp-2 pr-6">
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
              <div className="flex items-center gap-1">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowDetails(true);
                  }}
                  className="p-1.5 rounded-md hover:bg-primary/10 transition-colors"
                  title="View details"
                >
                  <Maximize2 className="h-3.5 w-3.5 text-muted-foreground/50 hover:text-primary" />
                </button>
                {workout.pushed_to_stack ? (
                  <div
                    className="p-1.5 rounded-md"
                    title="Synced to Peloton stack"
                  >
                    <CloudUpload className="h-3.5 w-3.5 text-primary" />
                  </div>
                ) : !isCompleted ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onStatusChange("completed");
                    }}
                    className="p-1.5 rounded-md hover:bg-green-500/10 transition-colors"
                    title="Mark as complete"
                  >
                    <Check className="h-3.5 w-3.5 text-green-500/70 hover:text-green-500" />
                  </button>
                ) : null}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete();
                  }}
                  className="p-1.5 rounded-md hover:bg-destructive/10 transition-colors"
                  title="Remove workout"
                >
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground/50 hover:text-destructive" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Completed overlay indicator */}
        {isCompleted && (
          <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-green-500/5 pointer-events-none">
            <Badge className="bg-green-500/20 text-green-500 border-green-500/30 text-xs font-medium">
              Completed
            </Badge>
          </div>
        )}
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
            <Badge className={cn("mb-3", discipline.color, "text-white")}>
              {discipline.label}
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
              ) : !isCompleted ? (
                <Button
                  variant="outline"
                  className="flex-1 gap-2"
                  onClick={() => {
                    onStatusChange("completed");
                    setShowDetails(false);
                  }}
                >
                  <Check className="h-4 w-4" />
                  Mark Complete
                </Button>
              ) : null}
              <Button
                variant="destructive"
                className="gap-2"
                onClick={() => {
                  onDelete();
                  setShowDetails(false);
                }}
              >
                <Trash2 className="h-4 w-4" />
                Remove
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

