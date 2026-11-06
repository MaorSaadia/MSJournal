import { z } from "zod";
import type { Template, Input } from "./templates";
export const cellSchema = z.object({ state: z.enum(["blank", "value", "unknown", "not-applicable"]), value: z.string().max(5000), note:z.string().max(1000).optional() }).strict();
export type Cell = z.infer<typeof cellSchema>;
export const blankCell = (): Cell => ({ state: "blank", value: "" });
export const rowSchema = z.object({ id: z.string().min(1).max(80), cells: z.record(z.string(), cellSchema) }).strict();
export const answerSchema = z.union([cellSchema, z.object({ rows: z.array(rowSchema).max(150) }).strict()]);
export type Answer = z.infer<typeof answerSchema>;
export const answerCell = (answer?: Answer) => answer && "state" in answer ? answer : undefined;
export const recordTime = (value:string) => new Date(value).toISOString().replace("T"," ").replace(/\.\d{3}Z$/," UTC");
export const fieldsSchema = z.object({
  title: z.string().trim().max(160),
  answers: z.record(z.string().max(100), answerSchema),
  link: z.object({ kind: z.enum(["strategy", "session", "trade", "account", "progress"]), id: z.uuid() }).strict().nullable(),
  retrospective: z.boolean(), retrospectiveNote: z.string().max(1000),
  recordTimezone: z.string().max(80).optional(),
}).strict();
export type WorksheetFields = z.infer<typeof fieldsSchema>;
export const saveSchema = z.object({ revision: z.number().int().nonnegative(), status: z.enum(["draft", "reviewed"]), fields: fieldsSchema }).strict();
export const createSchema = saveSchema.omit({ revision: true }).extend({ templateId: z.string().max(12), clientId: z.uuid() }).strict();
export type WorksheetData = { id: string; ownerId: string; templateId: string; template: Template; fields: WorksheetFields; status: "draft" | "reviewed"; revision: number; createdAt: string; updatedAt: string; completedAt: string | null; clientId?:string };
export function emptyFields(template: Template): WorksheetFields {
  const answers: WorksheetFields["answers"] = {};
  for (const b of template.blocks) {
    if (b.kind === "heading" || b.kind === "instruction") continue;
    answers[b.id] = b.kind === "table" ? { rows: (b.rows ?? []).map((r) => ({ id: r.id, cells: Object.fromEntries(b.columns.map((c) => [c.id, blankCell()])) })) } : blankCell();
  }
  return { title: "", answers, link: null, retrospective: false, retrospectiveNote: "" };
}
function validateCell(c: Cell, definition: Input) {
  if (c.state !== "value") {
    if (c.value !== "") throw new Error("Clear the value before selecting blank, unknown or not applicable.");
    return;
  }
  if(c.value === "")return; // An explicitly opened but unfinished input is still a partial draft.
  if (definition.kind === "choice" && !definition.choices?.includes(c.value)) throw new Error("Select a listed choice.");
  if (definition.kind === "multichoice" && c.value.split("\n").some((v) => !definition.choices?.includes(v))) throw new Error("Select listed choices.");
  if (definition.kind === "number" && !/^-?\d{1,16}(\.\d{1,8})?$/.test(c.value)) throw new Error("Enter a decimal number, or mark its state explicitly.");
  if (definition.kind === "date" && (!/^\d{4}-\d{2}-\d{2}$/.test(c.value) || !Number.isFinite(Date.parse(c.value)) || new Date(c.value).toISOString().slice(0,10)!==c.value)) throw new Error("Enter a valid date.");
  if(definition.kind === "datetime-local" && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(c.value))throw new Error("Enter a local date and time; record its timezone separately.");
  if(definition.label.toLowerCase()==="time zone"){try{new Intl.DateTimeFormat("en",{timeZone:c.value}).format();}catch{throw new Error("Enter an IANA timezone such as Asia/Jerusalem, or mark it unknown.");}}
}
export function validateFields(template: Template, fields: WorksheetFields) {
  if(fields.recordTimezone){try{new Intl.DateTimeFormat("en",{timeZone:fields.recordTimezone}).format();}catch{throw new Error("Enter a valid IANA timezone for event timestamps, or leave it blank.");}}
  const expected = emptyFields(template).answers;
  if (Object.keys(fields.answers).some((id) => !Object.hasOwn(expected,id))) throw new Error("This field is not in the saved template version.");
  for (const b of template.blocks) {
    if (b.kind === "heading" || b.kind === "instruction") continue;
    const answer = fields.answers[b.id];
    if (!answer) continue;
    if (b.kind !== "table") {
      if (!("state" in answer)) throw new Error("Invalid field answer.");
      validateCell(answer, b); continue;
    }
    if (!("rows" in answer)) throw new Error("Invalid table answer.");
    if (new Set(answer.rows.map((r) => r.id)).size !== answer.rows.length) throw new Error("Rows must be unique.");
    if (b.rows && (answer.rows.length !== b.rows.length || answer.rows.some((r, i) => r.id !== b.rows![i].id))) throw new Error("Keep the template's fixed rows.");
    for (const row of answer.rows) {
      if (Object.keys(row.cells).some((id) => !b.columns.some((c) => c.id === id))) throw new Error("Invalid table column.");
      for (const c of b.columns) if (row.cells[c.id]) validateCell(row.cells[c.id], c);
    }
  }
  if (fields.link && fields.link.kind !== template.linkKind) throw new Error("This worksheet does not support that link.");
  return fields;
}
export function displayCell(cell?: Cell) {
  const text=!cell || cell.state === "blank" ? "—" : cell.state === "unknown" ? "Unknown" : cell.state === "not-applicable" ? "Not applicable" : cell.value;
  return cell?.note ? `${text}\nReason / detail: ${cell.note}`:text;
}
