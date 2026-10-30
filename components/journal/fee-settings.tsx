"use client";
import { LoadingSpinner } from "@/components/ui/loading";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { requestJson } from "@/lib/client-api";
import { useWritingGuard } from "@/components/daily/writing-guard";
export function FeeSettings({
  accountId,
  initialRate,
  initialOverrides,
}: {
  accountId: string;
  initialRate: string | null;
  initialOverrides: Record<string, string>;
}) {
  const router = useRouter(),
    guard = useRef(false);
  const [rate, setRate] = useState(initialRate ?? ""),
    [overrides, setOverrides] = useState(
      Object.entries(initialOverrides).map(([contract, rate]) => ({
        contract,
        rate,
      })),
    ),
    [apply, setApply] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const signature = JSON.stringify({ rate, overrides, apply });
  const [savedSignature, setSavedSignature] = useState(signature);
  const dirty = useCallback(
    () => signature !== savedSignature,
    [signature, savedSignature],
  );
  useWritingGuard(dirty);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (guard.current) return;
    setError("");
    setMessage("");
    if (
      new Set(overrides.map((o) => o.contract.trim())).size !== overrides.length
    ) {
      setError("Use each exact contract only once.");
      return;
    }
    guard.current = true;
    setBusy(true);
    try {
      await requestJson("/api/journal/fees", {
        method: "POST",
        body: JSON.stringify({
          accountId,
          perSide: rate.trim() || null,
          contractOverrides: Object.fromEntries(
            overrides.map((o) => [o.contract.trim(), o.rate.trim()]),
          ),
          applyExisting: apply,
        }),
      });
      setSavedSignature(signature);
      setMessage(
        apply
          ? "Fee settings saved and applied to existing nonmanual trades. Entered fee totals and manual overrides were preserved."
          : "Fee settings saved for newly processed trades. Existing estimates, entered totals and manual overrides were preserved.",
      );
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save fees.");
    } finally {
      guard.current = false;
      setBusy(false);
    }
  }
  return (
    <form className="journal-fee-form" onSubmit={save}>
      <fieldset disabled={busy} className="fee-estimate-fields">
        <label className="field-label">
          Estimated all-in fee per contract, per side (USD)
          <input
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            inputMode="decimal"
            placeholder="Unset — fees unknown"
            pattern="[0-9]+(\.[0-9]{1,8})?"
          />
        </label>
        <p className="small muted">
          Estimated round-trip fees = matched quantity × 2 × per-side fee. Missing
          fees remain unknown; an explicit 0 means zero. No prop-firm fee schedule
          is assumed.
        </p>
        <details>
          <summary>Exact-contract overrides (optional)</summary>
          {overrides.map((o, i) => (
            <div className="journal-override" key={i}>
              <label className="field-label">
                Exact contract
                <input
                  value={o.contract}
                  onChange={(e) =>
                    setOverrides(
                      overrides.map((v, n) =>
                        n === i ? { ...v, contract: e.target.value } : v,
                      ),
                    )
                  }
                  required
                  maxLength={40}
                  placeholder="MNQU6"
                />
              </label>
              <label className="field-label">
                Per-side fee (USD)
                <input
                  value={o.rate}
                  onChange={(e) =>
                    setOverrides(
                      overrides.map((v, n) =>
                        n === i ? { ...v, rate: e.target.value } : v,
                      ),
                    )
                  }
                  required
                  inputMode="decimal"
                  pattern="[0-9]+(\.[0-9]{1,8})?"
                />
              </label>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOverrides(overrides.filter((_, n) => n !== i))}
              >
                Remove
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              setOverrides([...overrides, { contract: "", rate: "" }])
            }
            disabled={overrides.length >= 50}
          >
            Add contract override
          </Button>
        </details>
        <label className="import-confirm">
          <input
            type="checkbox"
            checked={apply}
            onChange={(e) => setApply(e.target.checked)}
          />
          Apply these settings to existing trades, including previously unknown
          fees. Preserve entered totals and manual overrides.
        </label>
        <Button disabled={busy} aria-busy={busy}>{busy ? <><LoadingSpinner />Saving</> : "Save fee settings"}</Button>
      </fieldset>
      {error && (
        <p role="alert" className="negative">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="positive">
          {message}
        </p>
      )}
    </form>
  );
}
