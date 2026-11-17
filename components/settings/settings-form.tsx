"use client";
import { LoadingSpinner } from "@/components/ui/loading";

import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowUpRight, CreditCard, Palette, ReceiptText, Save, ShieldCheck, UserRound } from "lucide-react";
import { preferencesSchema } from "@/lib/accounts/validation";
import type { Preferences } from "@/lib/accounts/types";
import { requestJson } from "@/lib/client-api";
import { Button } from "@/components/ui/button";
import { ThemeControl } from "@/components/shell";
import { LogoutButton } from "@/components/auth/logout";
import Link from "next/link";
import { TimezoneSelector } from "@/components/ui/timezone-selector";
import { ChangePassword } from "./change-password";
import { AccountUsage } from "@/components/billing/access";
import { SettingsNavigation } from "./settings-navigation";
const subscribe = () => () => {};
export function SettingsForm({ preferences }: { preferences: Preferences }) {
  const hydrated = useSyncExternalStore(subscribe, () => true, () => false);
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
    <div className="settings-page settings-workspace">
      <header className="page-header">
        <div>
          <div className="breadcrumb">Workspace / Settings</div>
          <h1>
            Settings<span className="title-dot">.</span>
          </h1>
          <p className="page-description">
            A few personal touches for your trading workspace.
          </p>
        </div>
      </header>
      <SettingsNavigation active="general" />
      <section className="panel settings-membership" aria-labelledby="settings-membership-title">
        <span className="settings-section-icon"><CreditCard size={23} aria-hidden="true" /></span>
        <div className="settings-membership-copy">
          <span className="settings-overline">YOUR MEMBERSHIP</span>
          <h2 id="settings-membership-title">Your plan, in one place.</h2>
          <p>View your plan, choose your billing period, or manage renewal.</p>
          <AccountUsage />
        </div>
        <Button asChild><Link href="/settings/billing">Manage plan &amp; billing<ArrowUpRight size={16} /></Link></Button>
      </section>
      <div className="settings-content-grid">
      <section className="panel settings-card settings-profile" aria-labelledby="settings-profile-title">
        <header className="panel-header">
          <span className="settings-section-icon"><UserRound size={18} aria-hidden="true" /></span>
          <div><h2 id="settings-profile-title">Profile &amp; display</h2><p>The details that make this workspace yours.</p></div>
        </header>
        <form onSubmit={handleSubmit(save)} noValidate aria-busy={isSubmitting}>
          <label className="form-field">
            Display name *
            <input
              {...register("displayName")}
              disabled={!hydrated || isSubmitting}
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
              Used to sign in. Email changes are not available here.
            </small>
          </label>
          <div className="form-field settings-field-wide">
            <span>Journal display timezone *</span>
            <Controller
              name="displayTimezone"
              control={control}
              render={({ field }) => (
                <TimezoneSelector
                  label="Journal display timezone"
                  value={field.value}
                  onChange={field.onChange}
                  disabled={!hydrated || isSubmitting}
                />
              )}
            />
            <small>
              Used for trade timestamps, calendar days and daily results.
            </small>
            {errors.displayTimezone && (
              <span className="form-error">
                {errors.displayTimezone.message}
              </span>
            )}
          </div>
          <label className="form-field">
            Calendar week starts on
            <select {...register("weekStartsOn", { valueAsNumber: true })} disabled={!hydrated || isSubmitting}>
              <option value={0}>Sunday</option>
              <option value={1}>Monday</option>
            </select>
          </label>
          <label className="form-field">
            Display currency
            <input {...register("currency")} readOnly aria-readonly="true" />
          </label>
          {error && (
            <p role="alert" className="form-error settings-field-wide">
              {error}
            </p>
          )}
          {message && !isDirty && (
            <p role="status" className="success-notice settings-field-wide">
              {message}
            </p>
          )}
          <div className="settings-save-bar"><span>{isDirty ? "You have unsaved changes" : "Your preferences are up to date"}</span><Button type="submit" disabled={!hydrated || isSubmitting || !isDirty}>
            {isSubmitting ? (
              <LoadingSpinner className="pending-spinner" size={15} />
            ) : (
              <Save size={15} />
            )}{" "}
            {isSubmitting ? "Saving…" : "Save preferences"}
          </Button></div>
        </form>
      </section>
      <aside className="settings-side-panels" aria-label="Workspace preferences">
        <section className="panel settings-side-card">
          <span className="settings-section-icon"><Palette size={19} aria-hidden="true" /></span>
          <h2>Appearance</h2>
          <p>Find your focus in light, dark, or your system theme.</p>
          <div className="settings-appearance-control"><span>Workspace theme<small>Saved on this browser</small></span><ThemeControl /></div>
        </section>
        <section className="panel settings-side-card settings-fees">
          <span className="settings-section-icon"><ReceiptText size={19} aria-hidden="true" /></span>
          <h2>Trading fees &amp; net P&amp;L</h2>
          <p>Add or reconcile trading fees from your broker reports.</p>
          <Link href="/fees">Manage trading fees<ArrowUpRight size={14} aria-hidden="true" /></Link>
        </section>
      </aside>
      </div>
      <ChangePassword email={preferences.email} />
      <section className="panel settings-session">
        <ShieldCheck size={21} />
        <div>
          <h2>Your private session</h2>
          <p>
            Sign out of MSJournal on this device when you are finished.
          </p>

        </div>
        <LogoutButton />
      </section>
    </div>
  );
}
