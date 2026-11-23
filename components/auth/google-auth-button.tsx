"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading";
import { authClient } from "@/lib/auth-client";

const googleError = "Google sign-in couldn’t finish. Try again, or use your email and password if you already have an account.";

export function GoogleAuthButton({
  destination,
  mode,
  returnedWithError,
  disabled,
  onPending,
}: {
  destination: string;
  mode: "login" | "signup";
  returnedWithError: boolean;
  disabled: boolean;
  onPending: (pending: boolean) => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(returnedWithError ? googleError : "");
  async function continueWithGoogle() {
    setPending(true);
    onPending(true);
    setError("");
    try {
      const params = new URLSearchParams({ next: destination, google: "error" });
      const result = await authClient.signIn.social({
        provider: "google",
        callbackURL: destination,
        errorCallbackURL: `/${mode === "signup" ? "signup" : "login"}?${params}`,
        requestSignUp: mode === "signup",
      });
      if (!result.error && result.data?.redirect) return;
    } catch {
      // The email form remains available if redirect setup fails.
    }
    setError(googleError);
    setPending(false);
    onPending(false);
  }
  return (
    <div className="google-auth">
      <Button type="button" variant="outline" className="google-auth-button" disabled={disabled || pending} onClick={continueWithGoogle}>
        {pending ? <LoadingSpinner size={18} /> : (
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.2 3.6l6.85-6.85C35.89 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z" />
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.24 5.48-4.76 7.18l7.73 6C44.42 38.04 46.98 31.88 46.98 24.55Z" />
            <path fill="#FBBC05" d="M10.53 28.59A14.4 14.4 0 0 1 9.75 24c0-1.59.28-3.13.78-4.59l-7.98-6.19A23.88 23.88 0 0 0 0 24c0 3.88.93 7.54 2.56 10.78Z" />
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.91-5.8l-7.73-6c-2.15 1.45-4.92 2.3-8.18 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.5 42.62 14.62 48 24 48Z" />
          </svg>
        )}
        {pending ? "Opening Google…" : mode === "signup" ? "Sign up with Google" : "Sign in with Google"}
      </Button>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="google-auth-divider">or use email</div>
    </div>
  );
}
