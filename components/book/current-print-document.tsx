import { book, type Block, type Template } from "@/lib/book/templates";
import { answerCell, displayCell, type WorksheetFields } from "@/lib/book/model";
import { printDate, printRows, printSections } from "@/lib/book/print-layout";

export function CurrentPrintDocument({template,fields,companionUrl,revision,recordedAt}:{template:Template;fields?:WorksheetFields;companionUrl:string;revision?:number;recordedAt?:string}){
  function field(block:Block){
    if(block.kind === "instruction")return <p key={block.id} className={`cp-instruction ${block.id.startsWith("step-") ? "cp-reset-step" : ""}`}>{block.text}</p>;
    if(block.kind === "heading" || block.kind === "table")return null;
    const cell=answerCell(fields?.answers[block.id]);
    const selected=cell?.state === "value" ? cell.value.split("\n"):[];
    const singleCheck=block.kind === "multichoice" && block.choices?.length === 1 && block.choices[0] === block.label;
    const answer=cell?.state === "value" && block.kind === "date" ? printDate(cell.value):displayCell(cell);
    return <div key={block.id} className={`cp-field cp-field-${block.kind}`}>
      {!singleCheck && <h3>{block.label}</h3>}
      {block.choices ? <><div className="cp-choices">{block.choices.map(choice=><span key={choice}><span className={`cp-checkbox ${selected.includes(choice) ? "cp-checked":""}`}>{selected.includes(choice) ? "✓":""}</span>{choice}</span>)}</div>{cell && ["unknown","not-applicable"].includes(cell.state) && <p className="cp-answer">{displayCell(cell)}</p>}</> : fields ? <p className="cp-answer" dir="auto">{answer}</p> : <div className={`cp-writing ${block.kind === "textarea" && template.id !== "reset-2" ? "cp-writing-long":""}`} aria-hidden="true" />}
      {!fields && block.hint && !block.hint.startsWith("Include your unit") && <small>{block.hint}</small>}
    </div>;
  }
  return <article className={`worksheet-print companion-print ${fields ? "cp-completed":"cp-blank"} cp-${template.id}`}>
    <header className="cp-header">
      <div className="cp-brand-row"><strong>MSJournal</strong><span>{book.title}</span></div>
      <p className="cp-kicker">APPENDIX {template.letter} <span>•</span> {fields ? "PERSONAL WORKSHEET":"WRITING WORKSHEET"}</p>
      <h1>{template.title}</h1>
      <p className={`cp-introduction ${template.id === "reset-2" ? "cp-reset-quote":""}`}>{template.purpose}</p>
      {fields && <div className="cp-entry"><strong>{fields.title || template.shortTitle || template.title}</strong>{(revision || recordedAt) && <small>{revision ? `Revision ${revision}`:""}{revision && recordedAt ? " · ":""}{recordedAt ? `Saved ${printDate(recordedAt,true)}`:""}</small>}</div>}
    </header>
    {fields?.retrospective && <p className="cp-note"><strong>Retrospective addition / correction:</strong> {fields.retrospectiveNote || "Marked retrospective by the author of this entry."}</p>}
    {printSections(template).map(section=><section key={section.id} className={`cp-section cp-section-${section.id}`}>
      {section.title && <h2>{section.title}</h2>}
      {!fields && section.blocks.some(b=>"hint" in b && b.hint?.startsWith("Include your unit")) && <p className="cp-unit-note">Include your unit with risk limits, for example USD, points, or %.</p>}
      {printRows(section.blocks).map(row=><div key={row[0].id} className={`cp-row ${row.length>1 ? `cp-columns cp-columns-${row.length}`:""}`}>{row.map(field)}</div>)}
    </section>)}
    {fields?.link && <p className="cp-reference">Reference: {fields.link.kind} · {fields.link.id}</p>}
    <footer className="cp-footer"><span>{book.author} · {book.title}</span><span>Appendix {template.letter} · Template v{template.version}</span><small>{companionUrl}</small></footer>
  </article>;
}
