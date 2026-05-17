export type Bindings = {
  /** Service binding to the api worker. Routes admin-api → api inside
   *  Cloudflare's network — required because workers.dev disallows
   *  sibling fetch via public URLs (returns CF 1042). */
  API: Fetcher

  /** Optional path-builder hint. Production deploys leave it unset; the
   *  service binding ignores the URL host anyway, so only the path
   *  matters when constructing upstream requests. */
  API_BASE_URL?: string

  /** Service PSK — the X-Service-Key value admin-api sends to api. Must match api's SECRET_KEY. */
  SERVICE_KEY: string
}
