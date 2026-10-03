import type { NextRequest } from "next/server";
import { getProxy } from "@/lib/http/proxy";

export const dynamic = "force-dynamic";

export const GET = (request: NextRequest) =>
  getProxy().json(request, { apiPath: "/scans", auth: "required" });
export const POST = (request: NextRequest) => getProxy().upload(request, { apiPath: "/scans" });
