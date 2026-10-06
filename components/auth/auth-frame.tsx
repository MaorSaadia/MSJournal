"use client";
import { motion } from "motion/react";
import { LockKeyhole } from "lucide-react";
import { ThemeControl } from "@/components/shell";
export function AuthFrame({
  title,
  description,
  configured = true,
  children,
}: {
  title: string;
  description: string;
  configured?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="login-page">
      <header className="login-header">
        <span className="brand-name">
          MS<span>Journal</span>
        </span>
        <ThemeControl />
      </header>
      <motion.main
        className="login-card"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18 }}
      >
        <div className="dialog-symbol">
          <LockKeyhole size={25} />
        </div>
        <span className="eyebrow">YOUR PRIVATE WORKSPACE</span>
        <h1>
          {title}
          <span className="title-dot">.</span>
        </h1>
        <p className="muted">{description}</p>
        {!configured && (
          <div className="setup-notice" role="status">
            <strong>Authentication needs local setup</strong>
            <p>
              Configure the database and authentication environment variables,
              then apply the reviewed migration. See README.md.
            </p>
          </div>
        )}
        {children}
      </motion.main>
      <footer className="login-footer">
        MSJournal · Your personal trading journal
      </footer>
    </div>
  );
}
