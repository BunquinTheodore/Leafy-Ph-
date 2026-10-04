"use client";

import Link from "next/link";
import { en } from "@/lib/i18n/en";
import { member } from "@/lib/i18n/member-en";
import { Logo } from "../brand/Logo";
import { LinkButton } from "../ui/Button";
import { NavLinks } from "./NavLinks";
import { SoundToggle, ThemeToggle } from "./Toggles";
import { UserMenu, type MenuUser } from "./UserMenu";

/**
 * The shared header. Guests see the handbook, sign in and a scan call to action; members see
 * their links (desktop), the toggles and the account menu. Phones use the bottom nav for links.
 */
export function HeaderBar({ user }: { user: MenuUser | null }) {
  return (
    <header className="site-header" data-member={user ? "true" : undefined}>
      <Link
        href={user ? "/dashboard" : "/"}
        aria-label={en.nav.home}
        className="inline-flex min-h-[44px] items-center"
      >
        <Logo height={30} />
      </Link>

      {user ? (
        <nav aria-label={en.nav.primary} className="site-nav site-nav--member">
          <NavLinks />
        </nav>
      ) : null}

      <div className="site-nav">
        {user ? null : (
          <>
            <Link href="/handbook" className="nav-link pressable">
              {en.nav.handbook}
            </Link>
            <Link href="/login" className="nav-link pressable">
              {en.nav.signIn}
            </Link>
            <LinkButton href="/scan" size="sm" className="site-header__cta">
              {member.nav.scan}
            </LinkButton>
          </>
        )}
        <SoundToggle />
        <ThemeToggle />
        {user ? <UserMenu user={user} /> : null}
      </div>
    </header>
  );
}
