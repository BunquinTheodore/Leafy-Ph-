"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, type CSSProperties } from "react";
import { DESKTOP_ITEMS, isActivePath } from "./nav";

/**
 * Desktop links for a member. A pill slides to the hovered or focused link and rests on the
 * current page. The pill is absolutely positioned, so moving it never reflows the links.
 */
export function NavLinks() {
  const pathname = usePathname();
  const rootRef = useRef<HTMLDivElement>(null);

  const moveTo = useCallback((target: HTMLElement | null) => {
    const root = rootRef.current;
    if (!root) return;
    if (!target) {
      root.style.setProperty("--pill-o", "0");
      return;
    }
    root.style.setProperty("--pill-x", `${target.offsetLeft}px`);
    root.style.setProperty("--pill-w", `${target.offsetWidth}px`);
    root.style.setProperty("--pill-o", "1");
  }, []);

  const rest = useCallback(() => {
    const current = rootRef.current?.querySelector<HTMLElement>('[aria-current="page"]') ?? null;
    moveTo(current);
  }, [moveTo]);

  useEffect(() => {
    rest();
    window.addEventListener("resize", rest);
    return () => window.removeEventListener("resize", rest);
  }, [pathname, rest]);

  return (
    <div
      ref={rootRef}
      className="member-links"
      style={{ "--pill-o": 0 } as CSSProperties}
      onPointerLeave={rest}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) rest();
      }}
    >
      <span className="member-links__pill" aria-hidden="true" />
      {DESKTOP_ITEMS.map((item) => {
        const active = isActivePath(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className="nav-link pressable member-links__link"
            aria-current={active ? "page" : undefined}
            onPointerEnter={(event) => moveTo(event.currentTarget)}
            onFocus={(event) => moveTo(event.currentTarget)}
          >
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}
