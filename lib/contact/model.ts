import { z } from "zod";

export const topics = {
  feature: { label: "Feature request", subject: "Feature request", hint: "What would you like to do in MSJournal, and how would it help?" },
  bug: { label: "Bug or technical problem", subject: "Technical problem", hint: "What were you trying to do, and what happened instead?" },
  billing: { label: "Billing & subscriptions", subject: "Billing", hint: "What happened with your payment or subscription?" },
  access: { label: "Account access", subject: "Account access", hint: "What’s stopping you from accessing your account?" },
  general: { label: "General question", subject: "General question", hint: "What can we help you with?" },
};

export const topicSchema = z.enum(["feature", "bug", "billing", "access", "general"]);
export const messageLimit = 4000;
export const submissionSchema = z.object({
  id: z.string().regex(/^\d{13}:[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/),
  topic: topicSchema,
  email: z.string().trim().max(254).pipe(z.email()),
  message: z.string().trim().min(1).max(messageLimit),
  receipt: z.string().trim().max(120).optional(),
  website: z.literal("").optional(),
}).strict().refine((v) => v.topic === "billing" || !v.receipt);

export type ContactTopic = z.infer<typeof topicSchema>;
export type ContactSubmission = z.infer<typeof submissionSchema>;
