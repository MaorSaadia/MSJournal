import source from "./manuscript.json";

export const book = {
  title: "The Consistent Day Trader",
  subtitle: "A Practical Guide to Trading Psychology, Risk Management, and Prop Firm Challenges",
  author: "Maor Saadia",
  introduction: source.introduction,
};
export const categories = ["Build your plan", "Prepare and record", "Manage difficult moments", "Review your progress", "Manage accounts and commitments"] as const;
export type InputKind = "text" | "textarea" | "number" | "date" | "datetime-local" | "choice" | "multichoice";
export type Input = { id: string; label: string; kind: InputKind; choices?: string[] };
export type Table = { id: string; label: string; kind: "table"; columns: Input[]; rows?: { id: string; label: string; firstEditable: boolean }[]; blankRows: number };
export type Block = { kind: "heading"; id: string; text: string } | { kind: "instruction"; id: string; text: string } | Input | Table;
export type Template = { id: string; letter: string; slug: string; title: string; version: number; category: string; purpose: string; when: string; chapters: string; linkKind?: "strategy" | "session" | "trade" | "account" | "progress"; blocks: Block[] };
const slugs = ["personal-trading-operating-plan", "account-and-prop-firm-fact-sheet", "model-definition-card", "session-preparation-and-closure", "risk-budget-and-position-sizing-record", "trade-plan-and-decision-record", "missed-trade-and-revenge-trade-reset-card", "drawdown-pause-and-return-plan", "review-and-practice-worksheet", "challenge-progress-and-payout-review", "trading-project-cash-and-time-ledger", "behavioral-progress-record"];
const grouping = [0,4,0,1,1,1,2,2,3,4,4,3];
const links: Record<string, Template["linkKind"]> = { B: "account", C: "strategy", D: "session", F: "trade", J: "account", L: "progress" };
const headings = new Set(["Define stopping precisely.", "Evaluation specification", "Before the session", "After the session", "Current constraints", "Candidate sizing", "Before entry", "During the trade", "After exit", "At the cue", "If activated", "The proposed work", "Decision", "Qualification status", "Before requesting a payout", "Request and receipt record", "External project cash", "Personal brokerage account reconciliation, if applicable", "Time and sustainability"]);
function input(id: string, label: string): Input {
  const clean = label.trim().replace(/[:=]\s*$/, "").trim();
  const kind = /^(Effective date|Next review|Terms checked on|Review date)$/i.test(clean) ? "date" : clean === "Timestamp" ? "datetime-local" : /hours|^Cash received$|^Expense paid$/.test(clean) ? "number" : "textarea";
  return { id, label: clean, kind };
}
// Source node IDs and field offsets are stable within this immutable edition.
// Never regenerate this source from a different manuscript without a version review.
export const templates: Template[] = source.directory.map(([letter, title, when, chapters], index) => {
  const start = source.blocks.findIndex((b) => "text" in b && b.text?.startsWith(`Appendix ${letter} —`));
  let end = source.blocks.findIndex((b, i) => i > start && "text" in b && b.text?.startsWith("Appendix "));
  if (end < 0) end = source.blocks.length;
  const originals = source.blocks.slice(start + 1, end);
  const blocks: Block[] = [];
  for (const original of originals) {
    const id = `${letter.toLowerCase()}-${original.sourceId}`;
    if ("rows" in original && original.rows) {
      const [header, ...body] = original.rows;
      const fixed = body.some((r) => !/^[_\s]+$/.test(r[0]));
      const columns = header.map((h, i) => input(`c${i}`, h));
      if (letter === "L") {
        columns[1] = { ...columns[1], kind: "choice", choices: ["Yes", "No", "Unknown"] };
        columns[2] = { ...columns[2], kind: "choice", choices: ["Followed", "Breached", "Unclear", "Not applicable"] };
      }
      if (letter === "F") columns[4] = { ...columns[4], kind: "choice", choices: ["Recorded then", "Retrospective"] };
      blocks.push({ id, kind: "table", label: header.join(" / "), columns, blankRows: body.length, ...(fixed ? { rows: body.map((r, i) => ({ id: `r${i}`, label: r[0].replace(/_+/g, "").trim(), firstEditable: r[0].includes("___") })) } : {}) });
      continue;
    }
    const text = original.text ?? "";
    if(original.sourceId === "1955"){blocks.push({id,kind:"instruction",text});continue;}
    if (text.includes("☐")) {
      const [prefix, ...choices] = text.split("☐");
      // Preserve a trailing free-text qualification, e.g. “Unclear — specify rule”.
      const parsed = choices.map((c) => c.replace(/_+/g, "").trim());
      const single = /Current stage|Environment|Decision|Preparation decision|State:|Adherence|trigger applies to|Return decision/i.test(prefix);
      blocks.push({ id, label: prefix.trim() || (letter === "I" ? "Review decision" : "Confirmation"), kind: choices.length > 1 && !single ? "multichoice" : "choice", choices: parsed });
      if (text.includes("___")) blocks.push(input(`${id}-detail`, text.replace(/☐/g, "").replace(/_+/g, "") + " — detail"));
    } else if (text.includes("___")) {
      text.split(/_{3,}/).slice(0, -1).forEach((label, i) => {
        if (label.trim()) blocks.push(input(`${id}-${i}`, label));
      });
    } else if (text.endsWith(":")) blocks.push(input(id, text));
    else blocks.push({ id, kind: headings.has(text) ? "heading" : "instruction", text });
  }
  return { id: `${letter}-1`, letter, slug: slugs[index], title, version: 1, category: categories[grouping[index]], when, chapters, purpose: "text" in originals[0] ? originals[0].text ?? when : when, linkKind: links[letter], blocks };
});
export function templateFor(slug: string) { return templates.find((t) => t.slug === slug); }
export const isInput = (b: Block): b is Input => !["heading", "instruction", "table"].includes(b.kind);
