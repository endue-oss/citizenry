export type Bindings = {
  /** api's base URL — proxy target for admin-api's /_admin/* requests. */
  API_BASE_URL: string

  /** Service PSK — the X-Service-Key value admin-api sends to api. Must match api's SECRET_KEY. */
  SERVICE_KEY: string
}
