import type { ReactNode } from "react";
import { AuthStage } from "@/components/auth/AuthLayout";

/** Login and register share one stage, so the drifting leaves keep going between them. */
export default function AuthGroupLayout({ children }: { children: ReactNode }) {
  return <AuthStage>{children}</AuthStage>;
}
