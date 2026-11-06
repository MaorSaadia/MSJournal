import { templates } from "@/lib/book/templates";
import { blankPdf } from "@/lib/book/pdf";
import { absoluteUrl } from "@/lib/seo";
export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const slug = file.replace(/\.pdf$/, "");
  const selected = slug === "workbook" ? templates : templates.filter((t)=>t.slug === slug);
  if (!file.endsWith(".pdf") || !selected.length) return new Response("Not found",{status:404,headers:{"X-Robots-Tag":"noindex"}});
  const bytes = await blankPdf(selected,new URL(request.url).searchParams.get("paper") === "letter" ? "letter" : "a4");
  return new Response(new Uint8Array(bytes),{headers:{"Content-Type":"application/pdf","Content-Disposition":`attachment; filename="msjournal-${slug}.pdf"`,"Cache-Control":"public, max-age=3600","X-Robots-Tag":"noindex, nofollow","X-Content-Type-Options":"nosniff",Link:`<${absoluteUrl(slug === "workbook" ? "/book" : `/book/${slug}`)}>; rel="canonical"`}});
}
