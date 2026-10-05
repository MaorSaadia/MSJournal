"use client";
import { useState } from "react";
import { motion } from "motion/react";
import {
  LockKeyhole,
  Eye,
  EyeOff,
  LoaderCircle,
  ArrowRight,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { ThemeControl } from "@/components/shell";
const loginSchema = z.object({
  email: z.email("Enter a valid email address.").trim(),
  password: z.string().min(1, "Enter your password.").max(128),
});
export function LoginForm({
  configured,
  destination,
  unavailable = false,
}: {
  configured: boolean;
  destination: string;
  unavailable?: boolean;
}) {
  const [visible, setVisible] = useState(false),
    [error, setError] = useState("");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });
  async function signIn(input: z.infer<typeof loginSchema>) {
    setError("");
    try {
      const result = await authClient.signIn.email({
        ...input,
        callbackURL: destination,
      });
      if (result.error) {
        setError(
          result.error.status === 429
            ? "Too many attempts. Wait one minute and try again."
            : result.error.status === 503
              ? "Sign-in is temporarily unavailable. Check your database configuration."
              : "The email or password is incorrect.",
        );
        return;
      }
      window.location.replace(destination);
    } catch {
      setError("Unable to sign in. Check the connection and try again.");
    }
  }
  return (
    <div className="login-page">
      <header className="login-header">
        <span className="brand-name">
          MS<span>Journal</span>
        </span>
        <ThemeControl />
      </header>
      <motion.main
        className="login-card"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="dialog-symbol">
          <LockKeyhole size={25} />
        </div>
        <span className="eyebrow">YOUR PRIVATE WORKSPACE</span>
        <h1>
          Welcome back<span className="title-dot">.</span>
        </h1>
        <p className="muted">A little reflection. A better next trade.</p>
        {!configured && (
          <div className="setup-notice" role="status">
            <strong>Private sign-in needs local setup</strong>
            <p>
              Configure Neon and authentication in <code>.env.local</code>,
              apply the reviewed migration, then bootstrap your owner account.
              Follow README.md. Your journal stays private until setup is
              complete.
            </p>
          </div>
        )}
        {unavailable && (
          <p role="alert" className="form-error">
            The database is temporarily unavailable. Check your local
            configuration.
          </p>
        )}
        <form onSubmit={handleSubmit(signIn)} noValidate>
          <label className="form-field">
            Owner email
            <input
              {...register("email")}
              type="email"
              autoComplete="username"
              placeholder="you@example.com"
              disabled={!configured || isSubmitting}
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? "login-email-error" : undefined}
            />
            {errors.email && (
              <span id="login-email-error" className="form-error">
                {errors.email.message}
              </span>
            )}
          </label>
          <label className="form-field">
            Password
            <div className="password-input">
              <input
                {...register("password")}
                type={visible ? "text" : "password"}
                autoComplete="current-password"
                disabled={!configured || isSubmitting}
                aria-invalid={!!errors.password}
                aria-describedby={
                  errors.password ? "login-password-error" : undefined
                }
              />
              <button
                type="button"
                aria-label={visible ? "Hide password" : "Show password"}
                onClick={() => setVisible(!visible)}
              >
                {visible ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {errors.password && (
              <span id="login-password-error" className="form-error">
                {errors.password.message}
              </span>
            )}
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <Button
            type="submit"
            disabled={!configured || isSubmitting}
            className="login-submit"
          >
            {isSubmitting ? (
              <LoaderCircle size={16} className="pending-spinner" />
            ) : (
              <ArrowRight size={16} />
            )}{" "}
            {isSubmitting ? "Signing in…" : "Sign in"}
          </Button>
        </form>
        <p className="login-privacy">
          Owner access only. Public registration is disabled.
        </p>
        <p className="small muted">
          Password recovery is available through the documented local owner
          command.
        </p>
      </motion.main>
      <footer className="login-footer">
        MSJournal · Your personal trading journal
      </footer>
    </div>
  );
}
