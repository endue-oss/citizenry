import "@typespec/http";
import "@typespec/openapi";
import "../common/main.tsp";

using TypeSpec.Http;
using TypeSpec.OpenAPI;
using Citizenry.Common;

// @status draft
namespace Citizenry.Identity;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Admin — operator read + force-revoke (called by the admin BFF).
// Every request requires `X-Service-Key`.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Agent admin row.
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

  /** Currently active key. Undefined for revoked agents. */
  active_kid?: kid;

  created_at: iso8601;
  updated_at: iso8601;
}

/**
 * Enrollment admin list / detail reuses EnrollmentGetResponse.
 *
 * @status confirmed
 */
@tag("Admin")
@route("/v1/admin/enrollments")
@useAuth(ServiceKeyAuth)
interface AdminEnrollments {
  /**
   * Possible errors: 401 (psk_invalid), 500.
   */
  @summary("List enrollments (admin, paginated)")
  @operationId("admin-enrollment-list")
  @get list(
    @query tenant?: Tenant,
    @query owner_human_principal_id?: humanId,
    ...PaginationParams,
  ): PaginatedList<EnrollmentGetResponse> | UnauthorizedError | InternalError;
}

/**
 * Agent admin list / detail / force-revoke.
 *
 * @status confirmed
 */
@tag("Admin")
@route("/v1/admin/agents")
@useAuth(ServiceKeyAuth)
interface AdminAgents {
  /**
   * Possible errors: 401 (psk_invalid), 500.
   */
  @summary("List agents (admin, paginated, filterable)")
  @operationId("admin-agent-list")
  @get list(
    @query status?: AgentStatus,
    @query tenant?: Tenant,
    @query owner_human_principal_id?: humanId,
    ...PaginationParams,
  ): PaginatedList<AgentAdminGetResponse> | UnauthorizedError | InternalError;

  /**
   * Possible errors: 401 (psk_invalid), 404 (agent_not_found), 500.
   */
  @summary("Read an agent (admin)")
  @operationId("admin-agent-read")
  @get read(@path id: agentId):
    | AgentAdminGetResponse
    | UnauthorizedError
    | NotFoundError
    | InternalError;

  /**
   * Operator-forced revoke. Idempotent. Takes effect immediately — all keys `revoked`.
   *
   * Differences from self-revoke:
   * - No self-signature required (operator authority).
   * - Audit log records actor_type='operator'.
   *
   * Possible errors: 401 (psk_invalid), 404 (agent_not_found), 500.
   */
  @summary("Operator-force revoke an agent (idempotent)")
  @operationId("admin-agent-revoke")
  @delete revoke(@path id: agentId):
    | {
        @statusCode statusCode: 204;
      }
    | UnauthorizedError
    | NotFoundError
    | InternalError;
}
