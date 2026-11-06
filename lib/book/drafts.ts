import { fieldsSchema, type WorksheetFields } from "./model";
export const guestKey = (slug: string) => `msjournal.book.guest.v1.${slug}`;
export const recoveryKey = (owner: string, id: string) => `msjournal.book.recovery.v1.${owner}.${id}`;
export type BrowserDraft = { fields: WorksheetFields; templateId: string; offeredTo: string | null; createdAt: string; revision: number; status: "draft" | "reviewed"; clientId?:string; transfer?:boolean };
export function parseDraft(raw: string, templateId: string): BrowserDraft | null {
  try {
    const d = JSON.parse(raw);
    if (d.templateId !== templateId || !Number.isInteger(d.revision) || d.revision<0 || !["draft","reviewed"].includes(d.status) || !(d.offeredTo === null || typeof d.offeredTo === "string") || typeof d.createdAt!=="string" || !Number.isFinite(Date.parse(d.createdAt)) || (d.clientId!==undefined && !/^[0-9a-f-]{36}$/.test(d.clientId))) return null;
    return { ...d, fields: fieldsSchema.parse(d.fields) };
  } catch { return null; }
}
export function draftForUser(d: BrowserDraft | null, owner: string | null) { return d && (!d.offeredTo || d.offeredTo === owner) ? d : null; }
export function readDraft(key: string) { try { return sessionStorage.getItem(key) ?? ""; } catch { return ""; } }
export function writeDraft(key: string, value: BrowserDraft | null) {
  try { if (value) sessionStorage.setItem(key,JSON.stringify(value)); else sessionStorage.removeItem(key); window.dispatchEvent(new Event("msjournal:book-draft")); return true; } catch { return false; }
}
export function subscribeDraft(fn: () => void) { window.addEventListener("msjournal:book-draft",fn); window.addEventListener("storage",fn); return () => { window.removeEventListener("msjournal:book-draft",fn); window.removeEventListener("storage",fn); }; }
