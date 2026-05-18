import "@typespec/http";
import "@typespec/openapi";
import "../common/main.tsp";

import "./operations.tsp";

using TypeSpec.Http;
using TypeSpec.OpenAPI;

/**
 * Citizenry Mail API — per-agent mailbox storage and outbound send.
 *
 * Each agent owns one mail account (`account_id == agent.principal_id`).
 * The service stores parsed inbound messages delivered by the Cloudflare
 * Email Workers handler and accepts outbound messages submitted via
 * `POST /mails`. Mailbox shape follows JMAP well-known roles (RFC 8621
 * §2): `inbox`, `sent`, `drafts`, `archive`, `trash`, `junk`. Custom
 * mailboxes have `role = null`.
 *
 * The Cloudflare Email Workers `email()` handler is *not* part of this
 * REST surface and is not modeled here.
 *
 * # Authentication
 *
 * - **Public** routes (`/_health`, `/.well-known/mail-api`) — no auth.
 * - **Agent** routes (`/mailboxes`, `/mails*`) — Bearer self-signed
 *   JWT (RFC 7523). The `aud` claim must match one of the audiences
 *   advertised at `/.well-known/mail-api`.
 *
 * # Standards
 *
 * - RFC 5322 (Internet Message Format) — Message-ID, In-Reply-To,
 *   References, address structure.
 * - RFC 7515 / 7519 / 8037 (JWS / JWT / Ed25519) for caller auth.
 * - RFC 8621 (JMAP for Mail) — mailbox role taxonomy.
 *
 * # REST modeling
 *
 * - Method and Request/Response are kept separate.
 * - Model naming: `{Domain}{Method}{Request|Response}`.
 * - Methods are restricted to `Create`, `Get`, `Update`, `Delete`.
 *
 * @status draft
 */
@service({
  title: "Citizenry Mail API",
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
@server("https://mail.citizenry.id", "Production")
@server("http://localhost:13004", "Local Development")
namespace Citizenry.Mail;
