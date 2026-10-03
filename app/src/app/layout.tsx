import type { Metadata, Viewport } from "next";
import { Josefin_Sans, Manrope, Poppins } from "next/font/google";
import { cookies, headers } from "next/headers";
import type { ReactNode } from "react";
import { Header } from "@/components/layout/Header";
import { HEAD_SCRIPT } from "@/components/layout/head-script";
import { Splash } from "@/components/splash/Splash";
import { BRAND_DESCRIPTION, BRAND_NAME } from "@/lib/brand";
import { Providers } from "./providers";
import "./globals.css";

const josefin = Josefin_Sans({
  subsets: ["latin"],
  weight: ["300"],
  display: "swap",
  variable: "--font-josefin",
  adjustFontFallback: true,
});

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["500", "600"],
  display: "swap",
  variable: "--font-poppins",
});

const manrope = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
  variable: "--font-manrope",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_ORIGIN ?? "http://localhost:3000"),
  title: { default: `${BRAND_NAME} | Know your leaf`, template: `%s | ${BRAND_NAME}` },
  description: BRAND_DESCRIPTION,
  applicationName: BRAND_NAME,
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icons/favicon.svg", type: "image/svg+xml" },
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon.ico", sizes: "48x48" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  appleWebApp: { capable: true, title: BRAND_NAME, statusBarStyle: "black-translucent" },
  openGraph: {
    type: "website",
    siteName: BRAND_NAME,
    title: `${BRAND_NAME} | Know your leaf`,
    description: BRAND_DESCRIPTION,
    images: [{ url: "/og/og-image.png", width: 1200, height: 630, alt: "Leafy, know your leaf" }],
  },
  twitter: { card: "summary_large_image", images: ["/og/og-image.png"] },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#06120b" },
    { media: "(prefers-color-scheme: light)", color: "#f5faf4" },
  ],
};

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const savedTheme = (await cookies()).get("leafy_theme")?.value;
  const theme = savedTheme === "light" || savedTheme === "dark" ? savedTheme : undefined;

  return (
    <html
      lang="en"
      data-theme={theme}
      className={`${josefin.variable} ${poppins.variable} ${manrope.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: HEAD_SCRIPT }} />
      </head>
      <body>
        <Splash nonce={nonce} />
        <a href="#main" className="skip-link sr-only-focusable">
          Skip to content
        </a>
        <Providers>
          <Header />
          <main id="main">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
