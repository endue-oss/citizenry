import "@typespec/http";
import "../common/main.tsp";

using TypeSpec.Http;
using Citizenry.Common;

// @status draft
namespace Citizenry.Identity;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Admin — 운영자 read + 강제 revoke (admin BFF 가 호출)
// 모든 요청에 `X-Service-Key` 필요.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 에이전트 admin row.
 * @status confirmed
 */
model AgentAdminGetResponse {
  id: agentId;
  slug: slug;
  display_name?: string;
  status: AgentStatus;
  tenant: Tenant;
  did: did;
  owner_human_principal_id: humanId;
  metadata?: Record<unknown>;

  /** 현재 활성 키. revoked 에이전트면 undefined. */
  active_kid?: kid;

  created_at: iso8601;
  updated_at: iso8601;
}

/**
 * Enrollment admin 목록 / 상세는 EnrollmentGetResponse 재사용.
 *
 * @status confirmed
 */
@tag("Admin")
@route("/api/v1/admin/enrollments")
interface AdminEnrollments {
  /**
   * 가능한 에러: 401 (psk_invalid), 500
   */
  @get list(
    @header("X-Service-Key") serviceKey: serviceKey,
    @query tenant?: Tenant,
    @query owner_human_principal_id?: humanId,
    ...PaginationParams,
  ): PaginatedList<EnrollmentGetResponse> | UnauthorizedError | InternalError;
}

/**
 * 에이전트 admin 목록 / 상세 / 강제 폐기.
 *
 * @status confirmed
 */
@tag("Admin")
@route("/api/v1/admin/agents")
interface AdminAgents {
  /**
   * 가능한 에러: 401 (psk_invalid), 500
   */
  @get list(
    @header("X-Service-Key") serviceKey: serviceKey,
    @query status?: AgentStatus,
    @query tenant?: Tenant,
    @query owner_human_principal_id?: humanId,
    ...PaginationParams,
  ): PaginatedList<AgentAdminGetResponse> | UnauthorizedError | InternalError;

  /**
   * 가능한 에러: 401 (psk_invalid), 404 (agent_not_found), 500
   */
  @get read(
    @header("X-Service-Key") serviceKey: serviceKey,
    @path id: agentId,
  ): AgentAdminGetResponse | UnauthorizedError | NotFoundError | InternalError;

  /**
   * 운영자 강제 폐기. 멱등. 즉시 발효 — 모든 키 `revoked`.
   *
   * 자가 폐기와 다른 점:
   * - 본인 서명 불필요 (운영자 권한)
   * - audit log 에 actor_type='operator' 기록
   *
   * 가능한 에러: 401 (psk_invalid), 404 (agent_not_found), 500
   */
  @delete revoke(
    @header("X-Service-Key") serviceKey: serviceKey,
    @path id: agentId,
  ): {
    @statusCode statusCode: 204;
  } | UnauthorizedError | NotFoundError | InternalError;
}
