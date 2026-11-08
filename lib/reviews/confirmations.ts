import { z } from "zod";
export const confirmations = ["SMT", "One Candle CISD", "CISD", "OB", "IFVG", "FVG", "HTF PDA", "Sellside Liquidity", "Buyside Liquidity", "Order Flow", "AMD", "ATM Model", "FIB", "NWOG", "PDH/PDL", "First Presented FVG", "Rejection Block"];
export const confirmationName = z.string().trim().min(1).max(60)
  .refine((v) => !/[\u0000-\u001f\u007f]/.test(v), "Use a single-line name.")
  .transform((v) => confirmations.find((s) => s.toLowerCase() === v.toLowerCase()) ?? v);
