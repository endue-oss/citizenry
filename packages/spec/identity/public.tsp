import "@typespec/http";
import "../common/main.tsp";

using TypeSpec.Http;
using Citizenry.Common;

// @status draft
namespace Citizenry.Identity;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Public — 무인증, 캐시 가능 (정적 + CDN)
// 99% 트래픽 흡수가 가용성 SLA 의 핵심.
// 권장 헤더: `Cache-Control: public, max-age=300, stale-while-revalidate=86400`
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Issuer JWK Set — citizenry-id 인스턴스 자체의 모든 활성/회전 키.
 *
 * @status confirmed
 */
@tag("Public")
@route("/.well-known/jwks.json")
interface IssuerJwks {
  /** 가능한 에러: 500, 503 */
  @get read(): JwkSet | InternalError | ServiceUnavailableError;
}

/**
 * Issuer DID Document — `did:web:citizenry.id`.
 * @status confirmed
 */
@tag("Public")
@route("/.well-known/did.json")
interface IssuerDid {
  /** 가능한 에러: 500, 503 */
  @get read(): DidDocument | InternalError | ServiceUnavailableError;
}

/**
 * Per-agent JWK Set — 단일 에이전트의 활성/회전 키.
 *
 * RP 가 특정 에이전트만 검증하고 싶을 때 (issuer JWKS 보다 좁음).
 *
 * @status confirmed
 */
@tag("Public")
@route("/agent/{id}/jwks.json")
interface AgentJwks {
  /** 가능한 에러: 404 (agent_not_found), 500 */
  @get read(@path id: agentId): JwkSet | NotFoundError | InternalError;
}

/**
 * Per-agent DID Document — `did:web:citizenry.id:agent:{id}`.
 *
 * `verificationMethod` 에는 활성 키만 포함.
 *
 * @status confirmed
 */
@tag("Public")
@route("/agent/{id}/did.json")
interface AgentDid {
  /** 가능한 에러: 404 (agent_not_found / no active key), 500 */
  @get read(@path id: agentId): DidDocument | NotFoundError | InternalError;
}
