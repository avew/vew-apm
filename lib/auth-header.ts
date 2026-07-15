export interface MonitorAuth {
  authType: string | null; // "none" | "basic" | "header" | "bearer"
  authUsername: string | null;
  authHeaderName: string | null;
  authHeaderValue: string | null; // secret: header value / bearer token / basic password
}

/**
 * Build the request auth header(s) a monitor sends with each check.
 * - header: `<name>: <value>`
 * - basic:  `Authorization: Basic base64(user:pass)`
 * - bearer: `Authorization: Bearer <token>`
 * - none / incomplete config: no headers.
 */
export function buildAuthHeaders(a: MonitorAuth): Record<string, string> {
  const secret = a.authHeaderValue ?? "";
  switch (a.authType) {
    case "header":
      return a.authHeaderName && secret ? { [a.authHeaderName]: secret } : {};
    case "basic": {
      const user = a.authUsername ?? "";
      if (!user && !secret) return {};
      const token = Buffer.from(`${user}:${secret}`).toString("base64");
      return { Authorization: `Basic ${token}` };
    }
    case "bearer":
      return secret ? { Authorization: `Bearer ${secret}` } : {};
    default:
      return {};
  }
}
