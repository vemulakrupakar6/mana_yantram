import {
  CalendarDays,
  CircleHelp,
  ClipboardCheck,
  ClipboardList,
  Database,
  FileText,
  Gauge,
  HandCoins,
  LayoutDashboard,
  Map,
  Settings,
  ShieldCheck,
  Sprout,
  Tractor,
  TrendingUp,
  UserRound,
  Users,
  WalletCards,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { Portal } from "@/types/auth";

type MenuItem = { label: string; icon: LucideIcon; href?: string };
export const portalMenus: Record<Portal, MenuItem[]> = {
  farmer: [
    { label: "dashboard", icon: LayoutDashboard, href: "/farmer/dashboard" },
    { label: "findServices", icon: Tractor, href: "/services" },
    { label: "myBookings", icon: CalendarDays },
    { label: "myPlots", icon: Map },
    { label: "payments", icon: WalletCards },
    { label: "grievances", icon: CircleHelp },
    { label: "myProfile", icon: UserRound, href: "/profile" },
  ],
  provider: [
    { label: "dashboard", icon: LayoutDashboard, href: "/provider/dashboard" },
    { label: "requests", icon: ClipboardList },
    { label: "myEquipment", icon: Tractor },
    { label: "rates", icon: Wrench },
    { label: "availability", icon: CalendarDays },
    { label: "operators", icon: Users },
    { label: "earnings", icon: HandCoins },
    { label: "documents", icon: FileText },
  ],
  admin: [
    { label: "dashboard", icon: LayoutDashboard, href: "/admin/dashboard" },
    { label: "farmers", icon: Sprout },
    { label: "providers", icon: Users },
    { label: "verification", icon: ShieldCheck },
    { label: "equipment", icon: Tractor },
    { label: "bookings", icon: CalendarDays },
    { label: "payments", icon: WalletCards },
    { label: "grievances", icon: CircleHelp },
    { label: "reports", icon: TrendingUp },
    { label: "masters", icon: Database },
    { label: "userRoles", icon: Users },
    { label: "auditLogs", icon: ClipboardCheck },
    { label: "settings", icon: Settings },
  ],
};
export const dashboardMetrics = {
  farmer: [
    ["totalBookings", CalendarDays],
    ["inProgress", Gauge],
    ["completed", ClipboardCheck],
  ],
  provider: [
    ["registeredEquipment", Tractor],
    ["incoming", ClipboardList],
    ["completed", ClipboardCheck],
  ],
  admin: [
    ["totalBookings", CalendarDays],
    ["completed", ClipboardCheck],
    ["inProgress", Gauge],
    ["cancelled", CalendarDays],
  ],
} as const;
