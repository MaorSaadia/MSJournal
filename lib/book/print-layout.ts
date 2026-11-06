import type { Block, Template } from "./templates";

export type PrintSection = { id: string; title?: string; blocks: Block[] };
export function printSections(template: Template): PrintSection[] {
  const sections: PrintSection[] = [{ id: "identity", blocks: [] }];
  for (const block of template.blocks) {
    if (block.kind === "heading") sections.push({ id: block.id, title: block.text, blocks: [] });
    else if (block.id !== `${template.id}-intro`) sections.at(-1)!.blocks.push(block);
  }
  return sections.filter(section => section.blocks.length);
}

// Presentation groups only: never change the saved template or answer IDs.
const groups = [
  ["environment", "date", "next-review"],
  ["date", "market", "account"],
  ["trade-risk", "session-limit", "open-risk"],
  ["reduce-at", "reduced-size"],
  ["per-unit", "units", "total"],
  ["observed", "opportunities"],
  ["review-count", "review-date"],
  ["trigger-count", "followed", "broke", "unsure"],
  ["next-trigger", "next-response"],
];
export function printRows(blocks: Block[]): Block[][] {
  const result: Block[][] = [];
  for (let i = 0; i < blocks.length; i++) {
    const group = groups.find(ids => ids.every((id, n) => blocks[i + n]?.id === id));
    if (group) { result.push(blocks.slice(i, i + group.length)); i += group.length - 1; }
    else result.push([blocks[i]]);
  }
  return result;
}

export function printDate(value: string, timestamp = false) {
  if (!value || !Number.isFinite(Date.parse(value))) return value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
    ...(timestamp ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(new Date(value)) + (timestamp ? " UTC" : "");
}
