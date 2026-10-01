import { BlockList, isIP } from "node:net";

// This header is ONLY set by our Node transport boundary, never read directly
// from the browser/proxy. Better Auth normalizes it (including IPv6 /64 buckets).
export const AUTH_CLIENT_IP_HEADER = "x-video-host-client-ip";

export function createTrustedProxyList(cidrs: string[]): BlockList {
  const list = new BlockList();
  for (const cidr of cidrs) {
    const [address, prefix, extra] = cidr.split("/");
    const family = address && !address.includes("%") ? isIP(address) : 0;
    const bits =
      prefix === undefined ? (family === 4 ? 32 : 128) : Number(prefix);
    if (
      !family ||
      extra !== undefined ||
      (prefix !== undefined && !/^\d+$/.test(prefix)) ||
      !Number.isInteger(bits) ||
      bits <= 0 ||
      bits > (family === 4 ? 32 : 128)
    ) {
      throw new Error(
        "AUTH_TRUSTED_PROXY_CIDRS must contain explicit IPs or nonzero CIDRs",
      );
    }
    if (family === 6) {
      // Configure native IPv4 ranges, not mapped aliases whose /96 is IPv4 /0.
      const canonical = new URL(`http://[${address}]/`).hostname;
      const range = new BlockList();
      range.addSubnet(address, bits, "ipv6");
      if (
        canonical.startsWith("[::ffff:") ||
        (range.check("::ffff:0.0.0.0", "ipv6") &&
          range.check("::ffff:255.255.255.255", "ipv6"))
      )
        throw new Error(
          "Use native IPv4 proxy CIDRs; do not trust all IPv4 via IPv6",
        );
    }
    list.addSubnet(address, bits, family === 4 ? "ipv4" : "ipv6");
  }
  return list;
}

export function resolveClientIp(
  peer: string | undefined,
  forwardedFor: string | null,
  trusted: BlockList,
): string {
  if (!peer || peer.includes("%") || !isIP(peer)) {
    throw new Error("Transport peer IP is unavailable");
  }
  const isTrusted = (ip: string) =>
    trusted.check(ip, isIP(ip) === 4 ? "ipv4" : "ipv6");
  // Public/direct callers cannot select their own rate-limit bucket.
  if (!isTrusted(peer)) return peer;
  if (!forwardedFor || forwardedFor.length > 4096) {
    throw new Error("Trusted proxy must supply a bounded forwarding chain");
  }
  const chain = forwardedFor.split(",");
  if (chain.length > 32) throw new Error("Too many forwarding hops");
  let current = peer;
  for (let i = chain.length - 1; i >= 0 && isTrusted(current); i--) {
    const hop = chain[i].trim();
    if (!hop || hop.includes("%") || !isIP(hop)) {
      throw new Error("Invalid forwarding hop");
    }
    current = hop;
  }
  if (isTrusted(current)) {
    throw new Error(
      "Forwarding chain has no client outside the trusted proxies",
    );
  }
  // Attacker-controlled prefixes to the left of the first untrusted hop are
  // deliberately ignored, even if they claim to be another trusted proxy.
  return current;
}

export function requestWithClientIp(
  request: Request,
  peer: string | undefined,
  trusted: BlockList,
): Request {
  const ip = resolveClientIp(
    peer,
    request.headers.get("x-forwarded-for"),
    trusted,
  );
  const headers = new Headers(request.headers);
  for (const name of [
    "forwarded",
    "x-forwarded-for",
    "x-real-ip",
    AUTH_CLIENT_IP_HEADER,
  ]) {
    headers.delete(name);
  }
  headers.set(AUTH_CLIENT_IP_HEADER, ip);
  return new Request(request, { headers });
}
