import { mkdir,writeFile } from "node:fs/promises";
import { templates } from "../lib/book/templates";
import { blankPdf } from "../lib/book/pdf";
async function run(){
await mkdir("artifacts/book/pdfs",{recursive:true});
for(const t of templates){const pdf=await blankPdf([t]);await writeFile(`artifacts/book/pdfs/${t.letter}.pdf`,pdf);await writeFile(`artifacts/book/pdfs/${t.letter}-letter.pdf`,await blankPdf([t],"letter"));}
await writeFile("artifacts/book/pdfs/workbook.pdf",await blankPdf(templates));
await writeFile("artifacts/book/pdfs/workbook-letter.pdf",await blankPdf(templates,"letter"));
console.log("Generated all four current blank worksheets and A4/Letter workbooks for local inspection.");

}
run().catch(e=>{console.error(e.message);process.exitCode=1;});
