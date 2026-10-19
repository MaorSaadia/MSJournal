"use client";
import { useState } from "react";
import { Check, LoaderCircle, Plus, Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { requestJson } from "@/lib/client-api";
import { firmTiles } from "@/lib/props/setup-model";

export function AddFirmDialog({
  existing,
  onClose,
  onSaved,
}: {
  existing: string[];
  onClose: () => void;
  onSaved: (names: string[], added: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState("");
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const name = selected === "Custom" ? custom.trim() : selected;
  const added = (name: string) =>
    existing.some((f) => f.toLowerCase() === name.toLowerCase());
  async function save() {
    if (!name || added(name) || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await requestJson<{ firms: string[] }>("/api/prop-firms", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      onSaved(result.firms, name);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not add the firm. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent
        className="prop-add-firm-dialog"
        onEscapeKeyDown={(e) => {
          if (busy) e.preventDefault();
        }}
        onPointerDownOutside={(e) => {
          if (busy) e.preventDefault();
        }}
      >
        <div>
          <DialogTitle>Add a firm</DialogTitle>
          <DialogDescription>
            Keep your accounts together. Choose a firm, then add its accounts
            inside the group.
          </DialogDescription>
        </div>
        <label className="prop-firm-search">
          <Search size={16} />
          <input
            aria-label="Search firms"
            placeholder="Search firms"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <div className="prop-firm-tiles">
          {firmTiles
            .filter((f) => f.name.toLowerCase().includes(query.toLowerCase()))
            .map((f) => {
              const exists = f.id !== "Custom" && added(f.name);
              return (
                <button
                  type="button"
                  key={f.id}
                  disabled={busy || exists}
                  aria-pressed={
                    selected === (f.id === "Custom" ? "Custom" : f.name)
                  }
                  className={
                    selected === (f.id === "Custom" ? "Custom" : f.name)
                      ? "selected"
                      : ""
                  }
                  onClick={() =>
                    setSelected(f.id === "Custom" ? "Custom" : f.name)
                  }
                >
                  <span className="prop-firm-monogram">{f.initials}</span>
                  <span>
                    {f.name}
                    {exists && <small>Already added</small>}
                  </span>
                  {exists && <Check size={15} />}
                </button>
              );
            })}
        </div>
        {selected === "Custom" && (
          <label className="prop-custom-firm-label">
            Firm name
            <input
              aria-label="Firm name"
              value={custom}
              maxLength={100}
              onChange={(e) => setCustom(e.target.value)}
            />
          </label>
        )}
        {name && added(name) && (
          <p className="small muted">
            This firm already has a group. Add an account from that group.
          </p>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="prop-add-firm-actions">
          <Button variant="outline" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={busy || !name || added(name)}
            onClick={() => void save()}
          >
            {busy ? (
              <LoaderCircle size={16} className="pending-spinner" />
            ) : (
              <Plus size={16} />
            )}
            Add Firm
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
