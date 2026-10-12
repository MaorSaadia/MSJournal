import { notFound } from "next/navigation";
import { requirePageUser } from "@/lib/session";
import {
  getTradingAccount,
  listTradingAccounts,
  NotFoundError,
} from "@/lib/accounts/service";
import { PropAccountDetail } from "@/components/props/account-detail";
export const metadata = { title: "Account progress" };
export default async function Page({
  params,
}: PageProps<"/prop-accounts/[id]">) {
  await requirePageUser();
  let account;
  try {
    account = await getTradingAccount((await params).id);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  return (
    <PropAccountDetail
      account={account}
      ownedAccounts={await listTradingAccounts()}
    />
  );
}
