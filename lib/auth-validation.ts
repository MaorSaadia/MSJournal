import { z } from "zod";
export const emailInput = z
  .string()
  .trim()
  .email("Enter a valid email address.");
export const passwordInput = z
  .string()
  .min(12, "Use at least 12 characters.")
  .max(128, "Use no more than 128 characters.");
export const signupInput = z
  .object({
    name: z.string().trim().min(1, "Enter your name.").max(100),
    email: emailInput,
    password: passwordInput,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match.",
  });
export const loginInput = z.object({
  email: emailInput,
  password: z.string().min(1, "Enter your password.").max(128),
});
export const resetInput = z
  .object({ password: passwordInput, confirmPassword: z.string() })
  .refine((v) => v.password === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match.",
  });
