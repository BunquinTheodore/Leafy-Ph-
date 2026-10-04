import { NextResponse } from "next/server";
import { loadLabelOptions } from "@/lib/scans/labels-server";

export const dynamic = "force-dynamic";

/** Plants and their diseases for the "What is it really?" picker. Public catalog data. */
export async function GET() {
  try {
    return NextResponse.json(
      { success: true, data: await loadLabelOptions(), error: null },
      { headers: { "cache-control": "private, max-age=300" } },
    );
  } catch {
    return NextResponse.json(
      {
        success: false,
        data: null,
        error: { code: "api_unreachable", message: "We could not load the plant list." },
      },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
