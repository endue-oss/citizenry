import "@typespec/http";
import "@typespec/openapi";
import "../common/main.tsp";

import "./operations.tsp";

using TypeSpec.Http;
using TypeSpec.OpenAPI;

/**
 * Citizenry Vault API — placeholder.
 *
 * @status draft
 */
@service({
  title: "Citizenry Vault API",
})
@info({
  version: "0.1.0",
})
@server("http://localhost:8800/vault", "Local Development")
namespace Citizenry.Vault;
