import { BillingPage } from "@/components/billing/billing-page";
import { billingStatus } from "@/lib/billing/status";
export const metadata = { title: "Billing" };
export default async function Page() {
  return <BillingPage initial={await billingStatus()} />;
}
