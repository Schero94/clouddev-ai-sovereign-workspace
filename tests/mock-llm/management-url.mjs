export function resolveManagementUrl(baseUrl, route) {
  let base;
  try {
    base = new URL(baseUrl);
  } catch {
    throw new Error("OmniRoute dashboard base URL is invalid.");
  }
  if (!new Set(["http:", "https:"]).has(base.protocol) || !base.hostname
    || base.username || base.password || base.search || base.hash) {
    throw new Error("OmniRoute dashboard base URL is invalid.");
  }
  base.pathname = `${base.pathname.replace(/\/+$/, "")}/`;

  if (typeof route !== "string" || route.length === 0 || route.includes("\\") || /[\r\n\0]/.test(route)) {
    throw new Error("OmniRoute management route is invalid.");
  }
  const relativeRoute = route.replace(/^\/+/, "");
  const routePath = relativeRoute.split(/[?#]/, 1)[0];
  if (routePath.split("/").some(segment => segment === "." || segment === "..")) {
    throw new Error("OmniRoute management route must stay under the configured base path.");
  }
  if (!routePath.startsWith("api/")) throw new Error("Only OmniRoute management API routes are allowed.");

  const target = new URL(relativeRoute, base);
  if (target.origin !== base.origin || !target.pathname.startsWith(base.pathname)) {
    throw new Error("OmniRoute management route must stay under the configured base path.");
  }
  return target;
}
