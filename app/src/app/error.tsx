"use client";

import { StatePage } from "@/components/layout/StatePage";
import { Button, LinkButton } from "@/components/ui/Button";

/** Route level error boundary: say what happened, offer a retry and a way out. */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <StatePage
      eyebrow="Something went wrong"
      title="We hit a snag"
      actions={
        <>
          <Button size="lg" onClick={reset}>
            Try again
          </Button>
          <LinkButton href="/" variant="secondary" size="lg">
            Go to the home page
          </LinkButton>
        </>
      }
      note={error.digest ? `Reference ${error.digest}` : undefined}
    >
      That was on our side, not yours. Try again in a moment, or head back to the home page.
    </StatePage>
  );
}
