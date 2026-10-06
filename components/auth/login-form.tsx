"use client";
import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { LoaderCircle, ArrowRight } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { authError } from "@/lib/auth-messages";
import { loginInput } from "@/lib/auth-validation";
import { AuthFrame } from "./auth-frame";
import { PasswordField } from "./password-field";
import { Button } from "@/components/ui/button";
export function LoginForm({
  configured,
  destination,
  unavailable = false,
}: {
  configured: boolean;
  destination: string;
  unavailable?: boolean;
}) {
  const [error, setError] = useState("");
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
      description="A little reflection. A better next trade."
      configured={configured}
    >
      {unavailable && (
        <p className="form-error" role="alert">
          Authentication is temporarily unavailable. Please try again later.
        </p>
      )}
      <form onSubmit={handleSubmit(signIn)} noValidate>
        <fieldset
          disabled={!configured || isSubmitting}
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
              <LoaderCircle size={16} className="pending-spinner" />
            ) : (
              <ArrowRight size={16} />
            )}{" "}
            {isSubmitting ? "Signing in…" : "Sign in"}
          </Button>
        </fieldset>
      </form>
      <p className="login-privacy">
        Don’t have an account? <Link href="/signup">Sign up</Link>
      </p>
      <p className="small muted">
        <Link href="/verify-email">Request an email verification link</Link>
      </p>
    </AuthFrame>
  );
}
