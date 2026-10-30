"use client";
import { LoadingSpinner } from "@/components/ui/loading";

import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Save } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  FIRMS,
  STAGES,
  STATUSES,
  tradingAccountSchema,
  type AccountFormValues,
} from "@/lib/accounts/validation";
import type { TradingAccount } from "@/lib/accounts/types";
import { RequestError, requestJson } from "@/lib/client-api";
const defaults: AccountFormValues = {
  displayName: "",
  programName: "",
  startDate: "",
  firmChoice: "",
  customFirm: "",
  platform: "Tradovate",
  brokerIdentifier: "",
  stage: "Evaluation",
  status: "Active",
  nominalSize: "",
  openingBalance: "",
  openingBalanceDate: "",
  currency: "USD",
  reportingTimezone: "Asia/Jerusalem",
  notes: "",
};
function initialValues(account?: TradingAccount): AccountFormValues {
  if (!account) return defaults;
  const known = FIRMS.find((f) => f === account.firm);
  return {
    displayName: account.displayName,
    programName: account.programName ?? "",
    startDate: account.startDate ?? "",
    firmChoice: account.stage === "Personal" ? "" : (known ?? "Other"),
    customFirm: known ? "" : (account.firm ?? ""),
    platform: account.platform,
    brokerIdentifier: account.brokerIdentifier ?? "",
    stage: account.stage,
    status: account.status,
    nominalSize: account.nominalSize,
    openingBalance: account.openingBalance ?? "",
    openingBalanceDate: account.openingBalanceDate ?? "",
    currency: "USD",
    reportingTimezone: account.reportingTimezone,
    notes: account.notes ?? "",
  };
}
export function AccountForm({
  account,
  tracked = false,
  onClose,
  onSaved,
}: {
  account?: TradingAccount;
  tracked?: boolean;
  onClose: () => void;
  onSaved: (account: TradingAccount) => void;
}) {
  const [error, setError] = useState(""),
    [discard, setDiscard] = useState(false);
  const {
    register,
    control,
    handleSubmit,
    reset,
    setError: setFieldError,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<AccountFormValues>({
    resolver: zodResolver(tradingAccountSchema),
    defaultValues: initialValues(account),
  });
  const stage = useWatch({ control, name: "stage" }),
    firmChoice = useWatch({ control, name: "firmChoice" });
  useEffect(() => {
    if (!isDirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isDirty]);
  const dismiss = () => {
    if (isSubmitting) return;
    if (isDirty) setDiscard(true);
    else onClose();
  };
  async function save(values: AccountFormValues) {
    setError("");
    try {
      const result = await requestJson<{ account: TradingAccount }>(
        account
          ? `/api/trading-accounts/${account.id}`
          : "/api/trading-accounts",
        { method: account ? "PATCH" : "POST", body: JSON.stringify(values) },
      );
      reset(values);
      onSaved(result.account);
    } catch (error) {
      if (error instanceof RequestError) {
        setError(error.message);
        if (error.field)
          setFieldError(error.field as keyof AccountFormValues, {
            message: error.message,
          });
        for (const issue of error.issues ?? []) {
          const name = issue.path[0] as keyof AccountFormValues;
          if (name in defaults) setFieldError(name, { message: issue.message });
        }
      } else
        setError(
          "Unable to save. Your entered values are preserved; please try again.",
        );
    }
  }
  const fieldError = (name: keyof AccountFormValues) =>
    errors[name] ? (
      <span id={`error-${name}`} className="form-error">
        {errors[name]?.message}
      </span>
    ) : null;
  const accessible = (name: keyof AccountFormValues) => ({
    "aria-invalid": !!errors[name],
    "aria-describedby": errors[name] ? `error-${name}` : undefined,
  });
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) dismiss();
      }}
    >
      <DialogContent
        className="account-form-dialog"
        onEscapeKeyDown={(event) => {
          if (isDirty || isSubmitting) {
            event.preventDefault();
            dismiss();
          }
        }}
        onPointerDownOutside={(event) => {
          if (isDirty || isSubmitting) {
            event.preventDefault();
            dismiss();
          }
        }}
      >
        <DialogTitle>
          {account ? "Edit trading account" : "Add trading account"}
        </DialogTitle>
        <DialogDescription>
          Keep your accounts organized. Required fields are marked with *. No
          trades or firm rules are added today.
        </DialogDescription>
        {discard && (
          <div className="discard-notice" role="alert">
            <strong>Discard unsaved changes?</strong>
            <p>Your entered account details have not been saved.</p>
            <div>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDiscard(false)}
              >
                Keep editing
              </Button>
              <Button type="button" variant="destructive" onClick={onClose}>
                Discard changes
              </Button>
            </div>
          </div>
        )}
        <form onSubmit={handleSubmit(save)} noValidate>
          <fieldset disabled={isSubmitting} className="account-form-grid">
            <label className="form-field form-wide">
              Display name *
              <input
                {...register("displayName")}
                {...accessible("displayName")}
                autoFocus
                autoComplete="off"
                placeholder="e.g. My evaluation account"
              />
              {fieldError("displayName")}
            </label>
            <label className="form-field">
              Stage *
              <select
                disabled={tracked}
                {...register("stage")}
                aria-label="Stage"
                {...accessible("stage")}
              >
                {STAGES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
              {fieldError("stage")}
            </label>
            <label className="form-field">
              Status *
              <select
                disabled={tracked}
                {...register("status")}
                aria-label="Status"
                {...accessible("status")}
              >
                {STATUSES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
              {fieldError("status")}
            </label>
            {stage !== "Personal" && (
              <label className="form-field">
                Prop firm *
                <select
                  {...register("firmChoice")}
                  aria-label="Prop firm"
                  {...accessible("firmChoice")}
                >
                  <option value="">Select a firm</option>
                  {[...FIRMS, "Other"].map((f) => (
                    <option key={f} value={f}>
                      {f === "Other" ? "Custom" : f}
                    </option>
                  ))}
                </select>
                {fieldError("firmChoice")}
              </label>
            )}
            {stage !== "Personal" && firmChoice === "Other" && (
              <label className="form-field">
                Custom firm name *
                <input
                  {...register("customFirm")}
                  {...accessible("customFirm")}
                />
                {fieldError("customFirm")}
              </label>
            )}
            <label className="form-field">
              Platform
              <input {...register("platform")} />
            </label>
            <label className="form-field form-wide">
              Broker account identifier{" "}
              <span className="optional-label">Optional</span>
              <input
                {...register("brokerIdentifier")}
                {...accessible("brokerIdentifier")}
                autoComplete="off"
                placeholder="Exact Tradovate account identifier"
              />
              <small>
                Preserved as text, including leading zeros. Map this before
                future imports; archived identifiers stay reserved.
              </small>
              {fieldError("brokerIdentifier")}
            </label>
            <label className="form-field">
              Program name
              <input
                {...register("programName")}
                {...accessible("programName")}
                placeholder="Your program / plan"
              />
              {fieldError("programName")}
            </label>
            <label className="form-field">
              Account start date
              <input
                type="date"
                {...register("startDate")}
                {...accessible("startDate")}
              />
              {fieldError("startDate")}
            </label>
            <label className="form-field">
              Nominal account size (USD) *
              <input
                {...register("nominalSize")}
                {...accessible("nominalSize")}
                aria-label="Nominal account size (USD) *"
                inputMode="decimal"
                placeholder="50000.00"
              />
              <small>Account size, not a current balance.</small>
              {fieldError("nominalSize")}
            </label>
            <label className="form-field">
              Reporting timezone *
              <input
                {...register("reportingTimezone")}
                {...accessible("reportingTimezone")}
                list="account-timezones"
                autoComplete="off"
              />
              <small>Use an IANA timezone with DST support.</small>
              {fieldError("reportingTimezone")}
            </label>
            <label className="form-field">
              Opening balance (USD){" "}
              <span className="optional-label">Optional</span>
              <input
                {...register("openingBalance")}
                {...accessible("openingBalance")}
                inputMode="decimal"
                placeholder="Explicit baseline only"
              />
              {fieldError("openingBalance")}
            </label>
            <label className="form-field">
              Opening-balance effective date
              <input
                type="date"
                {...register("openingBalanceDate")}
                {...accessible("openingBalanceDate")}
              />
              <small>Required when entering a baseline.</small>
              {fieldError("openingBalanceDate")}
            </label>
            <label className="form-field form-wide">
              Notes <span className="optional-label">Optional</span>
              <textarea
                rows={3}
                {...register("notes")}
                {...accessible("notes")}
              />
              {fieldError("notes")}
            </label>
          </fieldset>
          <datalist id="account-timezones">
            {["Asia/Jerusalem", "America/New_York", "Europe/London", "UTC"].map(
              (t) => (
                <option key={t} value={t} />
              ),
            )}
          </datalist>
          <p className="form-explanation">
            {tracked &&
              "Use the dated phase/status actions in account Overview to change a tracked phase or status. "}
            Currency: USD. An opening balance is an entered baseline; it is
            never shown as a verified current balance.
          </p>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="account-form-actions">
            <Button
              type="button"
              variant="outline"
              disabled={isSubmitting}
              onClick={dismiss}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <LoadingSpinner size={15} className="pending-spinner" />
              ) : (
                <Save size={15} />
              )}{" "}
              {isSubmitting ? "Saving…" : "Save account"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
