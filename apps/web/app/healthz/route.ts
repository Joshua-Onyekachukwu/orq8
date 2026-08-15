import { NextResponse } from "next/server";

// docs/43 — liveness probe used by infra/docker-compose.yml (orq8-web healthcheck)
export function GET() {
  return NextResponse.json({ status: "ok", service: "orq8-web" });
}
