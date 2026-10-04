import Link from "next/link";
import { BRAND_NAME, BRAND_ORIGIN_NOTE } from "@/lib/brand";
import "./site-footer.css";

const LINKS = [
  { href: "/handbook", label: "Handbook" },
  { href: "/about", label: "About" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
] as const;

/**
 * One compact row. It has a fixed height (--footer-h) that `.stage-fill` subtracts, so a full
 * page stage plus header plus footer still equals the viewport.
 */
export function SiteFooter() {
  return (
    <footer className="site-footer">
      <p className="site-footer__origin">
        {BRAND_NAME} began as DAHON. {BRAND_ORIGIN_NOTE}
      </p>
      <nav aria-label="Footer">
        {LINKS.map((link) => (
          <Link key={link.href} href={link.href} className="pressable">
            {link.label}
          </Link>
        ))}
      </nav>
    </footer>
  );
}
