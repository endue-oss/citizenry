import "@typespec/http";
import "@typespec/rest";
import "@typespec/openapi";
import "../common/main.tsp";

import "./errors.tsp";
import "./enrollment.tsp";
import "./register.tsp";
import "./me.tsp";
import "./public.tsp";
import "./admin.tsp";
import "./federation.tsp";

using TypeSpec.Http;
using TypeSpec.Rest;
using TypeSpec.OpenAPI;

/**
 * Citizenry Identity API — self-sovereign cryptographic identity for AI agents.
 *
 * The Identity service issues, verifies, and revokes Ed25519-backed citizenship
 * credentials for AI agents under the `did:web:citizenry.id` issuer.
 *
 * # Audiences
 *
 * Identity 는 *두 zone* 에서 서빙된다 (host 분기):
 *
 * | zone | base | 책임 |
 * |------|------|------|
 * | sub  | `https://api.citizenry.id/identity` | 모듈 API 전부 (`/v1/...`) |
 * | apex | `https://citizenry.id`             | 발행자 well-known (`/.well-known/jwks.json`, `/.well-known/did.json`) — prd 전용 |
 *
 * # Authentication
 *
 * - **Public** routes (`/.well-known/*`, `/agent/{id}/*`) — no auth, cacheable.
 * - **Agent** self-service (`/api/v1/agent/me*`) — `Authorization: Bearer <self-signed JWT>` (RFC 7523).
 * - **Register** (`/api/v1/agent/register`) — `Authorization: Bearer eret_<enrollment token>`.
 * - **Admin** (`/api/v1/enrollments*`, `/api/v1/admin/*`) — `X-Service-Key` (PSK).
 *
 * # Standards
 *
 * - RFC 7515 / 7517 / 7518 / 7519 / 8037 (JWS / JWK / JWA / JWT / Ed25519)
 * - RFC 7521 / 7523 (private_key_jwt client authentication)
 * - W3C DID Core 1.0 + did:web
 *
 * # REST modeling
 *
 * - Method 와 Request/Response 분리.
 * - 모델 네이밍: `{Domain}{Method}{Request|Response}`.
 * - Method 는 `Create`, `Get`, `Update`, `Delete` 만.
 *
 * @status draft
 */
@service({
  title: "Citizenry Identity API",
})
@info({
  version: "0.1.0",
  termsOfService: "https://citizenry.id/terms",
  contact: {
    name: "EndueAI Team",
    email: "team@endue.ai",
    url: "https://citizenry.id",
  },
  license: {
    name: "Apache-2.0",
    url: "https://www.apache.org/licenses/LICENSE-2.0",
  },
})
@server("https://api.citizenry.id/identity", "Production sub zone (modules)")
@server("https://api-dev.citizenry.id/identity", "Development sub zone")
@server("https://citizenry.id", "Production apex (public well-known only)")
@server("http://localhost:13000", "Local Development")
namespace Citizenry.Identity;
