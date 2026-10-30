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
export function SignupForm({
  configured,
  verificationRequired,
}: {
  configured: boolean;
  verificationRequired: boolean;
}) {
  const [error, setError] = useState("");
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
          ? "/verify-email?complete=true"
          : "/welcome",
      });
      if (result.error) {
        setError(authError(result.error, "signup"));
        return;
      }
      window.location.replace(
        verificationRequired
          ? `/verify-email?email=${encodeURIComponent(email)}`
          : "/welcome",
      );
    } catch {
      setError(
        "Authentication is temporarily unavailable. Please try again later.",
      );
    }
  }
  return (
    <AuthFrame
      title="Your journal starts here"
      description="A private space for your trading progress."
      configured={configured}
    >
      <form onSubmit={handleSubmit(submit)} noValidate aria-busy={isSubmitting}>
        <fieldset
          className="auth-fields"
          disabled={!configured || isSubmitting}
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
          <small className="muted">Use 8–128 characters.</small>
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
      <p className="login-privacy">
        Already have an account? <Link href="/login">Sign in</Link>
      </p>
    </AuthFrame>
  );
}
