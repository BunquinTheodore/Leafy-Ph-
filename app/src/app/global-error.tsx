"use client";

/**
 * Last resort boundary: it replaces the root layout, so no tokens, fonts or providers exist.
 * It carries its own small stylesheet and only plain HTML, and still offers a retry and a way out.
 */
const STYLES = `
:root{--bg:#06120b;--text:#e9f4ec;--muted:#9bb8a6;--brand:#40c057;--on-brand:#06120b;--border:#1e3d2b}
@media (prefers-color-scheme: light){:root{--bg:#f5faf4;--text:#0e2316;--muted:#46604f;--brand:#23813a;--on-brand:#ffffff;--border:#cfe0cb}}
*{box-sizing:border-box;hyphens:none}
body{margin:0;min-height:100dvh;display:grid;place-items:center;padding:24px;background:var(--bg);color:var(--text);font-family:system-ui,-apple-system,"Segoe UI",sans-serif;line-height:1.6}
main{max-width:34rem}
h1{margin:0 0 12px;font-weight:300;font-size:clamp(1.75rem,6vw,2.75rem);letter-spacing:.12em;text-transform:uppercase;line-height:1.1;text-wrap:balance}
p{margin:0 0 24px;color:var(--muted);text-wrap:pretty}
.row{display:flex;flex-wrap:wrap;gap:12px}
.btn{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:0 28px;border-radius:999px;border:1px solid var(--brand);background:transparent;color:var(--text);font:600 1rem system-ui,sans-serif;text-decoration:none;cursor:pointer}
.btn.primary{background:var(--brand);color:var(--on-brand)}
.btn:focus-visible{outline:3px solid var(--brand);outline-offset:3px}
small{display:block;margin-top:24px;color:var(--muted)}
`;

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <head>
        <title>Something went wrong | Leafy</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex" />
        <style dangerouslySetInnerHTML={{ __html: STYLES }} />
      </head>
      <body>
        <main>
          <h1>We hit a snag</h1>
          <p>
            Leafy could not load this page. That was on our side, not yours. Try again in a moment,
            or go back to the home page.
          </p>
          <div className="row">
            <button type="button" className="btn primary" onClick={reset}>
              Try again
            </button>
            {/* A plain link on purpose: this boundary replaces the root layout and the router. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a className="btn" href="/">
              Go to the home page
            </a>
          </div>
          {error.digest ? <small>Reference {error.digest}</small> : null}
        </main>
      </body>
    </html>
  );
}
