import "@typespec/http";
import "../common/main.tsp";

using TypeSpec.Http;
using Citizenry.Common;

// @status draft
namespace Citizenry.Vault;

/**
 * Vault entry — placeholder model.
 * @status draft
 */
model VaultEntry {
  id: ulid;
  owner_id: ownerId;
  data: string;
  created_at: iso8601;
}

/**
 * Vault entry create request.
 * @status draft
 */
model VaultEntryCreateRequest {
  data: string;
}

@tag("Vault")
@route("/vault/entries")
interface Entries {
  @get list(): VaultEntry[] | InternalError;

  @route("{id}")
  @get read(@path id: ulid): VaultEntry | NotFoundError | InternalError;

  @post create(@body body: VaultEntryCreateRequest): {
    @statusCode statusCode: 201;
    @body body: VaultEntry;
  } | BadRequestError | InternalError;
}
