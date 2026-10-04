import { LinkButton } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/Display";
import { handbookCopy } from "@/lib/handbook/copy";

export default function HandbookNotFound() {
  const copy = handbookCopy.errors;
  return (
    <div className="stage-fill grid place-items-center px-4">
      <EmptyState
        title={copy.notFoundTitle}
        action={<LinkButton href="/handbook">Browse the handbook</LinkButton>}
      >
        {copy.notFoundBody}
      </EmptyState>
    </div>
  );
}
