import Link from "next/link";
import { en } from "@/lib/i18n/en";
import { Logo } from "../brand/Logo";
import { SoundToggle, ThemeToggle } from "./Toggles";

/** Guest header for the checkpoint: mark, public links, sound and theme toggles. */
export function Header() {
  return (
    <header className="site-header">
      <Link href="/" aria-label={en.nav.home} className="inline-flex min-h-[44px] items-center">
        <Logo height={30} />
      </Link>
      <nav aria-label={en.nav.primary} className="site-nav">
        <Link href="/handbook" className="nav-link pressable">
          {en.nav.handbook}
        </Link>
        <Link href="/login" className="nav-link pressable">
          {en.nav.signIn}
        </Link>
        <SoundToggle />
        <ThemeToggle />
      </nav>
    </header>
  );
}
