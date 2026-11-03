import { Bell, Camera, Clock, Home, Package, PlusCircle, User, Users } from "lucide-react";

export const NAV_ITEMS = [
  { href: "/dashboard", label: "Home", desktopLabel: "Dashboard", Icon: Home, mobile: true },
  { href: "/scan", label: "Scan", desktopLabel: "Scan product", Icon: Camera, mobile: true },
  { href: "/products/new", label: "Add", desktopLabel: "Add manually", Icon: PlusCircle, mobile: false },
  { href: "/inventory", label: "Inventory", desktopLabel: "Inventory", Icon: Package, mobile: true },
  { href: "/expiring", label: "Expiring", desktopLabel: "Expiring soon", Icon: Clock, mobile: false },
  { href: "/household", label: "Family", desktopLabel: "Family sharing", Icon: Users, mobile: false },
  { href: "/notifications", label: "Alerts", desktopLabel: "Notifications", Icon: Bell, mobile: true },
  { href: "/settings", label: "Profile", desktopLabel: "Profile & settings", Icon: User, mobile: true },
] as const;

export function isActive(pathname: string, href: string): boolean {
  if (href === "/products/new") return pathname === href;
  return pathname === href || (href !== "/dashboard" && pathname.startsWith(`${href}/`));
}
