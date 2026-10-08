import {
  LayoutDashboard,
  CalendarDays,
  ArrowLeftRight,
  BookOpen,
  ChartNoAxesCombined,
  Crosshair,
  TrendingUp,
  WalletCards,
  Settings,
} from "lucide-react";
export const navigation = [
  {
    title: "Dashboard",
    href: "/",
    icon: LayoutDashboard,
    description: "Your trading performance, in one place.",
  },
  {
    title: "Calendar",
    href: "/calendar",
    icon: CalendarDays,
    description: "Monthly realized activity and daily contributions.",
  },
  {
    title: "Day View",
    href: "/day-view",
    icon: CalendarDays,
    description: "Review each trading session and its results.",
  },
  {
    title: "Trade View",
    href: "/trade-view",
    icon: ArrowLeftRight,
    description: "Explore imported trades and their individual details.",
  },
  {
    title: "Notebook",
    href: "/notebook",
    icon: BookOpen,
    description: "Capture trade notes, reflections, and screenshots.",
  },
  {
    title: "Reports",
    href: "/reports",
    icon: ChartNoAxesCombined,
    description: "Discover patterns in your trading performance.",
  },
  {
    title: "Strategies",
    href: "/strategies",
    icon: Crosshair,
    description: "Build playbooks for your setups and strategies.",
  },
  {
    title: "Progress Tracker",
    href: "/progress-tracker",
    icon: TrendingUp,
    description: "Follow your preparation, habits, and progress.",
  },
  {
    title: "Prop Accounts",
    href: "/prop-accounts",
    icon: WalletCards,
    description: "Manage evaluation, funded, and personal trading accounts.",
  },
  {
    title: "Settings",
    href: "/settings",
    icon: Settings,
    description:
      "Manage your profile, display timezone, appearance, and private session.",
  },
];
