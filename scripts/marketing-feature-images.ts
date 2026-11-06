import sharp from "sharp";
import {mkdir} from "node:fs/promises";

// Preserve the whole captured screen; these are thumbnails, never crops.
async function main(){
  await mkdir("public/marketing",{recursive:true});
  for(const id of ["calendar","review","prop-accounts"]){
    for(const suffix of ["","-light"]){
    await sharp(`public/marketing/${id}${suffix}.webp`).resize(1200,788,{fit:"contain",background:suffix ? "#f7faf8":"#10191c"}).webp({quality:88}).toFile(`public/marketing/${id}${suffix}-feature.webp`);
    }
  }
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
