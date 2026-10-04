import "@/components/account/account.css";
import { Skeleton } from "@/components/ui/Display";

export default function AccountLoading() {
  return (
    <div className="acct-stage stage-fill" aria-busy="true" aria-label="Loading your account">
      <header className="acct-stage__head">
        <Skeleton style={{ height: 40, width: 220 }} />
      </header>
      <div className="acct-stage__panels">
        <div className="acct" style={{ padding: "24px var(--gutter)" }}>
          <Skeleton style={{ height: 160 }} />
          <Skeleton style={{ height: 280 }} />
        </div>
      </div>
    </div>
  );
}
