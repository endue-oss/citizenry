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
 * Human admin row.
 * @status draft
 */
model HumanAdminGetResponse {
  id: humanId;
  email: string;
  display_name?: string;
  status: "pending_verification" | "active" | "revoked";
  created_at: iso8601;
  updated_at: iso8601;
}

/**
 * Human admin list / detail.
 *
 * Public lookup-by-email moved here from `/v1/humans?email=…` so the
 * email enumeration oracle stays behind the operator PSK.
 *
 * @status draft
 */
@tag("Admin")
@route("/v1/admin/humans")
@useAuth(ServiceKeyAuth)
interface AdminHumans {
  /**
   * Paginated list, optionally filtered by exact email match.
   *
   * Possible errors: 401, 500.
   */
  @summary("List humans (admin, paginated, optional email filter)")
  @operationId("admin-human-list")
  @get list(
    @query email?: string,
    @query status?: "pending_verification" | "active" | "revoked",
    ...PaginationParams,
  ): PaginatedList<HumanAdminGetResponse> | UnauthorizedError | InternalError;

  /**
   * Possible errors: 401, 404, 500.
   */
  @summary("Read a human (admin)")
  @operationId("admin-human-read")
  @get read(@path id: humanId):
    | HumanAdminGetResponse
    | UnauthorizedError
    | NotFoundError
    | InternalError;
}

/**
 * Agent admin row.
 * @status confirmed
 */
model AgentAdminGetResponse {
  id: agentId;
  slug: slug;
  display_name?: string;
  status: AgentStatus;
  tenant: tenantSlug;
  did: did;
  owner_human_principal_id: humanId;
  metadata?: Record<unknown>;

  /** Currently active key. Undefined for revoked agents. */
  active_kid?: kid;

  created_at: iso8601;
  updated_at: iso8601;
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
    @query tenant?: tenantSlug,
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

/**
 * Audit log row. Append-only record of a state-changing admin action.
 * @status draft
 */
model AuditLogGetResponse {
  id: string;
  /** Acting admin id (from the X-Admin-Id breadcrumb); null for system events. */
  actor?: string;
  /** Stable action label, e.g. `config.set`, `agent.revoke`. */
  action: string;
  /** Affected entity id / config key, when applicable. */
  target?: string;
  outcome: "success" | "failure";
  /** Non-secret context (method, path, status). Never contains secret values. */
  payload?: unknown;
  created_at: iso8601;
}

/**
 * Audit log — operator read of admin mutations.
 * @status draft
 */
@tag("Admin")
@route("/v1/admin/audit-log")
interface AdminAuditLog {
  /**
   * Paginated audit trail, newest first. Optional exact-match filters on
   * actor / action / target.
   */
  @summary("List audit-log entries (admin)")
  @operationId("admin-audit-log-list")
  @get list(
    @query actor?: string,
    @query action?: string,
    @query target?: string,
    ...PaginationParams,
  ): PaginatedList<AuditLogGetResponse> | UnauthorizedError | InternalError;
}
