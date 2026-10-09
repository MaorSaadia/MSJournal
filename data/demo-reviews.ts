import { trades } from "./demo";
import { emptyFields, type ReviewFields } from "@/lib/reviews/model";
const recent = [...trades].reverse();
const profitable = recent.filter(
    (t) => t.grossCents - t.commissionCents - t.feesCents > 0,
  ),
  losing = recent.filter(
    (t) => t.grossCents - t.commissionCents - t.feesCents < 0,
  );
const make = (fields: Partial<ReviewFields>) => ({
  ...emptyFields(),
  ...fields,
});
export const demoReviews: Record<
  string,
  { fields: ReviewFields; status: "draft" | "reviewed" }
> = {
  [profitable[0].id]: {
    status: "reviewed",
    fields: make({
      entryRationale: "Waited for the planned pullback before entering.",
      wentWell: "Stayed patient and managed the trade according to my plan.",
      lesson: "Repeat the preparation, not the profit target.",
      adherence: "followed",
      emotions: {
        before: ["Calm", "Focused"],
        during: ["Focused"],
        after: ["Confident"],
      },
    }),
  },
  [losing[0].id]: {
    status: "reviewed",
    fields: make({
      entryRationale:
        "The setup met my checklist. I accepted the planned risk.",
      wentWell: "Respected my exit and avoided another impulsive entry.",
      lesson: "A planned loss can still be a well-executed trade.",
      adherence: "followed",
      emotions: { before: ["Calm"], during: ["Hesitant"], after: ["Calm"] },
    }),
  },
  [profitable[1].id]: {
    status: "reviewed",
    fields: make({
      management:
        "Added size beyond my written limit. The profit does not justify ignoring that rule.",
      change: "Keep position sizing inside the plan.",
      adherence: "not-followed",
      mistakes: ["oversized", "rule"],
      emotions: {
        before: ["Excited"],
        during: ["Overconfident"],
        after: ["Focused"],
      },
    }),
  },
  [losing[1].id]: {
    status: "draft",
    fields: make({
      entryRationale: "I chased the move after missing the first entry.",
      lesson: "Missing an entry is a reason to wait for a new setup.",
      adherence: "not-followed",
      mistakes: ["chased", "fomo"],
      emotions: {
        before: ["Fear of missing out"],
        during: ["Impatient"],
        after: ["Frustrated"],
      },
    }),
  },
};
