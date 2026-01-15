"use client";

import { AlertTriangle, ExternalLink, X } from "lucide-react";
import { useState } from "react";
import { useAuthStore } from "@/lib/stores/auth-store";
import { Button } from "@/components/ui/button";

export function PelotonReconnectBanner() {
  const { isPelotonConnected, pelotonTokenStatus } = useAuthStore();
  const [dismissed, setDismissed] = useState(false);

  // Only show if connected but token is expired
  if (!isPelotonConnected || pelotonTokenStatus !== "expired" || dismissed) {
    return null;
  }

  return (
    <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-3 mb-6">
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="font-medium text-amber-500">Peloton connection expired</p>
          <p className="text-sm text-muted-foreground mt-0.5">
            Your Peloton session has expired. Reconnect to sync FTP data and push workouts to your stack.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 border-amber-500/50 text-amber-500 hover:bg-amber-500/10"
            onClick={() => window.open("https://members.onepeloton.com", "_blank")}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Reconnect
          </Button>
          <button
            onClick={() => setDismissed(true)}
            className="text-muted-foreground hover:text-foreground p-1"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
