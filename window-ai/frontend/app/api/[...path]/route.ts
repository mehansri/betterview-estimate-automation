import { type NextRequest } from "next/server";

/**
 * Same-origin proxy to the FastAPI backend. The server adds the shared
 * API_ACCESS_TOKEN (api/security.py), so browsers never hold it. Local routes
 * such as /api/addresses are more specific and are served by their own handlers.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// user-agent: the customer portal records it with an acceptance.
const FORWARDED_REQUEST_HEADERS = ["content-type", "accept", "user-agent", "x-pricing-admin-token"];
const FORWARDED_RESPONSE_HEADERS = ["content-type", "content-disposition", "cache-control"];

function upstreamOrigin() {
  return (process.env.API_PROXY_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").trim();
}

async function proxy(request: NextRequest, { params }: { params: { path: string[] } }) {
  const target = new URL(`/api/${params.path.map(encodeURIComponent).join("/")}${request.nextUrl.search}`, upstreamOrigin());
  const headers = new Headers();
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const token = process.env.API_ACCESS_TOKEN?.trim();
  if (token) headers.set("authorization", `Bearer ${token}`);

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer(),
      cache: "no-store",
      redirect: "manual",
    });
  } catch {
    return Response.json({ detail: "The pricing service is unreachable" }, { status: 502 });
  }

  const responseHeaders = new Headers();
  for (const name of FORWARDED_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }
  // Says only whether this deployment has a token configured, never its value.
  responseHeaders.set("x-estimator-proxy", token ? "token-configured" : "token-missing");
  return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
}

export { proxy as DELETE, proxy as GET, proxy as PATCH, proxy as POST, proxy as PUT };
