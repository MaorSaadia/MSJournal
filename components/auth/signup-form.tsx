"use client";
import { LoadingSpinner } from "@/components/ui/loading";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { ArrowRight } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { signupInput } from "@/lib/auth-validation";
import { authError } from "@/lib/auth-messages";
import { AuthFrame } from "./auth-frame";
import { PasswordField } from "./password-field";
import { Button } from "@/components/ui/button";
import { GoogleAuthButton } from "./google-auth-button";
export function SignupForm({
  configured,
  verificationRequired,
  destination = "/welcome",
  googleEnabled = false,
  googleError = false,
}: {
  configured: boolean;
  verificationRequired: boolean;
  destination?: string;
  googleEnabled?: boolean;
  googleError?: boolean;
}) {
  const [error, setError] = useState("");
  const [googlePending, setGooglePending] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof signupInput>>({
    resolver: zodResolver(signupInput),
    defaultValues: { name: "", email: "", password: "", confirmPassword: "" },
  });
  async function submit({
    name,
    email,
    password,
  }: z.infer<typeof signupInput>) {
    setError("");
    try {
      const result = await authClient.signUp.email({
        name,
        email,
        password,
        callbackURL: verificationRequired
          ? `/verify-email?complete=true&next=${encodeURIComponent(destination)}`
          : destination,
      });
      if (result.error) {
        setError(authError(result.error, "signup"));
        return;
      }
      window.location.replace(
        verificationRequired
          ? `/verify-email?email=${encodeURIComponent(email)}&next=${encodeURIComponent(destination)}`
          : destination,
      );
    } catch {
      setError(
        "Authentication is temporarily unavailable. Please try again later.",
      );
    }
  }
  return (
    <AuthFrame
      title="Create your account"
      description="Start free with one trading account."
      configured={configured}
      centered
    >
      {configured && googleEnabled && (
        <GoogleAuthButton destination={destination} mode="signup" returnedWithError={googleError} disabled={isSubmitting} onPending={setGooglePending} />
      )}
      <form method="post" onSubmit={handleSubmit(submit)} noValidate aria-busy={isSubmitting}>
        <fieldset
          className="auth-fields"
          disabled={!configured || isSubmitting || googlePending}
        >
          <label className="form-field">
            Name
            <input
              {...register("name")}
              autoComplete="name"
              aria-invalid={!!errors.name}
            />
            {errors.name && (
              <span className="form-error">{errors.name.message}</span>
            )}
          </label>
          <label className="form-field">
            Email
            <input
              {...register("email")}
              type="email"
              autoComplete="email"
              aria-invalid={!!errors.email}
            />
            {errors.email && (
              <span className="form-error">{errors.email.message}</span>
            )}
          </label>
          <PasswordField
            {...register("password")}
            autoComplete="new-password"
            error={errors.password?.message}
          />
          <small className="muted">Use at least 8 characters.</small>
          <PasswordField
            {...register("confirmPassword")}
            label="Confirm password"
            autoComplete="new-password"
            error={errors.confirmPassword?.message}
          />
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <Button
            type="submit"
            className="login-submit"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <LoadingSpinner size={16} className="pending-spinner" />
            ) : (
              <ArrowRight size={16} />
            )}{" "}
            {isSubmitting ? "Creating account…" : "Create account"}
          </Button>
        </fieldset>
      </form>
      <p className="auth-legal-note">
        By creating an account, you agree to the <Link href="/terms">Terms of Use</Link> and acknowledge the <Link href="/privacy">Privacy Policy</Link>.
      </p>
      <p className="login-privacy login-signup-prompt">
        Already have an account? <Link href={`/login?next=${encodeURIComponent(destination)}`}>Sign in</Link>
      </p>
    </AuthFrame>
  );
}
