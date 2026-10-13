"use client";
import { ThemeProvider } from "next-themes";
import { MotionConfig } from "motion/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ConfirmationProvider } from "@/components/ui/confirm-action";
import { WritingGuardProvider } from "@/components/daily/writing-guard";
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <MotionConfig reducedMotion="user" transition={{ duration: 0.2 }}>
        <TooltipProvider delayDuration={150}>
          <ConfirmationProvider>
            <WritingGuardProvider>{children}</WritingGuardProvider>
          </ConfirmationProvider>
        </TooltipProvider>
      </MotionConfig>
    </ThemeProvider>
  );
}
