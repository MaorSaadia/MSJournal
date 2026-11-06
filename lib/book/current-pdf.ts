import { PDFDocument, StandardFonts, rgb, type PDFPage } from "pdf-lib";
import { book, type Block, type Input, type Template } from "./templates";
import { printRows, printSections } from "./print-layout";
import { absoluteUrl } from "@/lib/seo";

// Public blank worksheets only. Private answers never enter this renderer.
export async function currentBlankPdf(templates:Template[],paper:"a4"|"letter"){
  const pdf=await PDFDocument.create();
  const regular=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold);
  const [width,height]=paper === "letter" ? [612,792]:[595.28,841.89];
  const margin=44,contentWidth=width-margin*2,bottom=58;
  const ink=rgb(.12,.17,.19),muted=rgb(.38,.43,.46),emerald=rgb(.02,.40,.32),line=rgb(.81,.85,.85),wash=rgb(.95,.97,.96);
  let page:PDFPage,y=0,current:Template,sectionTitle="",pageStart=0;
  const clean=(text:string)=>text.replace(/☐/g,"[ ]").replace(/→/g," -> ").replace(/−/g,"-").replace(/\u00a0/g," ");
  function wrap(text:string,maxWidth:number,size:number,font=regular){
    const output:string[]=[];let row="";
    for(let word of clean(text).split(/\s+/)){
      while(font.widthOfTextAtSize(word,size)>maxWidth){let n=word.length-1;while(n>1 && font.widthOfTextAtSize(word.slice(0,n),size)>maxWidth)n--;if(row){output.push(row);row="";}output.push(word.slice(0,n));word=word.slice(n);}
      if(row && font.widthOfTextAtSize(`${row} ${word}`,size)>maxWidth){output.push(row);row=word;}else row=row ? `${row} ${word}`:word;
    }
    if(row)output.push(row);return output;
  }
  function draw(text:string,x:number,top:number,maxWidth:number,size=10,font=regular,color=ink,leading=size*1.4){
    const lines=wrap(text,maxWidth,size,font);
    for(const [i,value] of lines.entries())page.drawText(value,{x,y:top-i*leading,font,size,color});
    return lines.length*leading;
  }
  const sectionHeight=(title:string)=>Math.max(current.id === "reset-2" ? 30:34,wrap(title,contentWidth-25,11,bold).length*15+(current.id === "reset-2" ? 14:18));
  function sectionHeading(title:string,continued=false){
    const label=continued ? `${title} — continued`:title,h=sectionHeight(label);
    page.drawRectangle({x:margin,y:y-h+7,width:contentWidth,height:h,color:wash});
    page.drawRectangle({x:margin,y:y-h+7,width:3,height:h,color:emerald});
    draw(label,margin+13,y-7,contentWidth-25,11,bold,emerald,15);y-=h+(current.id === "reset-2" ? 8:10);
  }
  function newPage(first=false){
    page=pdf.addPage([width,height]);y=height-margin;
    draw("MSJournal",margin,y,150,11,bold,emerald);
    const running=first ? book.title:`${current.shortTitle || current.title} · Appendix ${current.letter}`;
    const runningWidth=regular.widthOfTextAtSize(clean(running),8);
    draw(running,width-margin-runningWidth,y,contentWidth,8,regular,muted);
    y-=17;page.drawLine({start:{x:margin,y},end:{x:width-margin,y},color:line,thickness:.6});y-=current.id === "reset-2" ? 21:25;
    if(first){
      draw(`APPENDIX ${current.letter}  /  WRITING WORKSHEET`,margin,y,contentWidth,8,bold,emerald);y-=current.id === "reset-2" ? 21:25;
      y-=draw(current.title,margin,y,contentWidth,21,bold,ink,25);y-=7;
      y-=draw(current.purpose,margin,y,contentWidth,current.id === "reset-2" ? 13:10,regular,current.id === "reset-2" ? emerald:muted);y-=current.id === "reset-2" ? 12:19;
    }else if(sectionTitle)sectionHeading(sectionTitle,true);
  }
  function ensure(h:number){if(y-h<bottom)newPage();}
  const compactAnswer=(field:Input)=>current.id === "session-2" && ["hold","exit","next-trigger","next-response"].includes(field.id);
  const writingLines=(field:Input)=>field.kind === "textarea" && current.id !== "reset-2" && !compactAnswer(field) ? 2:1;
  function fieldHeight(field:Input,w:number){
    const labelHeight=wrap(field.label,w,9,bold).length*12;
    if(field.choices){
      const single=field.kind === "multichoice" && field.choices.length === 1 && field.choices[0] === field.label;
      const inline=field.choices.reduce((sum,c)=>sum+regular.widthOfTextAtSize(clean(c),9)+26,0)<=w;
      return (single ? 0:labelHeight+5)+(inline ? 18:field.choices.reduce((sum,c)=>sum+wrap(c,w-17,9).length*13+5,0))+8;
    }
    const hint=field.hint && !field.hint.startsWith("Include your unit") ? wrap(field.hint,w,8).length*11+3:0;
    return labelHeight+hint+(writingLines(field) === 2 ? 40:current.id === "reset-2" ? 19:compactAnswer(field) ? 23:29)+8;
  }
  function field(field:Input,x:number,top:number,w:number,labelHeight?:number){
    let cursor=top;
    const single=field.kind === "multichoice" && field.choices?.length === 1 && field.choices[0] === field.label;
    if(!single){const used=draw(field.label,x,cursor,w,9,bold,muted,12);cursor-=(labelHeight ?? used)+5;}
    if(field.choices){
      const inline=field.choices.reduce((sum,c)=>sum+regular.widthOfTextAtSize(clean(c),9)+26,0)<=w;
      let choiceX=x;
      for(const choice of field.choices){page.drawRectangle({x:choiceX,y:cursor-8,width:8,height:8,borderWidth:.7,borderColor:line});const h=draw(choice,choiceX+16,cursor,w-16,9,regular,ink,13);if(inline)choiceX+=regular.widthOfTextAtSize(clean(choice),9)+26;else cursor-=h+5;}return;
    }
    if(field.hint && !field.hint.startsWith("Include your unit"))cursor-=draw(field.hint,x,cursor,w,8,regular,muted,11)+3;
    const count=writingLines(field);
    for(let n=0;n<count;n++){cursor-=17;page.drawLine({start:{x,y:cursor},end:{x:x+w,y:cursor},color:line,thickness:.45});}
  }
  function rowHeight(row:Block[]){
    const w=(contentWidth-(row.length-1)*18)/row.length;
    return Math.max(...row.map(b=>b.kind === "instruction" ? wrap(b.text,contentWidth-20,9.5).length*13.5+(current.id === "reset-2" ? 8:12) : b.kind === "heading" || b.kind === "table" ? 0:fieldHeight(b,w)));
  }
  function row(row:Block[]){
    const h=rowHeight(row);ensure(h);
    const w=(contentWidth-(row.length-1)*18)/row.length;
    const labelHeight=row.length>1 ? Math.max(...row.map(b=>"label" in b ? wrap(b.label,w,9,bold).length*12:0)):undefined;
    for(const [i,b] of row.entries()){
      if(b.kind === "instruction"){
        // A short inset note, visually separate from handwriting areas.
        const chunks=wrap(b.text,contentWidth-20,9.5);
        for(const text of chunks){ensure(14);draw(text,margin+10,y,contentWidth-20,9.5,regular,muted,13.5);y-=13.5;}
        y-=current.id === "reset-2" ? 8:12;return;
      }
      if(b.kind !== "heading" && b.kind !== "table")field(b,margin+i*(w+18),y,w,labelHeight);
    }
    y-=h;
  }
  for(const template of templates){
    current=template;sectionTitle="";pageStart=pdf.getPageCount();newPage(true);
    for(const section of printSections(template)){
      const rows=printRows(section.blocks),first=rowHeight(rows[0]);
      // Keep the heading with its first answer; continue longer sections naturally.
      const reserve=first+(section.title ? sectionHeight(section.title)+10:0);
      if(y-reserve<bottom){sectionTitle="";newPage();}
      sectionTitle=section.title || "";
      if(section.title)sectionHeading(section.title);
      if(section.blocks.some(b=>"hint" in b && b.hint?.startsWith("Include your unit"))){ensure(23);y-=draw("Include your unit with risk limits, for example USD, points, or %.",margin,y,contentWidth,8,regular,muted,11)+10;}
      for(const r of rows)row(r);
      y-=8;
    }
    const total=pdf.getPageCount()-pageStart;
    for(let i=pageStart;i<pdf.getPageCount();i++){
      const p=pdf.getPage(i);
      p.drawLine({start:{x:margin,y:43},end:{x:width-margin,y:43},color:line,thickness:.5});
      p.drawText(`${book.author} · ${absoluteUrl("/book")}`,{x:margin,y:29,size:7.5,font:regular,color:muted});
      const label=`Appendix ${template.letter} · v${template.version}    ${i-pageStart+1} / ${total}`;
      p.drawText(label,{x:width-margin-regular.widthOfTextAtSize(label,7.5),y:29,size:7.5,font:regular,color:muted});
    }
  }
  pdf.setTitle(templates.length === 1 ? `${templates[0].title} | MSJournal`:`${book.title} | Companion workbook`);
  pdf.setAuthor(book.author);pdf.setCreator("MSJournal");return pdf.save();
}
