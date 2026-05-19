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
 * Auth: `Authorization: Bearer <self-signed agent JWT>` (RFC 7523).
 *
 * @status draft
 */
@tag("Vault")
@route("/vault/entries")
@useAuth(AgentJwtAuth)
interface Entries {
  /**
   * Entries owned by the caller (agent).
   *
   * Possible errors: 401 (jwt invalid), 429, 500.
   */
  @summary("List the caller's vault entries (paginated)")
  @operationId("vault-entry-list")
  @get list(...PaginationParams):
    | PaginatedList<VaultEntryGetResponse>
    | UnauthorizedError
    | RateLimitedError
    | InternalError;

  /**
   * Read a single entry. Returns 404 when a non-owner reads.
   *
   * Possible errors: 401, 404, 500.
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
   * Create a new entry.
   *
   * Possible errors: 400, 401, 422, 429, 500.
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
 * Called by an admin or operator. Every request requires the `X-Service-Key` header.
 *
 * @status draft
 */
@tag("Vault Admin")
@route("/v1/admin/vault/entries")
@useAuth(ServiceKeyAuth)
interface AdminEntries {
  /**
   * Entries across every owner.
   *
   * Possible errors: 401 (psk_invalid), 500.
   */
  @summary("List all vault entries across owners (admin)")
  @operationId("admin-vault-entry-list")
  @get list(
    @query owner_id?: ownerId,
    ...PaginationParams,
  ): PaginatedList<VaultEntryAdminGetResponse> | UnauthorizedError | InternalError;

  /**
   * Operator-forced delete. Idempotent.
   *
   * Possible errors: 401 (psk_invalid), 404 (not_found), 500.
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
