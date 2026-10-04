import type { Metadata } from "next";
import { StatePage } from "@/components/layout/StatePage";
import { LinkButton } from "@/components/ui/Button";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <StatePage
      eyebrow="Error 404"
      title="Page not found"
      actions={
        <>
          <LinkButton href="/" size="lg">
            Go to the home page
          </LinkButton>
          <LinkButton href="/handbook" variant="secondary" size="lg">
            Browse the handbook
          </LinkButton>
        </>
      }
    >
      The link may be old or mistyped. The home page and the handbook are good places to start
      again.
    </StatePage>
  );
}
