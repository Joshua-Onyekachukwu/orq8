import { NextRequest, NextResponse } from "next/server";

const API_URL = process.env.API_URL || "http://localhost:3001";

async function proxy(req: NextRequest, path: string) {
  const token = req.cookies.get("session")?.value;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["cookie"] = `session=${token}`;

  const init: RequestInit = {
    method: req.method,
    headers,
    redirect: "manual",
  };

  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = await req.text();
  }

  const url = new URL(path, API_URL);
  url.search = req.nextUrl.search;

  const res = await fetch(url.toString(), init);

  const setCookie = res.headers.get("set-cookie");
  const responseHeaders: Record<string, string> = {};
  if (setCookie) responseHeaders["set-cookie"] = setCookie;

  const body = await res.text();
  return new NextResponse(body, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") || "application/json", ...responseHeaders },
  });
}

export async function GET(req: NextRequest) {
  return proxy(req, "/v1/strategies");
}

export async function POST(req: NextRequest) {
  return proxy(req, "/v1/strategies");
}
