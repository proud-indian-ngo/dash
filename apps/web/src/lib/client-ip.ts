import { BlockList, isIP } from "node:net";

/**
 * Cloudflare's published ranges (cloudflare.com/ips, checked 24 Oct 2026).
 * Traefik's `forwardedHeaders.trustedIPs` must list the same ranges.
 */
const CLOUDFLARE_RANGES = [
  "173.245.48.0/20",
  "103.21.244.0/22",
  "103.22.200.0/22",
  "103.31.4.0/22",
  "141.101.64.0/18",
  "108.162.192.0/18",
  "190.93.240.0/20",
  "188.114.96.0/20",
  "197.234.240.0/22",
  "198.41.128.0/17",
  "162.158.0.0/15",
  "104.16.0.0/13",
  "104.24.0.0/14",
  "172.64.0.0/13",
  "131.0.72.0/22",
  "2400:cb00::/32",
  "2606:4700::/32",
  "2803:f800::/32",
  "2405:b500::/32",
  "2405:8100::/32",
  "2a06:98c0::/29",
  "2c0f:f248::/32",
];

const ipFamily = (ip: string) => (isIP(ip) === 6 ? "ipv6" : "ipv4");

const cloudflare = new BlockList();
for (const range of CLOUDFLARE_RANGES) {
  const [address, prefix] = range.split("/") as [string, string];
  cloudflare.addSubnet(address, Number(prefix), ipFamily(address));
}

function hopIp(hop: string | undefined): string | undefined {
  const ip = hop?.trim();
  return ip && isIP(ip) ? ip : undefined;
}

/**
 * The visitor's IP for rate limits and Better Auth. Dokploy's Traefik appends
 * its peer as the right-most `x-forwarded-for` hop. When that peer is a
 * Cloudflare edge, the visitor is the hop Cloudflare added just before it;
 * anything further left came from the client. Otherwise the peer is the
 * visitor. A missing or malformed deciding hop yields no IP.
 */
export function trustedClientIp(request: Request): string | undefined {
  const hops = request.headers.get("x-forwarded-for")?.split(",") ?? [];
  const peer = hopIp(hops.at(-1));
  if (!(peer && cloudflare.check(peer, ipFamily(peer)))) {
    return peer;
  }
  return hopIp(hops.at(-2));
}
