import type { Metadata } from "next";
import { ScanFlow } from "@/components/scan/ScanFlow";
import { requireUser } from "@/lib/auth/current-user";
import { loadLabelOptionsOrNull } from "@/lib/scans/labels-server";

export const metadata: Metadata = { title: "Scan a leaf" };
export const dynamic = "force-dynamic";

export default async function ScanPage() {
  const [user, labels] = await Promise.all([requireUser(), loadLabelOptionsOrNull()]);
  return <ScanFlow verified={user.email_verified} labels={labels} />;
}
