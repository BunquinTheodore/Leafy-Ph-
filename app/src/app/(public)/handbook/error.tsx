"use client";

import { Button, LinkButton } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/Display";
import { handbookCopy } from "@/lib/handbook/copy";

/** Route error with a retry. Messages stay plain; details are never shown to the reader. */
export default function HandbookError({ reset }: { error: Error; reset: () => void }) {
  const copy = handbookCopy.errors;
  return (
    <div className="stage-fill grid place-items-center px-4">
      <EmptyState
        title={copy.title}
        action={
          <div className="flex flex-wrap justify-center gap-3">
            <Button onClick={reset}>{copy.retry}</Button>
            <LinkButton href="/" variant="secondary">
              Back to home
            </LinkButton>
          </div>
        }
      >
        {copy.body}
      </EmptyState>
    </div>
  );
}
