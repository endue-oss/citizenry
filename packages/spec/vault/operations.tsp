import "@typespec/http";
import "@typespec/openapi";
import "../common/main.tsp";

using TypeSpec.Http;
using TypeSpec.OpenAPI;
using Citizenry.Common;

// @status draft
namespace Citizenry.Vault;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Vault — agent-owned end-to-end encrypted secret entries
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Encryption model: at-rest end-to-end. The caller encrypts the secret
// client-side as an RFC 7516 JWE, addressed to its own X25519 encryption
// key (`use:"enc"`), and submits the JWE as `data`. The server stores it
// verbatim and never holds the data key — it cannot decrypt. Envelope
// mechanics (random content key, per-recipient key wrapping for
// multi-device / sharing) are handled inside the JWE by a standard JOSE
// library; the server treats `data` as one opaque blob.
//
// Server-side decryption (the "proxy" path) is intentionally NOT a
// stored capability: it is a future request-scoped delegation flow in
// which the live agent re-wraps the content key to a one-time server
// ephemeral key. Nothing here grants the server standing access.

/**
 * Vault entry — base shape shared by create response, read, and list rows.
 *
 * `data` is an RFC 7516 JWE (compact or JSON serialization), encrypted
 * to the owner's X25519 encryption key. The service stores it verbatim
 * and never inspects or decrypts it.
 *
 * @status draft
 */
model VaultEntryBase {
  /** Entry identifier — `ven_` + 26-character ULID. */
  id: vaultEntryId;

  /** Owner principal — agent or human. */
  owner_id: ownerId;

  /**
   * RFC 7516 JWE produced client-side, encrypted to the owner's X25519
   * encryption key. Opaque to the server.
   */
  data: string;

  created_at: iso8601;
}

/**
 * Vault entry list / read response.
 * @status draft
 */
model VaultEntryGetResponse extends VaultEntryBase {}

/**
 * Vault entry create request. The caller has already encrypted the
 * secret client-side as a JWE addressed to its own encryption key(s).
 *
 * @status draft
 */
model VaultEntryCreateRequest {
  /**
   * RFC 7516 JWE to store verbatim. 1–65536 characters; the server never
   * inspects it. An empty body is a 400; a body over the cap is rejected
   * with 413 PayloadTooLargeError.
   */
  @minLength(1)
  @maxLength(65536)
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
   * Possible errors: 401, 404, 429, 500.
   */
  @summary("Read a single vault entry by id")
  @operationId("vault-entry-read")
  @route("{id}")
  @get read(@path id: vaultEntryId):
    | VaultEntryGetResponse
    | UnauthorizedError
    | NotFoundError
    | RateLimitedError
    | InternalError;

  /**
   * Create a new entry.
   *
   * Possible errors: 400, 401, 413, 429, 500.
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
    | PayloadTooLargeError
    | RateLimitedError
    | InternalError;

  /**
   * Delete one of the caller's own entries. Idempotent from the caller's
   * view: a non-owner or unknown id yields 404 (no existence oracle).
   *
   * Possible errors: 401, 404, 429, 500.
   */
  @summary("Delete one of the caller's vault entries")
  @operationId("vault-entry-delete")
  @route("{id}")
  @delete remove(@path id: vaultEntryId):
    | {
        @statusCode statusCode: 204;
      }
    | UnauthorizedError
    | NotFoundError
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
  @delete remove(@path id: vaultEntryId):
    | {
        @statusCode statusCode: 204;
      }
    | UnauthorizedError
    | NotFoundError
    | InternalError;
}
