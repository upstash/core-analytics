import { NextRequest, NextFetchEvent, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { Analytics } from "@upstash/analytics";

const analytics = new Analytics({
  redis: Redis.fromEnv(),
  window: "1m",
})

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};

export default function middleware(req: NextRequest, event: NextFetchEvent): NextResponse {
  const url = new URL(req.url);

  console.log(req.geo)
  event.waitUntil(analytics.ingest("pageviews", {
    pathname: url.pathname,
    ...req.geo
  }).then(() => console.log("ingested")))

  return NextResponse.next();
}
