// Where each part of Kyzen Network lives. Production serves three hosts from
// one server: kyzen.network (website), docs.kyzen.network (documentation) and
// app.kyzen.network (the app). Builds without NEXT_PUBLIC_SPLIT_HOSTS=1
// (development and local tests) serve all three from one origin under /,
// /docs and /app. next.config.ts maps each host onto its routes; every link
// between the three parts is built here.

export const splitHosts = process.env.NEXT_PUBLIC_SPLIT_HOSTS === "1";

export const HOSTS = { site: "kyzen.network", docs: "docs.kyzen.network", app: "app.kyzen.network" } as const;

/** A raw Host header value, normalized for comparison: lowercase, and a trailing dot (a
 * root-zone separator some clients still send) trimmed. The Host header is case-insensitive
 * (RFC 9110 4.2.3) and Next's `has: host` rewrite matcher already treats it that way, so any
 * code that compares a Host header itself must normalize first, or a request like
 * "Host: APP.kyzen.network" reads as a different, unrecognized host here while every rewrite
 * in next.config.ts still matches it as the app. */
export function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/\.$/, "");
}

/** Whether a raw Host header (as received on the wire, with any port) names the app host. */
export function isAppHost(hostHeader: string | null | undefined): boolean {
  return normalizeHost((hostHeader ?? "").split(":")[0]) === HOSTS.app;
}

const origin = (host: string) => (splitHosts ? `https://${host}` : "");

/** Path of a documentation page on the docs host; "" is the index. Accepts "slug#anchor". */
export const docsPath = (slug = "") => (splitHosts ? `/${slug}` : slug ? `/docs/${slug}` : "/docs");

/** Link to a documentation page from the website or the app. */
export const docsHref = (slug = "") => origin(HOSTS.docs) + docsPath(slug);

/** Link into the app, optionally to one of its views (stake, redeem, gateway, markets). */
export const appHref = (view?: string) => (splitHosts ? `https://${HOSTS.app}/` : "/app") + (view ? `#${view}` : "");

/** Link to a website page from the docs or the app. */
export const siteHref = (path = "/") => origin(HOSTS.site) + path;

/** Absolute URL for metadata and the sitemap. */
export const absolute = (href: string) => (href.startsWith("http") ? href : `https://${HOSTS.site}${href}`);
