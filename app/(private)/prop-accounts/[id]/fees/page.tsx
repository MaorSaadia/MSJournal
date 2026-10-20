import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { getFeeSettings } from "@/lib/journal/service";
import { NotFoundError } from "@/lib/accounts/service";
export const metadata = { title: "Fees & net P&L" };
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  try {
    await getFeeSettings(id);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  redirect(`/fees?accountId=${id}`);
}
