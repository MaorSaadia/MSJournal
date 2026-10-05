"use client";
import { useState } from "react";
import { LogOut, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
export function LogoutButton({ compact = false }: { compact?: boolean }) {
  const [pending, setPending] = useState(false),
    [error, setError] = useState("");
  async function logout() {
    setPending(true);
    setError("");
    try {
      const result = await authClient.signOut();
      if (result.error) throw new Error();
      window.location.replace("/login");
    } catch {
      setError("Sign out failed. Please try again.");
      setPending(false);
    }
  }
  return (
    <div className="logout-control">
      <Button
        variant="ghost"
        size={compact ? "icon" : "default"}
        aria-label="Sign out"
        onClick={logout}
        disabled={pending}
      >
        {pending ? (
          <LoaderCircle className="pending-spinner" size={15} />
        ) : (
          <LogOut size={15} />
        )}{" "}
        {!compact && (pending ? "Signing out…" : "Sign out")}
      </Button>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </div>
  );
}
