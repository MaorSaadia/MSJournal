"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { motion } from "motion/react";
import {
  Upload,
  PanelLeftClose,
  PanelLeftOpen,
  Menu,
  Sun,
  Moon,
  Monitor,
  Sprout,
} from "lucide-react";
import { navigation } from "@/lib/navigation";
import { LogoutButton } from "@/components/auth/logout";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
export function ThemeControl() {
  const { theme, setTheme } = useTheme();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Choose appearance"
          className="theme-button"
        >
          <Sun className="light-icon" size={18} />
          <Moon className="dark-icon" size={18} />
        </Button>
      </PopoverTrigger>
      <PopoverContent side="right" className="theme-menu">
        <strong>Appearance</strong>
        {[
          { value: "light", label: "Light", icon: Sun },
          { value: "dark", label: "Dark", icon: Moon },
          { value: "system", label: "System", icon: Monitor },
        ].map((item) => (
          <button
            key={item.value}
            onClick={() => setTheme(item.value)}
            className="menu-option"
          >
            <item.icon size={16} />
            {item.label}
            <span className="theme-check" suppressHydrationWarning>
              {theme === item.value ? "✓" : ""}
            </span>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
function ImportButton({ compact = false }: { compact?: boolean }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          className={`import-button ${compact ? "compact-import" : ""}`}
          title="Import Trades"
        >
          <Upload size={16} />
          {!compact && "Import Trades"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <div className="dialog-symbol">
          <Upload size={25} />
        </div>
        <DialogTitle>Bring your trades into focus</DialogTitle>
        <DialogDescription>
          Tradovate CSV importing is the next milestone. Today, manage your
          accounts or switch the Dashboard to Demo to explore fictional results.
        </DialogDescription>
        <div className="note-box">
          Future imports will let you choose the CSV source timezone, including
          Asia/Jerusalem and America/New_York, and normalize timestamps to UTC
          using daylight-saving rules.
        </div>
        <p className="small muted">No files are uploaded or processed today.</p>
      </DialogContent>
    </Dialog>
  );
}
export function Shell({
  children,
  displayName,
}: {
  children: React.ReactNode;
  displayName: string;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const links = (compact: boolean) => (
    <>
      <div className="sidebar-brand">
        {compact ? (
          <Sprout size={23} />
        ) : (
          <>
            <span className="brand-name">
              MS<span>Journal</span>
            </span>
            <span className="brand-caption">THE TRADER’S PERSPECTIVE</span>
          </>
        )}
      </div>
      <ImportButton compact={compact} />
      <div className="nav-label">{!compact && "WORKSPACE"}</div>
      <nav aria-label="Main navigation">
        {navigation.map((item, index) => (
          <Link
            key={item.href}
            href={item.href}
            title={compact ? item.title : undefined}
            aria-current={pathname === item.href ? "page" : undefined}
            onClick={() => setMobileOpen(false)}
            className={`nav-link ${pathname === item.href ? "active" : ""} ${index === 8 ? "settings-link" : ""}`}
          >
            <item.icon size={18} />
            {!compact && <span>{item.title}</span>}
            {!compact && pathname === item.href && (
              <span className="active-dot" />
            )}
          </Link>
        ))}
      </nav>
      {!compact && (
        <div className="sidebar-bottom">
          <div className="demo-avatar">MS</div>
          <div>
            <strong title={displayName}>{displayName}</strong>
            <span>Private workspace · Day 2</span>
          </div>
        </div>
      )}
    </>
  );
  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <aside className="utility-rail" aria-label="Workspace utilities">
        <Link href="/" aria-label="MSJournal dashboard" className="monogram">
          m<span>j</span>
          <i />
        </Link>
        <div className="rail-bottom">
          <LogoutButton compact />
          <ThemeControl />
        </div>
      </aside>
      <motion.aside
        className={`desktop-sidebar ${collapsed ? "collapsed" : ""}`}
        animate={{ width: collapsed ? 64 : 184 }}
        initial={false}
      >
        {links(collapsed)}
        <Button
          variant="ghost"
          size="icon"
          className="collapse-button"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? (
            <PanelLeftOpen size={17} />
          ) : (
            <PanelLeftClose size={17} />
          )}
        </Button>
      </motion.aside>
      <div className="main-region">
        <div className="mobile-header">
          <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Open navigation">
                <Menu size={21} />
              </Button>
            </DialogTrigger>
            <DialogContent className="mobile-drawer">
              <DialogTitle className="sr-only">Navigation</DialogTitle>
              <DialogDescription className="sr-only">
                MSJournal workspace navigation
              </DialogDescription>
              {links(false)}
            </DialogContent>
          </Dialog>
          <Link href="/" className="brand-name">
            MS<span>Journal</span>
          </Link>
          <ThemeControl />
        </div>
        <main id="main-content">{children}</main>
        <footer className="app-footer">
          <span>
            <Sprout size={13} /> A little reflection. A better next trade.
          </span>
          <span>MSJournal · Day 2</span>
        </footer>
      </div>
    </div>
  );
}
