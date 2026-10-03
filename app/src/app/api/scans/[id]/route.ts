import type { NextRequest } from "next/server";
import { z } from "zod";
import { getProxy } from "@/lib/http/proxy";

export const dynamic = "force-dynamic";

const idSchema = z.string().uuid();
type Context = { params: Promise<{ id: string }> };

async function handle(request: NextRequest, context: Context) {
  const { id } = await context.params;
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) {
    return Response.json(
      {
        success: false,
        data: null,
        error: { code: "not_found", message: "We could not find that scan." },
      },
      { status: 404, headers: { "cache-control": "no-store" } },
    );
  }
  return getProxy().json(request, { apiPath: `/scans/${parsed.data}`, auth: "required" });
}

export const GET = handle;
export const DELETE = handle;
