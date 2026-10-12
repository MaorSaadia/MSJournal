import { requirePageUser } from "@/lib/session";
import { Notebook } from "@/components/daily/notebook";
export const metadata = { title: "Notebook" };
export default async function Page() {
  await requirePageUser();
  return <Notebook />;
}
