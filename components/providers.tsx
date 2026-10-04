"use client";
import { ThemeProvider } from "next-themes";
import { MotionConfig } from "motion/react";
import { TooltipProvider } from "@/components/ui/tooltip";
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <MotionConfig reducedMotion="user" transition={{ duration: 0.2 }}>
        <TooltipProvider delayDuration={150}>{children}</TooltipProvider>
      </MotionConfig>
    </ThemeProvider>
  );
}
