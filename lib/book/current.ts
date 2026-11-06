import type { Block, Input, Template } from "./templates";
import source from "./current-source.json";

// A separate edition: these IDs never reuse the previous A–L answer meanings.
const text = (id: string, label: string, extra: Partial<Input> = {}): Input => ({ id, label, kind: "textarea", ...extra });
const short = (id: string, label: string, extra: Partial<Input> = {}) => text(id, label, { kind: "text", ...extra });
const date = (id: string, label: string) => short(id, label, { kind: "date", group: "dates" });
const count = (id: string, label: string) => short(id, label, { kind: "number", count: true });
const heading = (id: string, value: string): Block => ({ id, kind: "heading", text: value });
const instruction = (id: string, value: string): Block => ({ id, kind: "instruction", text: value });
const original = (id: string) => source.find(p => p.sourceId === id)!.text;
const check = (id: string, label: string): Input => ({ id, kind: "multichoice", label, choices: [label] });
const choice = (id: string, label: string, choices: string[]): Input => ({ id, kind: "choice", label, choices });
const risk = (id: string, label: string) => short(id, label, { hint: "Include your unit, for example USD, points, or %." });
const make = (id: string, letter: string, slug: string, title: string, shortTitle: string, purpose: string, blocks: Block[], linkKind?: Template["linkKind"]): Template => ({ id, letter, slug, title, shortTitle, version: 2, edition: "simplified-2026", purpose, when: purpose, category: "Book Companion", chapters: "", blocks: [instruction(`${id}-intro`, purpose), ...blocks], ...(linkKind ? { linkKind } : {}) });

export const currentTemplates: Template[] = [
  make("plan-2", "A", "my-personal-trading-plan", "My Personal Trading Operating Plan", "My Plan", original("1865"), [
    short("environment", "Account or practice environment"), date("date", "Date"), date("next-review", "Next review"),
    heading("setup", "1. The setup I trade"),
    text("setup-description", "My setup, market, and trading hours"), text("entry", "I can enter when I see"), text("cancel", "I cancel an unfilled entry when"), text("near-miss", "A near miss looks like my setup, but it’s missing"),
    heading("risk", "2. My risk limits"), risk("trade-risk", "Maximum risk per trade"), risk("session-limit", "Session loss limit"), risk("open-risk", "Maximum total risk across open positions"),
    instruction("skip", "If the smallest position exceeds my remaining limit, I skip the trade."),
    heading("pressure", "3. My response under pressure"), text("trigger", "My recurring trigger", {group:"response"}), text("response", "When I notice it, I will", {group:"response"}),
    heading("return", "4. When I reduce risk, stop, or return"), text("drawdown-reference", "I measure drawdown from"), risk("reduce-at", "At this drawdown"), short("reduced-size", "I reduce my position size to"),
    text("stop", "I stop taking new trades when"), text("unfilled", "When I stop, I handle unfilled entry orders by"), text("open-positions", "For positions already open, I follow this rule"), text("resume", "Before I resume trading, I need to verify"), instruction("review-note", original("1875")),
  ], "account"),
  make("session-2", "B", "my-trading-session-sheet", "My Trading Session Sheet", "Session Sheet", original("1879"), [
    date("date", "Date"), short("market", "Market"), short("account", "Account"),
    heading("prepare", "Before the session"), text("setup", "The setup I’m waiting for"), risk("trade-risk", "Risk per trade"), risk("daily-limit", "My loss limit today"), text("stop", "I’ll stop taking new trades when"),
    check("limits-checked", "I’ve checked my account limits, open positions, working orders, and today’s restrictions."),
    choice("decision", "Given my time and attention, I’ll", ["Trade my plan", "Observe only", "Sit out"]),
    heading("click", "Before I click"), check("valid", "My setup is valid at this price."), risk("remaining-risk", "Risk I can still take after accounting for open positions and pending orders"),
    instruction("estimate-intro", "Estimated loss at my stop, including costs and slippage: per unit × units = total."),
    short("risk-unit", "Unit or currency for this estimate", {hint:"For example USD or points. The estimate keeps the unit you enter."}),
    short("per-unit", "Estimated risk per unit", {kind:"number",group:"risk-product"}), short("units", "Units", {kind:"number",group:"risk-product"}), short("total", "Estimated total", {kind:"number",readOnly:true,group:"risk-product"}),
    check("size-fits", "The size fits my remaining risk budget. If no size fits, I skip the trade."), text("hold", "I’ll hold while"), text("exit", "I’ll adjust or exit if"), instruction("reset-link", original("1885")),
    heading("close", "Before I step away"), check("monitoring", "I’ve checked which positions and orders are still open and what needs monitoring."), text("decision-made", "One decision I made, including staying out"), text("reason", "I chose it because"), choice("followed", "Did I follow my plan?", ["Yes", "No", "Unclear"]), text("next-trigger", "Next time, when", {group:"response"}), text("next-response", "I will", {group:"response"}),
  ], "session"),
  make("reset-2", "C", "after-a-missed-trade-or-loss", "After a Missed Trade or a Loss", "Reset Card", original("1891"), [
    heading("prepare-reset", "Prepare my reset"), instruction("prepare-note", original("1892")),
    text("first-sign", "The first sign I’m starting to chase"), text("pause", "When I notice it, I’ll pause by"), text("done", "I’m done trading for the day when"),
    heading("use-reset", "Use my reset"), instruction("use-note", original("1894")),
    ...["1895","1896","1897","1898"].map((id,i)=>instruction(`step-${i+1}`, original(id))),
    heading("later", "Later, one line"), text("urge", "I felt the urge to"), text("actual-response", "What I actually did was"), instruction("wait-note", original("1900")),
  ]),
  make("pattern-2", "D", "review-one-pattern-practice-one-change", "Review One Pattern, Practice One Change", "Pattern Review", original("1904"), [
    heading("pattern", original("1905")), short("period", "Review period"), text("situation", "The situation I reviewed"), text("action", "I did"), count("observed", "In this many opportunities"), count("opportunities", "Out of these relevant opportunities"), text("counter-example", "One example that doesn’t fit my explanation"),
    heading("practice", original("1907")), text("trigger", "When this happens", {group:"response"}), text("practice-action", "I’ll practice", {group:"response"}), text("evidence", "I’ll know I followed my rule if I can point to this action"), text("unchanged", "While I practice, I’ll keep this part of my plan unchanged"), count("review-count", "I’ll review after this many opportunities"), date("review-date", "Or on this date"),
    heading("responses", original("1909")), count("trigger-count", "Times the trigger occurred"), count("followed", "I followed my rule"), count("broke", "I broke my rule"), count("unsure", "I’m unsure"), text("repeat", "One response worth repeating"), instruction("no-opportunity", original("1911")),
    heading("next", original("1912")), choice("next-action", "My next action", ["Keep my current plan", "Practice longer", "Revise one rule"]), text("reason", "My reason"), instruction("revisions", original("1914")),
  ], "progress"),
];
