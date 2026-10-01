import { defineHandler, proxyRequest } from "nitro/h3";
import { appendForwardedPeer, getApiProxyTarget } from "./api-upstream";

export const apiProxy = defineHandler((event) => {
  const target = getApiProxyTarget(
    event.url.pathname + event.url.search,
    process.env.API_UPSTREAM_URL || "http://127.0.0.1:3001",
  );
  let forwardedFor: string;
  try {
    forwardedFor = appendForwardedPeer(
      event.req.headers.get("x-forwarded-for"),
      event.req.runtime?.node?.req.socket.remoteAddress,
    );
  } catch {
    return new Response("Proxy client address unavailable", { status: 503 });
  }
  return proxyRequest(event, target, {
    headers: { "x-forwarded-for": forwardedFor },
    // Origin is deliberately preserved for Better Auth's CSRF checks. Do not
    // trust client-supplied forwarding headers or follow upstream redirects
    // server-side with the user's cookies.
    filterHeaders: [
      "forwarded",
      "x-forwarded-host",
      "x-forwarded-proto",
      "x-real-ip",
      "x-video-host-client-ip",
      "x-forwarded-for",
    ],
    fetchOptions: { redirect: "manual", signal: event.req.signal },
  });
});
