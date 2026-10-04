"use client";

import { Leaf } from "lucide-react";
import { Button, LinkButton } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/Display";

/** Route errors inside the member area: calm message, a retry and a way back. */
export default function MemberError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="stage-fill grid place-items-center px-[var(--gutter)]">
      <EmptyState
        icon={Leaf}
        title="This page did not load"
        action={
          <div className="flex flex-wrap justify-center gap-3">
            <Button onClick={reset}>Try again</Button>
            <LinkButton href="/handbook" variant="secondary">
              Open the handbook
            </LinkButton>
          </div>
        }
      >
        Something went wrong on our side. Your scans are safe. Try again in a moment.
      </EmptyState>
    </div>
  );
}
