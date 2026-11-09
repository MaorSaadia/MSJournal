import { readdir, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

// Read only the selected front covers. Never copy manuscripts or full wraps.
async function main() {
const root = process.argv[2];
if (!root) throw new Error("Pass the local books asset directory.");
const folders = await readdir(root);
const covers = [
  ["day-trading-for-absolute-beginners", "Day Trading For Absolute Beginners", "book cover/eBook Cover.jpg"],
  ["smart-money-simplified", "Smart Money, Simplified", "Book Cover/Kindle Cover.jpg"],
  ["the-ict-playbook", "The ICT Playbook", "Book Cover/eBook Cover.jpg"],
  ["the-modern-ict-traders-masterclass", "The Modern ICT Trader", "book cover/Kindle Cover.jpg"],
  ["the-disciplined-edge", "The Disciplined Edge", "Book Cover/Book Cover.png"],
  ["the-institutional-ict-codex", "THE INSTITUTIONAL ICT CODEX", "Book Cover/Ebook Cover.jpg"],
  ["the-institutional-operator-book-1", "The Institutional Operator", "Book Covers/BOOK 1/Book 1 Front Cover Kindle.jpg"],
  ["the-institutional-operator-book-2", "The Institutional Operator", "Book Covers/BOOK 2/Book 2 Cover Kindle.jpg"],
];
await mkdir("public/books", { recursive: true });
await mkdir("artifacts/books", { recursive: true });
const tiles: {input: Buffer; left: number; top: number}[] = [];
const metadata = [];
for (const [index, [slug, prefix, file]] of covers.entries()) {
  const folder = folders.find((name) => name.startsWith(prefix));
  if (!folder) throw new Error(`Missing cover directory for ${slug}`);
  const output = await sharp(path.join(root, folder, file)).rotate().resize({ width: 900, withoutEnlargement: true }).webp({ quality: 88 }).toBuffer({ resolveWithObject: true });
  await writeFile(`public/books/${slug}.webp`, output.data);
  metadata.push({slug,width:output.info.width,height:output.info.height});
  tiles.push({ input: await sharp(output.data).resize(220,350,{fit:"contain",background:"#dce4e5"}).png().toBuffer(), left:(index%4)*240+10,top:Math.floor(index/4)*380+10 });
}
await sharp({create:{width:960,height:760,channels:3,background:"#dce4e5"}}).composite(tiles).png().toFile("artifacts/books/cover-contact-sheet.png");
process.stdout.write(JSON.stringify(metadata,null,2));
}
void main();
