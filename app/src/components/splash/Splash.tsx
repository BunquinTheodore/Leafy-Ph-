import type { CSSProperties } from "react";
import mark from "../brand/mark.json";
import { BRAND_WORDMARK } from "@/lib/brand";
import { SPLASH_CONTROLLER_SCRIPT } from "./splash-script";

/**
 * Full screen LEAFY screen, rendered on the server as a CSS only overlay so it paints on the
 * first byte. The inline controller removes it after at least 0.9s and at most 2.2s; a CSS
 * animation hides it at 2.4s if scripts never run. Skipped for webdriver and ?nosplash through
 * html[data-splash="off"], set by the head script before first paint.
 */
export function Splash({ nonce }: { nonce: string | undefined }) {
  return (
    <>
      <div id="leafy-splash" className="splash" data-state="active">
        <div className="splash__stage" aria-hidden="true">
          <svg className="splash__mark" viewBox={mark.viewBox} focusable="false">
            <path pathLength={1} d={mark.big} />
            <path pathLength={1} d={mark.small} />
          </svg>
          <p className="splash__word">
            {BRAND_WORDMARK.split("").map((letter, index) => (
              <span key={`${letter}-${index}`} style={{ "--i": index } as CSSProperties}>
                {letter}
              </span>
            ))}
          </p>
        </div>
        <p role="status" className="sr-only">
          Loading Leafy
        </p>
      </div>
      <script nonce={nonce} dangerouslySetInnerHTML={{ __html: SPLASH_CONTROLLER_SCRIPT }} />
    </>
  );
}
