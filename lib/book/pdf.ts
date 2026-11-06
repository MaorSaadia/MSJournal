import { PDFDocument, StandardFonts, rgb, type PDFPage } from "pdf-lib";
import { book, type Template, type Table } from "./templates";
import { absoluteUrl } from "@/lib/seo";

// Blank public content only. Completed entries use authenticated HTML/browser print.
// Standard PDF fonts support the English appendix text; mathematical arrows are
// transliterated, never dropped. No user responses are accepted by this renderer.
const printable = (s: string) => s.replace(/→/g," -> ").replace(/☐/g,"[ ]").replace(/−/g,"-").replace(/\u00a0/g," ");
export async function blankPdf(templates: Template[], paper: "a4" | "letter" = "a4") {
  const pdf = await PDFDocument.create();
  const normal = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const [width,height] = paper === "letter" ? [612,792] : [595.28,841.89];
  const margin = 44, lineHeight = 13, size = 10;
  let page: PDFPage, y = 0, current: Template;
  const newPage = () => {
    page = pdf.addPage([width,height]); y = height - margin;
    page.drawText(`${book.title} | Appendix ${current.letter} | Template v${current.version}`, { x: margin, y, size: 8, font: normal, color: rgb(.3,.3,.3) }); y -= 25;
    page.drawText(`MSJournal | ${absoluteUrl("/book")} | ${pdf.getPageCount()}`, { x: margin, y: 24, size: 8, font: normal, color: rgb(.3,.3,.3) });
  };
  const need = (h: number) => { if (y - h < 48) newPage(); };
  const lines = (text: string, font = normal, fontSize = size) => {
    const words = printable(text).split(/\s+/), out: string[] = []; let line = "";
    for (let word of words) {
      // Handles long reference-like labels without clipping.
      while (font.widthOfTextAtSize(word,fontSize) > width - margin*2) {
        let split = word.length - 1; while (font.widthOfTextAtSize(word.slice(0,split),fontSize) > width-margin*2) split--;
        if (line) { out.push(line); line=""; } out.push(word.slice(0,split)); word=word.slice(split);
      }
      if (line && font.widthOfTextAtSize(`${line} ${word}`,fontSize) > width-margin*2) { out.push(line); line=word; } else line = line ? `${line} ${word}` : word;
    }
    if (line) out.push(line); return out;
  };
  const text = (value: string, heading = false, reserve = 0) => {
    const wrapped = lines(value,heading ? bold : normal,heading ? 11 : size);
    need(Math.min(wrapped.length * lineHeight + reserve + 7, height-120));
    for (const l of wrapped) { need(lineHeight); page.drawText(l,{x:margin,y,size:heading ? 11 : size,font:heading ? bold : normal,color:rgb(.08,.1,.12)}); y-=lineHeight; }
    y-=6;
  };
  const space = (count = 2) => { for(let i=0;i<count;i++){need(16);page.drawLine({start:{x:margin,y:y-10},end:{x:width-margin,y:y-10},thickness:.35,color:rgb(.65,.65,.65)});y-=16;} y-=4; };
  const textHeight=(s:string,heading=false)=>lines(s,heading ? bold:normal,heading ? 11:size).length*lineHeight+6;
  const rowHeight=(b:Table,row:{label:string;firstEditable:boolean})=>textHeight(row.label,true)+b.columns.reduce((total,c,i)=>i===0 && b.rows && !row.firstEditable ? total : total+textHeight(c.label)+(c.choices ? textHeight(c.choices.map(s=>`[ ] ${s}`).join("   ")):0)+20,0);
  const tableStart=(b:Table)=>textHeight(b.label,true)+rowHeight(b,b.rows?.[0] ?? {label:"Record 1",firstEditable:true});
  for (const t of templates) {
    current=t; newPage();
    text(`Appendix ${t.letter} - ${t.title}`,true,20);
    text(`${book.subtitle}. By ${book.author}. Related chapters: ${t.chapters}.`);
    text("Educational planning aid. Completion does not establish an edge, certify readiness, verify compliance or guarantee protection from losses. Keep original records and label later reconstructions.");
    for (const [blockIndex,b] of t.blocks.entries()) {
      if (b.kind === "heading" || b.kind === "instruction") {
        const next=t.blocks[blockIndex+1], after=t.blocks[blockIndex+2];
        const keep=next?.kind === "table" ? tableStart(next) : b.kind === "heading" && next?.kind === "instruction" && after?.kind === "table" ? textHeight(next.text)+tableStart(after) : b.kind === "heading" ? 50:0;
        text(b.text,b.kind === "heading",keep);continue;
      }
      if (b.kind === "table") {
        const rows = b.rows ?? Array.from({length:b.blankRows},(_,i)=>({label:`Record ${i+1}`,firstEditable:true}));
        need(textHeight(b.label,true)+(rows[0] ? rowHeight(b,rows[0]):0));
        text(b.label,true);
        for (const row of rows) {
          need(rowHeight(b,row));text(row.label,true);
          b.columns.forEach((c,i)=>{if(i===0 && b.rows && !row.firstEditable)return;text(c.label);if(c.choices)text(c.choices.map(s=>`[ ] ${s}`).join("   "));space(1);});
        }
      } else {
        const choices=b.choices?.map(s=>`[ ] ${s}`).join("   ");
        const next=t.blocks[blockIndex+1];
        const qualification=blockIndex===t.blocks.length-2 && next?.kind === "instruction" ? textHeight(next.text):0;
        need(textHeight(b.label,true)+(choices ? textHeight(choices):0)+(choices ? 0:b.kind === "textarea" ? 36:20)+qualification);
        text(b.label,true); if(choices)text(choices);else space(b.kind === "textarea" ? 2 : 1);
      }
    }
  }
  pdf.setTitle(templates.length === 1 ? `${book.title} - Appendix ${templates[0].letter}` : `${book.title} - Companion workbook`);
  pdf.setAuthor(book.author); pdf.setCreator("MSJournal");
  return pdf.save();
}
