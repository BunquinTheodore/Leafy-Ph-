import type { NextRequest } from "next/server";
import { scanIdOrNotFound } from "../scan-id";
import { getProxy } from "@/lib/http/proxy";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/** Re-runs the analysis on the stored photo of a failed scan. */
export async function POST(request: NextRequest, context: Context) {
  const { id } = await context.params;
  const checked = scanIdOrNotFound(id);
  if (checked instanceof Response) return checked;
  return getProxy().json(request, { apiPath: `/scans/${checked}/retry`, auth: "required" });
}
