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

const IPV4_MAPPED = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/;

function hopIp(hop: string | undefined): string | undefined {
  const ip = hop?.trim();
  return ip && isIP(ip) && !ip.includes("%") ? ip : undefined;
}

/**
 * IPv6 visitors are keyed on their /64 in Better Auth's form, since one
 * subscriber can rotate through a whole /64. IPv4-mapped addresses become IPv4.
 */
function visitorKey(ip: string): string {
  if (isIP(ip) === 4) {
    return ip;
  }
  const canonical = new URL(`http://[${ip}]`).hostname.slice(1, -1);
  const mapped = IPV4_MAPPED.exec(canonical);
  if (mapped) {
    const high = Number.parseInt(mapped[1] ?? "", 16);
    const low = Number.parseInt(mapped[2] ?? "", 16);
    return [high >> 8, high & 255, low >> 8, low & 255].join(".");
  }
  const [head = "", tail] = canonical.split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const groups = [
    ...left,
    ...Array<string>(8 - left.length - right.length).fill("0"),
    ...right,
  ];
  return [...groups.slice(0, 4), "0", "0", "0", "0"]
    .map((group) => group.padStart(4, "0"))
    .join(":");
}

/**
 * The visitor for rate limits and Better Auth. Dokploy's Traefik appends its
 * peer as the right-most `x-forwarded-for` hop. When that peer is a Cloudflare
 * edge, the visitor is the hop Cloudflare added just before it; anything
 * further left came from the client. Otherwise the peer is the visitor. A
 * missing or malformed deciding hop yields no visitor.
 */
export function trustedClientIp(request: Request): string | undefined {
  const hops = request.headers.get("x-forwarded-for")?.split(",") ?? [];
  const peer = hopIp(hops.at(-1));
  const visitor =
    peer && cloudflare.check(peer, ipFamily(peer)) ? hopIp(hops.at(-2)) : peer;
  return visitor && visitorKey(visitor);
}
