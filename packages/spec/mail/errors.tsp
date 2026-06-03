import "@typespec/http";
import "../common/main.tsp";

using TypeSpec.Http;
using Citizenry.Common;

// @status draft
namespace Citizenry.Mail;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Mail (P01-S02) error code catalog.
//
// Format: `{LEVEL}-P01-S02-{NNNN}` — LEVEL ∈ {ERR, WARN, INFO}.
// This enum lists ERR codes only (the ones exposed in response bodies).
//
// Bearer JWT failures emit identity (S01) codes because the JWT is
// verified against the identity service. Mail-domain codes (S02) cover
// schema validation, lookup, and outbound provider failures.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Mail (P01-S02) error code catalog (ERR only).
 *
 * @status draft
 */
enum MailErrorCode {
  // ── 0xxx Transport / HTTP ─────────────────────────────
  /** 400 — malformed request body / query (catch-all) */
  bad_request: "ERR-P01-S02-0400",
  /** 401 — service-key missing or invalid on `/_internal/*` routes */
  unauthorized: "ERR-P01-S02-0401",
  /** 404 — mail or mailbox not found (or owned by another account) */
  not_found: "ERR-P01-S02-0404",
  /** 429 — rate limited (reserved) */
  rate_limited: "ERR-P01-S02-0429",
  /** 500 — internal error */
  internal: "ERR-P01-S02-0500",
  /** 503 — backend unavailable */
  unavailable: "ERR-P01-S02-0503",

  // ── 2xxx Schema / input validation ───────────────────
  /** POST /mails — body failed zod validation */
  invalid_body: "ERR-P01-S02-2001",
  /** POST /mails — From address could not be resolved */
  from_required: "ERR-P01-S02-2002",

  // ── 4xxx External dependencies ───────────────────────
  /** Outbound provider (CF Mail / Resend / SES / Google) returned an error */
  send_failed: "ERR-P01-S02-4001",
}
