"use client";
import { useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { KeyRound } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { authError } from "@/lib/auth-messages";
import { changePasswordInput } from "@/lib/auth-validation";
import { PasswordField } from "@/components/auth/password-field";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading";
const subscribe = () => () => {};
export function ChangePassword({ email }: { email: string }) {
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const inFlight = useRef(false);
  const [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [signInAgain, setSignInAgain] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    setError: setFieldError,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof changePasswordInput>>({
    resolver: zodResolver(changePasswordInput),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
      revokeOtherSessions: true,
    },
  });
  async function change(values: z.infer<typeof changePasswordInput>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setMessage("");
    setError("");
    setSignInAgain(false);
    try {
      const result = await authClient.changePassword({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
        revokeOtherSessions: values.revokeOtherSessions,
      });
      if (result.error) {
        const text = authError(result.error, "change");
        if (result.error.code === "INVALID_PASSWORD")
          setFieldError(
            "currentPassword",
            { type: "server", message: text },
            { shouldFocus: true },
          );
        else {
          setError(text);
          setSignInAgain(
            result.error.status === 401 ||
              result.error.code === "SESSION_NOT_FRESH",
          );
        }
        return;
      }
      reset({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
        revokeOtherSessions: values.revokeOtherSessions,
      });
      setMessage(
        values.revokeOtherSessions
          ? "Password updated. Other devices have been signed out. You remain signed in here."
          : "Password updated. You remain signed in here.",
      );
    } catch {
      setError(
        "Authentication is temporarily unavailable. Please try again later.",
      );
    } finally {
      inFlight.current = false;
    }
  }
  return (
    <section
      className="panel settings-card settings-password"
      aria-labelledby="change-password-heading"
      id="password"
    >
      <header className="panel-header">
        <h2 id="change-password-heading">
          <KeyRound size={16} aria-hidden="true" />
          Change password
        </h2>
      </header>
      <form
        method="post"
        onSubmit={(event) => void handleSubmit(change)(event)}
        noValidate
        aria-busy={isSubmitting}
      >
        <p className="small muted">
          Update the password you use to sign in. Use 8 to 128 characters.
        </p>
        <input
          type="hidden"
          name="username"
          autoComplete="username"
          value={email}
        />
        <fieldset disabled={!hydrated || isSubmitting}>
          <PasswordField
            label="Current password"
            {...register("currentPassword")}
            autoComplete="current-password"
            maxLength={128}
            error={errors.currentPassword?.message}
          />
          <div className="settings-password-fields">
            <PasswordField
              label="New password"
              {...register("newPassword")}
              autoComplete="new-password"
              maxLength={128}
              error={errors.newPassword?.message}
            />
            <PasswordField
              label="Confirm new password"
              {...register("confirmPassword")}
              autoComplete="new-password"
              maxLength={128}
              error={errors.confirmPassword?.message}
            />
          </div>
          <label className="settings-password-sessions">
            <input type="checkbox" {...register("revokeOtherSessions")} />
            <span>
              Sign out other devices
              <small>Your current browser stays signed in.</small>
            </span>
          </label>
        </fieldset>
        {error && (
          <p className="form-error" role="alert">
            {error}
            {signInAgain && (
              <>
                {" "}
                <Link href="/login?next=%2Fsettings">Sign in again</Link>
              </>
            )}
          </p>
        )}
        {message && (
          <p className="success-notice" role="status">
            {message}
          </p>
        )}
        <div className="settings-password-actions">
          <Link href="/forgot-password">Forgot your password?</Link>
          <Button
            type="submit"
            disabled={!hydrated || isSubmitting}
            aria-busy={isSubmitting}
          >
            {isSubmitting ? (
              <LoadingSpinner size={15} />
            ) : (
              <KeyRound size={15} />
            )}
            {isSubmitting ? "Updating password" : "Update password"}
          </Button>
        </div>
      </form>
    </section>
  );
}
