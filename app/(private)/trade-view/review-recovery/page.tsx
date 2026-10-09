import { recoveryReviews } from "@/lib/reviews/service";
import { ReviewRecovery } from "@/components/reviews/recovery";
export const metadata = { title: "Review recovery" };
export default async function Page() {
  return (
    <div className="accounts-page">
      <ReviewRecovery initial={await recoveryReviews()} />
    </div>
  );
}
