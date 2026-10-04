import { z } from "zod";

const idSchema = z.string().uuid();

/** Returns the validated id, or a calm 404 envelope for anything that is not a UUID. */
export function scanIdOrNotFound(id: string): string | Response {
  const parsed = idSchema.safeParse(id);
  if (parsed.success) return parsed.data;
  return Response.json(
    {
      success: false,
      data: null,
      error: { code: "not_found", message: "We could not find that scan." },
    },
    { status: 404, headers: { "cache-control": "no-store" } },
  );
}
