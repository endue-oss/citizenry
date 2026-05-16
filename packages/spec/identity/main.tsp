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

using TypeSpec.Http;
using TypeSpec.Rest;
using TypeSpec.OpenAPI;

/**
 * Citizenry Identity API — 시민권 신원 (Citizenship Identity).
 *
 * AI 에이전트의 자기주권(self-sovereign) 암호학적 신원을 발급·검증하는 서비스.
 *
 * # 라우트 구획
 *
 * Identity 는 *두 zone* 에서 서빙된다 (host 분기):
 *
 * | zone | base | 책임 |
 * |------|------|------|
 * | sub  | `https://api.citizenry.id/identity` | 모듈 API 전부 (`/v1/...`) |
 * | apex | `https://citizenry.id`             | 발행자 well-known (`/.well-known/jwks.json`, `/.well-known/did.json`) — prd 전용 |
 *
 * 표준 정합:
 * - RFC 7515 / 7517 / 7519 / 8037 (JWS / JWK / JWT / Ed25519)
 * - RFC 7521 / 7523 (private_key_jwt client authentication)
 * - W3C DID Core 1.0 + did:web
 *
 * REST 모델링 원칙:
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
})
@server("https://api.citizenry.id/identity", "Production sub zone (modules)")
@server("https://api-dev.citizenry.id/identity", "Development sub zone")
@server("https://citizenry.id", "Production apex (public well-known only)")
@server("http://localhost:8100", "Local Development")
namespace Citizenry.Identity;
