"use client";
import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { LoaderCircle, Mail } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { authError } from "@/lib/auth-messages";
import { emailInput } from "@/lib/auth-validation";
import { AuthFrame } from "./auth-frame";
import { Button } from "@/components/ui/button";
const schema = z.object({ email: emailInput });
export function RecoveryForm({
  configured,
  emailReady,
  verify = false,
  initialEmail = "",
  invalid = false,
}: {
  configured: boolean;
  emailReady: boolean;
  verify?: boolean;
  initialEmail?: string;
  invalid?: boolean;
}) {
  const [error, setError] = useState(""),
    [sent, setSent] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { email: initialEmail },
  });
  async function submit({ email }: z.infer<typeof schema>) {
    setError("");
    try {
      const result = verify
        ? await authClient.sendVerificationEmail({
            email,
            callbackURL: "/verify-email?complete=true",
          })
        : await authClient.requestPasswordReset({
            email,
            redirectTo: "/reset-password",
          });
      if (result.error) {
        setError(authError(result.error, verify ? "verify" : "recovery"));
        return;
      }
      setSent(true);
    } catch {
      setError(
        "Email recovery is temporarily unavailable. Please try again later.",
      );
    }
  }
  return (
    <AuthFrame
      title={verify ? "Verify your email" : "Forgot your password?"}
      description={
        verify
          ? "Confirm your email to continue to your journal."
          : "We’ll help you get back to your journal."
      }
      configured={configured}
    >
      {invalid && (
        <p className="form-error" role="alert">
          This verification link is invalid or expired. Request a new link
          below.
        </p>
      )}
      {!emailReady && (
        <p className="setup-notice" role="status">
          Email {verify ? "verification" : "recovery"} is currently unavailable.
          You can still sign up and sign in when email verification is not
          required.
        </p>
      )}
      {sent ? (
        <div className="success-notice" role="status">
          <strong>Check your inbox</strong>
          <p>
            If this email belongs to{" "}
            {verify ? "an account needing verification" : "an account"}, you’ll
            receive a secure {verify ? "verification" : "reset"} link. Check
            your spam folder too.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit(submit)} noValidate>
          <fieldset
            className="auth-fields"
            disabled={!configured || !emailReady || isSubmitting}
          >
            <label className="form-field">
              Email
              <input
                {...register("email")}
                type="email"
                autoComplete="email"
                aria-invalid={!!errors.email}
                aria-describedby={
                  errors.email ? "recovery-email-error" : undefined
                }
              />
              {errors.email && (
                <span id="recovery-email-error" className="form-error">
                  {errors.email.message}
                </span>
              )}
            </label>
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
                <Mail size={16} />
              )}{" "}
              {isSubmitting
                ? "Requesting link…"
                : verify
                  ? "Send verification link"
                  : "Send reset link"}
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
