import { book, type Template } from "@/lib/book/templates";
import { displayCell, type WorksheetFields, type Cell } from "@/lib/book/model";

export function PrintDocument({ template, fields, companionUrl, revision, recordedAt }: { template: Template; fields?: WorksheetFields; companionUrl: string; revision?: number; recordedAt?: string }) {
  return <article className="worksheet-print">
    <header><p>{book.title} · {book.author}</p><h1>Appendix {template.letter} — {template.title}</h1><p>Template v{template.version} · Related chapters {template.chapters}{revision ? ` · Entry revision ${revision}` : " · Blank copy"}</p>{fields?.title && <h2>{fields.title}</h2>}{recordedAt && <p>Recorded version: {recordedAt}</p>}{fields?.retrospective && <p><strong>Retrospective addition/correction:</strong> {fields.retrospectiveNote || "Marked retrospective by the author of this entry."}</p>}</header>
    <p className="print-qualification">Educational planning aid. Completion does not establish an edge, certify readiness, verify compliance or guarantee protection from losses. Keep original records and label later reconstructions.</p>
    {fields && template.blocks.some(b=>b.kind==="datetime-local") && <p>Timezone for local event timestamps: {fields.recordTimezone || "Not recorded"}. Save/history timestamps are separate.</p>}
    {template.blocks.map((b) => {
      if (b.kind === "heading") return <h2 key={b.id}>{b.text}</h2>;
      if (b.kind === "instruction") return <p className="print-instruction" key={b.id}>{b.text}</p>;
      const answer = fields?.answers[b.id];
      if (b.kind === "table") {
        const rows = answer && "rows" in answer ? answer.rows : b.rows ? b.rows.map((r) => ({ id: r.id, cells: {} as Record<string,Cell> })) : Array.from({ length: b.blankRows }, (_,i) => ({ id: String(i), cells: {} as Record<string,Cell> }));
        return <section className="print-table" key={b.id}><h3>{b.label}</h3>{rows.length ? rows.map((row, i) => <div className="print-record" key={row.id}>{b.rows && <h4>{b.rows[i]?.label}</h4>}{b.columns.map((c, n) => b.rows && n === 0 && !b.rows[i].firstEditable ? null : <div className="print-answer" key={c.id}><strong>{c.label}</strong><p className={!fields ? "handwriting" : ""}>{fields ? displayCell(row.cells[c.id]) : " "}</p></div>)}</div>) : <p>No rows recorded.</p>}</section>;
      }
      const selected=answer && "state" in answer && answer.state === "value" ? answer.value.split("\n") : [];
      return <section className="print-answer" key={b.id}><h3>{b.label}</h3>{b.choices && <p>{b.choices.map((c) => `[${selected.includes(c) ? "x":" "}] ${c}`).join("   ")}</p>}<p dir="auto" className={!fields ? "handwriting" : ""}>{fields ? displayCell(answer && "state" in answer ? answer : undefined) : " "}</p></section>;
    })}
    {fields?.link && <p>Optional reference: {fields.link.kind} · {fields.link.id}. Worksheet answers do not modify that record.</p>}
    <footer>MSJournal · {companionUrl} · Appendix {template.letter} · Template v{template.version}</footer>
  </article>;
}
