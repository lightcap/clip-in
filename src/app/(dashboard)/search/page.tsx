"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Search,
  User,
  Star,
  Plus,
  ChevronDown,
  Dumbbell,
  X,
  AlertCircle,
  Check,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useAuthStore } from "@/lib/stores/auth-store";
import { MUSCLE_GROUPS } from "@/types/peloton";

interface ClassResult {
  id: string;
  title: string;
  description: string;
  duration: number;
  difficulty_estimate: number | null;
  image_url: string;
  instructor_name: string;
  fitness_discipline: string;
  fitness_discipline_display_name?: string;
}

const DURATIONS = [
  { value: "5", label: "5 min" },
  { value: "10", label: "10 min" },
  { value: "15", label: "15 min" },
  { value: "20", label: "20 min" },
  { value: "30", label: "30 min" },
  { value: "45", label: "45 min" },
  { value: "60", label: "60 min" },
];

const DISCIPLINES = [
  { value: "strength", label: "Strength" },
  { value: "cycling", label: "Cycling" },
  { value: "running", label: "Running" },
  { value: "yoga", label: "Yoga" },
  { value: "stretching", label: "Stretching" },
  { value: "cardio", label: "Cardio" },
];

export default function SearchPage() {
  const { isPelotonConnected } = useAuthStore();
  const [searchQuery, setSearchQuery] = useState("");
  const [discipline, setDiscipline] = useState<string>("");
  const [duration, setDuration] = useState<string>("");
  const [selectedMuscles, setSelectedMuscles] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [results, setResults] = useState<ClassResult[]>([]);
  const [totalResults, setTotalResults] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  const [pageCount, setPageCount] = useState(0);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const fetchClasses = useCallback(async (page = 0, append = false) => {
    if (append) {
      setIsLoadingMore(true);
    } else {
      setIsLoading(true);
      setCurrentPage(0);
    }
    setHasSearched(true);
    setError(null);

    try {
      const params = new URLSearchParams();

      if (discipline) {
        params.set("discipline", discipline);
      }

      if (duration) {
        params.set("duration", duration);
      }

      if (searchQuery) {
        params.set("q", searchQuery);
      }

      params.set("page", page.toString());

      const response = await fetch(`/api/peloton/search?${params.toString()}`);

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        if (response.status === 401 && data.tokenExpired) {
          setError("Your Peloton session has expired. Please reconnect your account.");
          setResults([]);
          setTotalResults(0);
          return;
        }
        throw new Error(data.error || `Search failed (${response.status})`);
      }

      const data = await response.json();

      // Client-side filter for muscle groups (API doesn't support this directly)
      let classes = data.classes || [];
      if (selectedMuscles.length > 0) {
        // Filter by title containing muscle group keywords
        classes = classes.filter((c: ClassResult) => {
          const titleLower = c.title.toLowerCase();
          return selectedMuscles.some((muscle) => {
            const muscleGroup = MUSCLE_GROUPS.find((m) => m.id === muscle);
            if (!muscleGroup) return false;
            return titleLower.includes(muscleGroup.label.toLowerCase());
          });
        });
      }

      if (append) {
        setResults((prev) => [...prev, ...classes]);
      } else {
        setResults(classes);
      }
      setCurrentPage(data.page ?? page);
      setPageCount(data.page_count ?? 1);
      setTotalResults(data.total || classes.length);
    } catch (error) {
      console.error("Search error:", error);
      setError(error instanceof Error ? error.message : "Failed to search classes. Please try again.");
      if (!append) {
        setResults([]);
        setTotalResults(0);
      }
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, [discipline, duration, searchQuery, selectedMuscles]);

  const loadMore = useCallback(() => {
    if (currentPage < pageCount - 1 && !isLoadingMore) {
      fetchClasses(currentPage + 1, true);
    }
  }, [currentPage, pageCount, isLoadingMore, fetchClasses]);

  const hasMore = currentPage < pageCount - 1;

  // Load initial results when Peloton is connected
  useEffect(() => {
    if (isPelotonConnected && !hasSearched) {
      fetchClasses();
    }
  }, [isPelotonConnected, hasSearched, fetchClasses]);

  const handleSearch = async () => {
    await fetchClasses();
  };

  const handleMuscleToggle = (muscleId: string) => {
    setSelectedMuscles((prev) =>
      prev.includes(muscleId)
        ? prev.filter((m) => m !== muscleId)
        : [...prev, muscleId]
    );
  };

  const clearFilters = () => {
    setSearchQuery("");
    setDiscipline("");
    setDuration("");
    setSelectedMuscles([]);
    setHasSearched(false);
  };

  const hasActiveFilters =
    searchQuery || discipline || duration || selectedMuscles.length > 0;

  const handleAddToPlan = async (classItem: ClassResult, date: string) => {
    try {
      const response = await fetch("/api/planner/workouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          peloton_ride_id: classItem.id,
          ride_title: classItem.title,
          ride_image_url: classItem.image_url,
          instructor_name: classItem.instructor_name,
          duration_seconds: classItem.duration,
          discipline: classItem.fitness_discipline,
          scheduled_date: date,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to add workout to plan");
      }

      setNotification({ type: "success", message: `Added "${classItem.title}" to your plan` });
      setTimeout(() => setNotification(null), 3000);
    } catch (error) {
      console.error("Failed to add to plan:", error);
      setNotification({
        type: "error",
        message: error instanceof Error ? error.message : "Failed to add workout to plan",
      });
      setTimeout(() => setNotification(null), 5000);
    }
  };

  if (!isPelotonConnected) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center">
        <div className="relative mb-8">
          <div className="absolute -inset-8 rounded-full bg-primary/20 blur-3xl" />
          <div className="relative flex h-24 w-24 items-center justify-center rounded-2xl bg-primary/10">
            <Search className="h-12 w-12 text-primary" />
          </div>
        </div>
        <h2 className="font-display text-3xl tracking-wide text-foreground mb-3">
          CONNECT PELOTON TO SEARCH CLASSES
        </h2>
        <p className="text-muted-foreground text-center max-w-md">
          Link your Peloton account to search for classes by muscle group, duration, and more.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="font-display text-4xl tracking-wide text-foreground">
          CLASS SEARCH
        </h1>
        <p className="text-muted-foreground mt-1">
          Find classes by muscle group, duration, instructor, and more
        </p>
      </div>

      {/* Notification Toast */}
      {notification && (
        <Card className={`${notification.type === "success" ? "border-green-500/30 bg-green-500/5" : "border-red-500/30 bg-red-500/5"}`}>
          <CardContent className="flex items-center gap-4 py-3">
            {notification.type === "success" ? (
              <Check className="h-5 w-5 text-green-500 shrink-0" />
            ) : (
              <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
            )}
            <p className={notification.type === "success" ? "text-green-500" : "text-red-500"}>
              {notification.message}
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto"
              onClick={() => setNotification(null)}
            >
              <X className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Error Banner */}
      {error && (
        <Card className="border-red-500/30 bg-red-500/5">
          <CardContent className="flex items-center gap-4 py-4">
            <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
            <div className="flex-1">
              <p className="font-medium text-red-500">Search Error</p>
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
            <Button
              variant="outline"
              className="border-red-500/50 text-red-500 hover:bg-red-500/10"
              onClick={() => { setError(null); fetchClasses(); }}
            >
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Search and Filters */}
      <div className="space-y-4">
        {/* Search Bar */}
        <div className="flex gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search classes or instructors..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            />
          </div>
          <Button onClick={handleSearch} className="gap-2">
            <Search className="h-4 w-4" />
            Search
          </Button>
        </div>

        {/* Filter Row */}
        <div className="flex flex-wrap gap-3">
          {/* Discipline */}
          <Select value={discipline} onValueChange={setDiscipline}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Discipline" />
            </SelectTrigger>
            <SelectContent>
              {DISCIPLINES.map((d) => (
                <SelectItem key={d.value} value={d.value}>
                  {d.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Duration */}
          <Select value={duration} onValueChange={setDuration}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Duration" />
            </SelectTrigger>
            <SelectContent>
              {DURATIONS.map((d) => (
                <SelectItem key={d.value} value={d.value}>
                  {d.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Muscle Groups */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="gap-2">
                <Dumbbell className="h-4 w-4" />
                Muscle Groups
                {selectedMuscles.length > 0 && (
                  <Badge variant="secondary" className="ml-1">
                    {selectedMuscles.length}
                  </Badge>
                )}
                <ChevronDown className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64">
              <div className="space-y-3">
                <h4 className="font-medium text-sm">Select Muscle Groups</h4>
                <div className="grid grid-cols-2 gap-2">
                  {MUSCLE_GROUPS.map((muscle) => (
                    <div key={muscle.id} className="flex items-center gap-2">
                      <Checkbox
                        id={muscle.id}
                        checked={selectedMuscles.includes(muscle.id)}
                        onCheckedChange={() => handleMuscleToggle(muscle.id)}
                      />
                      <Label htmlFor={muscle.id} className="text-sm">
                        {muscle.label}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
            </PopoverContent>
          </Popover>

          {/* Clear Filters */}
          {hasActiveFilters && (
            <Button variant="ghost" onClick={clearFilters} className="gap-2">
              <X className="h-4 w-4" />
              Clear
            </Button>
          )}
        </div>

        {/* Active Filters Display */}
        {selectedMuscles.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {selectedMuscles.map((muscleId) => {
              const muscle = MUSCLE_GROUPS.find((m) => m.id === muscleId);
              return (
                <Badge
                  key={muscleId}
                  variant="secondary"
                  className="gap-1 cursor-pointer hover:bg-secondary/80"
                  onClick={() => handleMuscleToggle(muscleId)}
                >
                  {muscle?.label}
                  <X className="h-3 w-3" />
                </Badge>
              );
            })}
          </div>
        )}
      </div>

      {/* Results */}
      <div>
        <p className="text-sm text-muted-foreground mb-4">
          {hasSearched
            ? `${results.length}${totalResults > results.length ? ` of ${totalResults}` : ""} classes found`
            : "Search for classes above"}
        </p>

        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-64 w-full rounded-xl" />
            ))}
          </div>
        ) : results.length > 0 ? (
          <>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 stagger-fade-in">
              {results.map((classItem) => (
                <ClassCard
                  key={classItem.id}
                  classItem={classItem}
                  onAddToPlan={handleAddToPlan}
                />
              ))}
            </div>
            {hasMore && (
              <div className="flex justify-center mt-8">
                <Button
                  variant="outline"
                  size="lg"
                  onClick={loadMore}
                  disabled={isLoadingMore}
                  className="gap-2"
                >
                  {isLoadingMore ? (
                    <>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      Loading...
                    </>
                  ) : (
                    <>Load More Classes</>
                  )}
                </Button>
              </div>
            )}
          </>
        ) : (
          <Card className="py-16">
            <CardContent className="flex flex-col items-center justify-center">
              <Search className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground text-center">
                No classes found matching your criteria.
                <br />
                Try adjusting your filters.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function ClassCard({
  classItem,
  onAddToPlan,
}: {
  classItem: ClassResult;
  onAddToPlan: (classItem: ClassResult, date: string) => void;
}) {
  const durationMinutes = Math.round(classItem.duration / 60);
  const difficulty = classItem.difficulty_estimate?.toFixed(1) ?? "N/A";

  return (
    <Card className="group overflow-hidden transition-all hover:border-primary/30">
      {/* Class Image */}
      <div className="relative h-40 bg-gradient-to-br from-primary/20 to-primary/5">
        {classItem.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={classItem.image_url}
            alt={classItem.title}
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Dumbbell className="h-12 w-12 text-primary/30" />
          </div>
        )}
        <Badge className="absolute top-3 left-3 bg-black/60 text-white">
          {durationMinutes} min
        </Badge>
        {classItem.fitness_discipline_display_name && (
          <Badge className="absolute top-3 right-3 bg-primary/80 text-white">
            {classItem.fitness_discipline_display_name}
          </Badge>
        )}
      </div>

      <CardContent className="p-4">
        <h3 className="font-medium text-foreground mb-1 line-clamp-1">
          {classItem.title}
        </h3>
        <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
          {classItem.description}
        </p>

        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-3 text-muted-foreground">
            <span className="flex items-center gap-1">
              <User className="h-3 w-3" />
              {classItem.instructor_name}
            </span>
            <span className="flex items-center gap-1">
              <Star className="h-3 w-3 text-yellow-500" />
              {difficulty}
            </span>
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 gap-1"
            onClick={() => {
              const today = new Date().toISOString().split("T")[0];
              onAddToPlan(classItem, today);
            }}
          >
            <Plus className="h-3 w-3" />
            Add to Plan
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
