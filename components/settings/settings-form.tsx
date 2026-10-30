"use client";
import { LoadingSpinner } from "@/components/ui/loading";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion } from "motion/react";
import { Save, ShieldCheck } from "lucide-react";
import { preferencesSchema } from "@/lib/accounts/validation";
import type { Preferences } from "@/lib/accounts/types";
import { requestJson } from "@/lib/client-api";
import { Button } from "@/components/ui/button";
import { ThemeControl } from "@/components/shell";
import { LogoutButton } from "@/components/auth/logout";
import Link from "next/link";
import { TimezoneSelector } from "@/components/ui/timezone-selector";
import { ChangePassword } from "./change-password";
import { DataBackups } from "@/components/exports/download-controls";
export function SettingsForm({ preferences }: { preferences: Preferences }) {
  const router = useRouter();
  const [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<z.infer<typeof preferencesSchema>>({
    resolver: zodResolver(preferencesSchema),
    defaultValues: {
      displayName: preferences.displayName,
      displayTimezone: preferences.displayTimezone,
      currency: "USD",
      weekStartsOn: preferences.weekStartsOn,
    },
  });
  async function save(values: z.infer<typeof preferencesSchema>) {
    setMessage("");
    setError("");
    try {
      await requestJson("/api/preferences", {
        method: "PATCH",
        body: JSON.stringify(values),
      });
      reset(values);
      setMessage("Preferences saved.");
      router.refresh();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Unable to save preferences.",
      );
    }
  }
  return (
    <motion.div
      className="settings-page"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <header className="page-header">
        <div>
          <div className="breadcrumb">Workspace / Preferences</div>
          <h1>
            Settings<span className="title-dot">.</span>
          </h1>
          <p className="page-description">
            Your profile, display preferences, and private session.
          </p>
        </div>
      </header>
      <section className="panel settings-card">
        <header className="panel-header">
          <h2>Profile & display</h2>
        </header>
        <form onSubmit={handleSubmit(save)} noValidate>
          <label className="form-field">
            Display name *
            <input
              {...register("displayName")}
              autoComplete="name"
              aria-invalid={!!errors.displayName}
            />
            {errors.displayName && (
              <span className="form-error">{errors.displayName.message}</span>
            )}
          </label>
          <label className="form-field">
            Email
            <input value={preferences.email} readOnly aria-readonly="true" />
            <small>
              Your sign-in email. Email changes are not available here.
            </small>
          </label>
          <div className="form-field">
            <span>Journal display timezone *</span>
            <Controller
              name="displayTimezone"
              control={control}
              render={({ field }) => (
                <TimezoneSelector
                  label="Journal display timezone"
                  value={field.value}
                  onChange={field.onChange}
                  disabled={isSubmitting}
                />
              )}
            />
            <small>
              Changes timestamp presentation in import previews and history.
              Stored UTC timestamps and CSV source timezones remain unchanged.
              Calendar dates and daily realized results use this timezone.
            </small>
            {errors.displayTimezone && (
              <span className="form-error">
                {errors.displayTimezone.message}
              </span>
            )}
          </div>
          <label className="form-field">
            Calendar week starts on
            <select {...register("weekStartsOn", { valueAsNumber: true })}>
              <option value={0}>Sunday</option>
              <option value={1}>Monday</option>
            </select>
          </label>
          <label className="form-field">
            Display currency
            <input {...register("currency")} readOnly aria-readonly="true" />
          </label>
          <div className="theme-setting">
            <div>
              <strong>Appearance</strong>
              <p>
                Light, dark, or system. Saved on this browser for a fast first
                render.
              </p>
            </div>
            <ThemeControl />
          </div>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          {message && (
            <p role="status" className="success-notice">
              {message}
            </p>
          )}
          <Button type="submit" disabled={isSubmitting || !isDirty}>
            {isSubmitting ? (
              <LoadingSpinner className="pending-spinner" size={15} />
            ) : (
              <Save size={15} />
            )}{" "}
            {isSubmitting ? "Saving…" : "Save preferences"}
          </Button>
        </form>
      </section>
      <ChangePassword email={preferences.email} />
      <section className="import-card"><h2>Trading fees & net P&L</h2><p className="muted">Add or reconcile broker-reported fee totals for existing imports.</p><Link href="/fees">Manage fees →</Link></section>
      <DataBackups />
      <section className="panel settings-session">
        <ShieldCheck size={21} />
        <div>
          <h2>Your private session</h2>
          <p>
            Your session is stored in the database. Sign out to invalidate it on
            this device.
          </p>

        </div>
        <LogoutButton />
      </section>
    </motion.div>
  );
}
