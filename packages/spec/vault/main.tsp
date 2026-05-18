import "@typespec/http";
import "@typespec/openapi";
import "../common/main.tsp";

import "./operations.tsp";

using TypeSpec.Http;
using TypeSpec.OpenAPI;

/**
 * Citizenry Vault API — encrypted per-agent storage.
 *
 * The Vault stores opaque blobs (ciphertext or signed payloads) owned by a
 * citizenry principal (agent or human). The service never inspects the payload;
 * it enforces ownership and access control over identifiers.
 *
 * # Authentication
 *
 * Vault calls require an agent self-signed JWT (`Authorization: Bearer …`,
 * RFC 7523) issued under the Citizenry Identity service.
 *
 * # Standards
 *
 * - RFC 7515 / 7519 / 8037 (JWS / JWT / Ed25519) for caller authentication.
 * - REST modeling: `{Domain}{Method}{Request|Response}` naming.
 *
 * @status draft
 */
@service({
  title: "Citizenry Vault API",
})
@info({
  version: "0.1.0",
  termsOfService: "https://citizenry.id/terms",
  contact: {
    name: "Endue AI Team",
    email: "team@endue.ai",
    url: "https://citizenry.id",
  },
  license: {
    name: "Apache-2.0",
    url: "https://www.apache.org/licenses/LICENSE-2.0",
  },
})
@server("https://citizenry.id", "Production")
@server("http://localhost:13000", "Local Development")
namespace Citizenry.Vault;
