"use client";
import { LoadingSpinner } from "@/components/ui/loading";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Save } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { authError } from "@/lib/auth-messages";
import { resetInput } from "@/lib/auth-validation";
import { AuthFrame } from "./auth-frame";
import { PasswordField } from "./password-field";
import { Button } from "@/components/ui/button";
export function ResetForm({ configured }: { configured: boolean }) {
  const query = useSearchParams();
  const [token, setToken] = useState(() => {
      const value = query.get("token") ?? "";
      return !query.has("error") && /^[A-Za-z0-9_-]{10,1024}$/.test(value)
        ? value
        : "";
    }),
    [error, setError] = useState(""),
    [complete, setComplete] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof resetInput>>({
    resolver: zodResolver(resetInput),
    defaultValues: { password: "", confirmPassword: "" },
  });
  useEffect(() => {
    // Retain the credential only in component memory, not browser history/referrers.
    window.history.replaceState(
      window.history.state,
      "",
      window.location.pathname,
    );
  }, []);
  async function submit({ password }: z.infer<typeof resetInput>) {
    if (!token) return;
    setError("");
    try {
      const result = await authClient.resetPassword({
        token,
        newPassword: password,
      });
      if (result.error) {
        setError(authError(result.error, "reset"));
        if (
          ["INVALID_TOKEN", "TOKEN_EXPIRED"].includes(result.error.code ?? "")
        )
          setToken("");
        return;
      }
      setToken("");
      setComplete(true);
    } catch {
      setError(
        "Authentication is temporarily unavailable. Please try again later.",
      );
    }
  }
  return (
    <AuthFrame
      title="Choose a new password"
      description="A fresh start for your private journal."
      configured={configured}
    >
      {complete ? (
        <div className="success-notice" role="status">
          <strong>Your password has been reset</strong>
          <p>
            Previous sessions have been signed out.{" "}
            <Link href="/login">Sign in with your new password</Link>.
          </p>
        </div>
      ) : token === null ? (
        <p role="status">Checking your link…</p>
      ) : !token ? (
        <div>
          <p className="form-error" role="alert">
            This reset link is invalid or expired.
          </p>
          <Link href="/forgot-password">Request a new reset link</Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit(submit)} noValidate aria-busy={isSubmitting}>
          <fieldset
            className="auth-fields"
            disabled={!configured || isSubmitting}
          >
            <PasswordField
              {...register("password")}
              label="New password"
              autoComplete="new-password"
              error={errors.password?.message}
            />
            <PasswordField
              {...register("confirmPassword")}
              label="Confirm password"
              autoComplete="new-password"
              error={errors.confirmPassword?.message}
            />
            {error && (
              <p role="alert" className="form-error">
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
                <Save size={16} />
              )}{" "}
              {isSubmitting ? "Resetting password…" : "Reset password"}
            </Button>
          </fieldset>
        </form>
      )}
      <p className="login-privacy">
        <Link href="/login">Back to sign in</Link>
      </p>
    </AuthFrame>
  );
}
