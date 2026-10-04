import { member } from "@/lib/i18n/member-en";

export interface NavItem {
  href: string;
  label: string;
  /** Short label for the bottom nav. */
  short: string;
  /** Lucide icon key, resolved in the component so this module stays plain data. */
  icon: "home" | "scan" | "history" | "book" | "user";
  primary?: boolean;
}

const copy = member.nav;

/** Header links for a signed in member, in the plan's order. */
export const DESKTOP_ITEMS: readonly NavItem[] = [
  { href: "/dashboard", label: copy.dashboard, short: copy.dashboard, icon: "home" },
  { href: "/scan", label: copy.scan, short: copy.scanShort, icon: "scan" },
  { href: "/scans", label: copy.history, short: copy.history, icon: "history" },
  { href: "/handbook", label: copy.handbook, short: copy.handbook, icon: "book" },
];

/** Bottom nav on phones: Scan sits in the centre as the primary action. */
export const BOTTOM_ITEMS: readonly NavItem[] = [
  { href: "/dashboard", label: copy.dashboard, short: copy.dashboard, icon: "home" },
  { href: "/scans", label: copy.history, short: copy.history, icon: "history" },
  { href: "/scan", label: copy.scan, short: copy.scanShort, icon: "scan", primary: true },
  { href: "/handbook", label: copy.handbook, short: copy.handbook, icon: "book" },
  { href: "/account", label: copy.account, short: copy.account, icon: "user" },
];

/** True when pathname is the item itself or inside it. Whole segments only (/scans is not /scan). */
export function isActivePath(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return path === href || path.startsWith(`${href}/`);
}

export function initialsFor(firstName: string, lastName: string, email: string): string {
  const first = firstName.trim().charAt(0);
  const last = lastName.trim().charAt(0);
  const fromName = `${first}${last}`.toUpperCase();
  if (fromName) return fromName;
  return email.trim().charAt(0).toUpperCase() || "?";
}
