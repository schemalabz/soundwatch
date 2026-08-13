import { NextResponse } from "next/server";
import { buildOpenApiDocument } from "@/lib/api/openapi";

// The document is a pure function of the code — safe to render at build time.
export const dynamic = "force-static";

export async function GET() {
  return NextResponse.json(buildOpenApiDocument());
}
