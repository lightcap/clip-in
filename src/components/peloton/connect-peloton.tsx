"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Loader2, Link2, CheckCircle2, AlertCircle, ExternalLink } from "lucide-react";
import { useAuthStore } from "@/lib/stores/auth-store";

interface ConnectPelotonProps {
  onConnect?: () => void;
}

// Console snippet for users to copy their token from Peloton
const CONSOLE_SNIPPET = `copy(JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k=>k.includes('auth0spajs')&&k.includes('api.onepeloton')))).body.access_token);alert('Token copied!')`;

export function ConnectPeloton({ onConnect }: ConnectPelotonProps) {
  const { isPelotonConnected, setIsPelotonConnected, setProfile } = useAuthStore();
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<"intro" | "instructions" | "waiting" | "success">("intro");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manualToken, setManualToken] = useState("");

  // Check for token in URL hash (from callback redirect)
  useEffect(() => {
    if (typeof window === "undefined") return;

    const checkForToken = async () => {
      const hash = window.location.hash;
      if (hash.includes("peloton_token=")) {
        const token = decodeURIComponent(hash.split("peloton_token=")[1]);
        window.location.hash = ""; // Clear the hash

        if (token) {
          await handleTokenReceived(token);
        }
      }
    };

    checkForToken();
  }, []);

  const handleTokenReceived = async (token: string) => {
    setIsLoading(true);
    setError(null);
    setStep("waiting");
    setIsOpen(true);

    try {
      const response = await fetch("/api/peloton/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken: token }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to connect Peloton account");
      }

      setIsPelotonConnected(true);
      setProfile(data.profile);
      setStep("success");
      onConnect?.();

      setTimeout(() => {
        setIsOpen(false);
        setStep("intro");
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect");
      setStep("instructions");
    } finally {
      setIsLoading(false);
    }
  };

  const openPeloton = () => {
    window.open("https://members.onepeloton.com", "_blank");
    setStep("instructions");
  };

  if (isPelotonConnected) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <CheckCircle2 className="h-4 w-4 text-green-500" />
        Peloton Connected
      </div>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Link2 className="h-4 w-4" />
          Connect Peloton
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Connect Your Peloton Account</DialogTitle>
          <DialogDescription>
            Link your Peloton account to sync workouts and track your FTP
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {step === "intro" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              We&apos;ll open Peloton in a new tab. After you log in, use a simple bookmarklet to securely connect your account.
            </p>
            <Button className="w-full gap-2" onClick={openPeloton}>
              <ExternalLink className="h-4 w-4" />
              Open Peloton & Continue
            </Button>
          </div>
        )}

        {step === "instructions" && (
          <div className="space-y-4">
            <div className="rounded-lg border p-4 space-y-3">
              <h4 className="font-medium">After logging into Peloton:</h4>
              <p className="text-sm text-muted-foreground">
                Open your browser console (Cmd+Option+J) on the Peloton page and paste this:
              </p>
              <div className="relative">
                <code className="block p-2 bg-muted rounded text-xs break-all">
                  {CONSOLE_SNIPPET}
                </code>
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute top-1 right-1 h-6 text-xs"
                  onClick={() => {
                    navigator.clipboard.writeText(CONSOLE_SNIPPET);
                  }}
                >
                  Copy
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                Then paste your token here:
              </p>
              <Input
                type="password"
                placeholder="Paste your token"
                value={manualToken}
                onChange={(e) => setManualToken(e.target.value)}
              />
            </div>

            <Button
              className="w-full"
              onClick={() => handleTokenReceived(manualToken)}
              disabled={!manualToken.trim()}
            >
              Connect Account
            </Button>

            <Button variant="outline" className="w-full" onClick={() => window.open("https://members.onepeloton.com", "_blank")}>
              Open Peloton Again
            </Button>
          </div>
        )}

        {step === "waiting" && (
          <div className="flex flex-col items-center gap-4 py-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-center text-sm text-muted-foreground">
              Connecting your Peloton account...
            </p>
          </div>
        )}

        {step === "success" && (
          <div className="flex flex-col items-center gap-4 py-4">
            <CheckCircle2 className="h-12 w-12 text-green-500" />
            <p className="text-center font-medium">
              Your Peloton account has been connected!
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
