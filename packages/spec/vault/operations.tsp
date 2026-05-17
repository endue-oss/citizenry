import "@typespec/http";
import "@typespec/openapi";
import "../common/main.tsp";

using TypeSpec.Http;
using TypeSpec.OpenAPI;
using Citizenry.Common;

// @status draft
namespace Citizenry.Vault;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Vault — agent-owned encrypted secret entries
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Vault entry — base shape shared by create response, read, and list rows.
 *
 * `data` is opaque ciphertext; the service stores it as-is and never inspects it.
 *
 * @status draft
 */
model VaultEntryBase {
  /** Entry identifier — `ven_` prefixed ULID once finalized. */
  id: ulid;

  /** Owner principal — agent or human. */
  owner_id: ownerId;

  /** Opaque payload (ciphertext or signed blob). */
  data: string;

  created_at: iso8601;
}

/**
 * Vault entry list / read response.
 * @status draft
 */
model VaultEntryGetResponse extends VaultEntryBase {}

/**
 * Vault entry create request.
 * @status draft
 */
model VaultEntryCreateRequest {
  /** Opaque payload the caller wants stored. */
  data: string;
}

/**
 * Vault entry create response.
 * @status draft
 */
model VaultEntryCreateResponse extends VaultEntryBase {}

/**
 * Agent-scoped Vault routes.
 *
 * 인증: `Authorization: Bearer <self-signed agent JWT>` (RFC 7523).
 *
 * @status draft
 */
@tag("Vault")
@route("/vault/entries")
@useAuth(AgentJwtAuth)
interface Entries {
  /**
   * 호출자(에이전트) 소유의 entry 목록.
   *
   * 가능한 에러: 401 (jwt invalid), 429, 500
   */
  @summary("List the caller's vault entries (paginated)")
  @operationId("vault-entry-list")
  @get list(...PaginationParams):
    | PaginatedList<VaultEntryGetResponse>
    | UnauthorizedError
    | RateLimitedError
    | InternalError;

  /**
   * 단일 entry 조회. 비-소유자가 조회 시 404.
   *
   * 가능한 에러: 401, 404, 500
   */
  @summary("Read a single vault entry by id")
  @operationId("vault-entry-read")
  @route("{id}")
  @get read(@path id: ulid):
    | VaultEntryGetResponse
    | UnauthorizedError
    | NotFoundError
    | InternalError;

  /**
   * 신규 entry 생성.
   *
   * 가능한 에러: 400, 401, 422, 429, 500
   */
  @summary("Create a vault entry under the caller")
  @operationId("vault-entry-create")
  @post create(@body body: VaultEntryCreateRequest):
    | {
        @statusCode statusCode: 201;
        @body body: VaultEntryCreateResponse;
      }
    | BadRequestError
    | UnauthorizedError
    | UnprocessableError
    | RateLimitedError
    | InternalError;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Admin — operator / admin-BFF, behind `X-Service-Key`
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Vault admin row — identical to the user-facing model for now.
 * @status draft
 */
model VaultEntryAdminGetResponse extends VaultEntryBase {}

/**
 * Admin / 운영자 호출. 모든 요청에 `X-Service-Key` 헤더 필요.
 *
 * @status draft
 */
@tag("Vault Admin")
@route("/api/v1/admin/vault/entries")
@useAuth(ServiceKeyAuth)
interface AdminEntries {
  /**
   * 모든 owner 의 entry 목록.
   *
   * 가능한 에러: 401 (psk_invalid), 500
   */
  @summary("List all vault entries across owners (admin)")
  @operationId("admin-vault-entry-list")
  @get list(
    @query owner_id?: ownerId,
    ...PaginationParams,
  ): PaginatedList<VaultEntryAdminGetResponse> | UnauthorizedError | InternalError;

  /**
   * 운영자 강제 삭제. 멱등.
   *
   * 가능한 에러: 401 (psk_invalid), 404 (not_found), 500
   */
  @summary("Force-delete a vault entry (admin, idempotent)")
  @operationId("admin-vault-entry-delete")
  @route("{id}")
  @delete remove(@path id: ulid):
    | {
        @statusCode statusCode: 204;
      }
    | UnauthorizedError
    | NotFoundError
    | InternalError;
}
