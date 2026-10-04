import type { NextConfig } from "next";

const ONE_DAY = 60 * 60 * 24;
const ONE_YEAR = ONE_DAY * 365;

/** Static files copied from /public are not content hashed, so they get a long but revalidated life. */
const PUBLIC_ASSET_PATHS = ["/brand", "/icons", "/cursors", "/handbook", "/og"] as const;

const nextConfig: NextConfig = {
  // Parallel workflows build into their own folder (NEXT_DIST_DIR) so builds never collide.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  output: "standalone",
  // Pin the trace root to the app folder so standalone/server.js is always at the top level,
  // even when a lockfile exists in a parent directory. Builds run with the app folder as cwd.
  outputFileTracingRoot: process.cwd(),
  poweredByHeader: false,
  reactStrictMode: true,
  // Put title, description, canonical and Open Graph tags in <head> for every client. Without
  // this Next streams them into <body> for browsers, which crawlers and Lighthouse do not read.
  htmlLimitedBots: /.*/,
  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: ONE_YEAR,
    deviceSizes: [360, 414, 640, 828, 1080, 1440, 1920],
    imageSizes: [64, 128, 256, 384],
  },
  experimental: {
    // inlineCss was measured and rejected: it grows every uncacheable HTML response by the whole
    // stylesheet and made HTTP/1.1 runs slower (see docs/PERFORMANCE.md).
    optimizePackageImports: ["lucide-react", "@react-three/drei", "three"],
  },
  async headers() {
    return [
      ...PUBLIC_ASSET_PATHS.map((path) => ({
        source: `${path}/:file*`,
        headers: [
          {
            key: "Cache-Control",
            value: `public, max-age=${ONE_DAY * 7}, stale-while-revalidate=${ONE_DAY * 30}`,
          },
        ],
      })),
      {
        source: "/manifest.webmanifest",
        headers: [{ key: "Cache-Control", value: `public, max-age=${ONE_DAY}` }],
      },
    ];
  },
};

export default nextConfig;
