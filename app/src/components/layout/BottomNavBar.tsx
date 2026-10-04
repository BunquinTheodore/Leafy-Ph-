"use client";

import { BookOpen, History, LayoutDashboard, ScanLine, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { member } from "@/lib/i18n/member-en";
import { BOTTOM_ITEMS, isActivePath, type NavItem } from "./nav";

const ICONS = {
  home: LayoutDashboard,
  scan: ScanLine,
  history: History,
  book: BookOpen,
  user: UserRound,
} as const;

function Item({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = ICONS[item.icon];
  return (
    <li className="bottom-nav__cell">
      <Link
        href={item.href}
        className="bottom-nav__item pressable"
        data-primary={item.primary ? "true" : undefined}
        aria-current={active ? "page" : undefined}
        aria-label={item.label}
      >
        <span className="bottom-nav__icon">
          <Icon size={item.primary ? 26 : 22} strokeWidth={1.5} aria-hidden="true" />
        </span>
        <span className="bottom-nav__label">{item.short}</span>
      </Link>
    </li>
  );
}

/** Home, History, Scan (centred, primary), Handbook and Account. Safe area aware. */
export function BottomNavBar() {
  const pathname = usePathname();
  return (
    <nav className="bottom-nav" aria-label={member.nav.mobileNav}>
      <ul className="bottom-nav__list">
        {BOTTOM_ITEMS.map((item) => (
          <Item key={item.href} item={item} active={isActivePath(pathname, item.href)} />
        ))}
      </ul>
    </nav>
  );
}
