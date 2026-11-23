"use client";
import { LoadingSpinner } from "@/components/ui/loading";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { ArrowRight } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { authError } from "@/lib/auth-messages";
import { loginInput } from "@/lib/auth-validation";
import { AuthFrame } from "./auth-frame";
import { PasswordField } from "./password-field";
import { Button } from "@/components/ui/button";
import { GoogleAuthButton } from "./google-auth-button";
export function LoginForm({
  configured,
  destination,
  unavailable = false,
  googleEnabled = false,
  googleError = false,
}: {
  configured: boolean;
  destination: string;
  unavailable?: boolean;
  googleEnabled?: boolean;
  googleError?: boolean;
}) {
  const [error, setError] = useState("");
  const [googlePending, setGooglePending] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof loginInput>>({
    resolver: zodResolver(loginInput),
    defaultValues: { email: "", password: "" },
  });
  async function signIn(input: z.infer<typeof loginInput>) {
    setError("");
    try {
      const result = await authClient.signIn.email({
        ...input,
        callbackURL: destination,
      });
      if (result.error) {
        setError(authError(result.error, "login"));
        return;
      }
      window.location.replace(destination);
    } catch {
      setError(
        "Authentication is temporarily unavailable. Please try again later.",
      );
    }
  }
  return (
    <AuthFrame
      title="Welcome back"
      description="Sign in to your private trading journal."
      configured={configured}
      centered
    >
      {unavailable && (
        <p className="form-error" role="alert">
          Authentication is temporarily unavailable. Please try again later.
        </p>
      )}
      {configured && googleEnabled && (
        <GoogleAuthButton destination={destination} mode="login" returnedWithError={googleError} disabled={isSubmitting} onPending={setGooglePending} />
      )}
      <form method="post" onSubmit={handleSubmit(signIn)} noValidate aria-busy={isSubmitting}>
        <fieldset
          disabled={!configured || isSubmitting || googlePending}
          className="auth-fields"
        >
          <label className="form-field">
            Email
            <input
              {...register("email")}
              type="email"
              autoComplete="username"
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? "email-error" : undefined}
            />
            {errors.email && (
              <span id="email-error" className="form-error">
                {errors.email.message}
              </span>
            )}
          </label>
          <PasswordField
            {...register("password")}
            autoComplete="current-password"
            error={errors.password?.message}
          />
          <Link href="/forgot-password" className="auth-inline-link">
            Forgot password?
          </Link>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <Button
            className="login-submit"
            type="submit"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <LoadingSpinner size={16} className="pending-spinner" />
            ) : (
              <ArrowRight size={16} />
            )}{" "}
            {isSubmitting ? "Signing in…" : "Sign in"}
          </Button>
        </fieldset>
      </form>
      <p className="login-privacy login-signup-prompt">
        Don’t have an account? <Link href={`/signup?next=${encodeURIComponent(destination)}`}>Sign up</Link>
      </p>
    </AuthFrame>
  );
}
