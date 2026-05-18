import "@typespec/http";
import "@typespec/openapi";
import "../common/main.tsp";

using TypeSpec.Http;
using TypeSpec.OpenAPI;
using Citizenry.Common;

// @status draft
namespace Citizenry.Mail;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Identifier scalars (prefix + 26-char Crockford ULID)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Mailbox ID — `mb_` + 26-character ULID.
 * @status draft
 */
@pattern("^mb_[0-9A-HJKMNP-TV-Z]{26}$")
scalar mailboxId extends string;

/**
 * Mail ID — `mai_` + 26-character ULID.
 * @status draft
 */
@pattern("^mai_[0-9A-HJKMNP-TV-Z]{26}$")
scalar mailId extends string;

/**
 * Mail attachment ID — `att_` + 26-character ULID.
 * @status draft
 */
@pattern("^att_[0-9A-HJKMNP-TV-Z]{26}$")
scalar mailAttachmentId extends string;

/**
 * Thread ID — `thr_` + 26-character ULID. Buckets related mails for
 * an account. v1 mints a fresh thread on every inbound message;
 * client-side grouping by this id is stable for messages the client
 * has already received.
 * @status draft
 */
@pattern("^thr_[0-9A-HJKMNP-TV-Z]{26}$")
scalar threadId extends string;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Enums
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * JMAP well-known mailbox roles (RFC 8621 §2). Custom mailboxes have
 * `role = null`.
 * @status draft
 */
enum MailboxRole {
  inbox,
  sent,
  drafts,
  archive,
  trash,
  junk,
}

/**
 * Message direction. `inbound` rows arrive via the Cloudflare Email
 * Workers handler; `outbound` rows are created by `POST /mails`.
 * @status draft
 */
enum MailDirection {
  inbound,
  outbound,
}

/**
 * Delivery state. `received` applies to inbound messages; outbound
 * rows progress `queued → sent` (or `failed`).
 * @status draft
 */
enum MailDeliveryStatus {
  received,
  queued,
  sent,
  failed,
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Shared value types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * A single mail address. `name` is the optional display-name part of
 * an RFC 5322 mailbox (e.g. the `Alice` in `Alice <alice@example>`).
 * @status draft
 */
model MailAddress {
  /** Display name. */
  @maxLength(255)
  name?: string;

  /** Address part — RFC 5322 addr-spec. */
  mail: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Mailbox models
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Mailbox — named folder owned by an agent.
 * @status draft
 */
model MailboxGetResponse {
  mailbox_id: mailboxId;

  /** Owning agent (`agent.principal_id`). */
  account_id: agentId;

  /** Display name. Defaults match the JMAP role (e.g. `Inbox`). */
  name: string;

  /** Well-known role; `null` for custom mailboxes. */
  role: MailboxRole | null;

  total_mails: int32;
  unread_mails: int32;

  created_at: iso8601;
}

/**
 * Response shape for `GET /mailboxes`. Always envelopes a single
 * `mailboxes` array — the endpoint also lazily provisions the default
 * set (`inbox`, `sent`, `drafts`, `archive`, `trash`) on first call.
 * @status draft
 */
model MailboxesGetResponse {
  mailboxes: MailboxGetResponse[];
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Mail models
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Fields shared between list rows and full reads. Bodies (`body_text`,
 * `body_html`) are present only on the detail response.
 * @status draft
 */
model MailBase {
  mail_id: mailId;
  account_id: agentId;
  mailbox_id: mailboxId;

  thread_id: threadId;

  /** RFC 5322 Message-ID. May be absent on malformed inbound mail. */
  message_id?: string | null;
  in_reply_to?: string | null;

  /**
   * JSON array of Message-IDs collected from `References` and
   * `In-Reply-To` headers. Serialized as a JSON string in storage and
   * returned to the client verbatim.
   */
  refs: string;

  subject?: string | null;

  /** First ~256 characters of the body for list views. */
  preview?: string | null;

  /** RFC 5322 addr-spec of the sender. */
  from_addr?: string | null;

  /** JSON array of `MailAddress` (string-encoded). */
  to_addrs: string;
  cc_addrs: string;
  bcc_addrs: string;
  reply_to_addrs: string;

  /** JMAP-style keyword set — JSON object, e.g. `{"$seen":true}`. */
  keywords: string;

  /** Approximate message size in bytes. */
  size: int32;

  /** 1 when one or more attachments are present, else 0. */
  has_attachment: int32;

  /** Server-side receive timestamp (inbound) or send timestamp (outbound). */
  received_at: iso8601;

  /** Original Date header for inbound; equals `received_at` for outbound. */
  sent_at?: iso8601 | null;

  direction: MailDirection;
  delivery_status: MailDeliveryStatus;

  /** Failure reason when `delivery_status = "failed"`. */
  delivery_error?: string | null;

  /** Outbound provider message id (e.g. Resend, SES). */
  provider_message_id?: string | null;

  created_at: iso8601;
}

/**
 * List-row shape returned by `GET /mails`. Body fields are omitted —
 * fetch `GET /mails/{id}` for the full message.
 * @status draft
 */
model MailListItem extends MailBase {}

/**
 * Full mail detail returned by `GET /mails/{id}` and `POST /mails`.
 * @status draft
 */
model MailGetResponse extends MailBase {
  body_text?: string | null;
  body_html?: string | null;
}

/**
 * Response shape for `GET /mails`. `next_before` is the receive
 * timestamp (ms since epoch) of the last item, suitable for use as
 * the `before` cursor in the next page; `null` when the page is empty.
 * @status draft
 */
model MailsGetResponse {
  mails: MailListItem[];
  next_before: int64 | null;
}

/**
 * Response wrapper for `GET /mails/{id}`.
 * @status draft
 */
model MailGetWrappedResponse {
  mail: MailGetResponse;
}

/**
 * Outbound send request (`POST /mails`).
 *
 * When `from` is omitted, the server substitutes `<account_id>@<MAIL_DOMAIN>`.
 *
 * @status draft
 */
model MailCreateRequest {
  from?: MailAddress;

  @minItems(1)
  @maxItems(50)
  to: MailAddress[];

  @maxItems(50)
  cc?: MailAddress[];

  @maxItems(50)
  bcc?: MailAddress[];

  @maxItems(10)
  reply_to?: MailAddress[];

  @minLength(1)
  @maxLength(998)
  subject: string;

  text?: string;
  html?: string;
}

/**
 * Response shape for `POST /mails`. The persisted row is returned with
 * `delivery_status` reflecting the outcome (`sent` on success; the
 * client receives `502` when the provider failed and the row was left
 * at `failed`).
 * @status draft
 */
model MailCreateResponse {
  mail: MailGetResponse;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Discovery + health
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Capabilities advertised by `/.well-known/mail-api`.
 * @status draft
 */
model MailApiCapabilities {
  /** Hard cap on `limit` accepted by `GET /mails`. */
  max_mails_per_page: int32;

  /** Per-attachment byte limit. */
  max_attachment_bytes: int64;

  /** Whether `POST /mails` is wired to a provider on this instance. */
  outbound_enabled: boolean;
}

/**
 * Authentication block returned by discovery.
 * @status draft
 */
model MailApiAuthentication {
  /** Always `bearer` for v1. */
  type: "bearer";

  /** JWT `aud` values this instance accepts. */
  audience: string[];
}

/**
 * URL map returned by discovery. Trailing `{mailId}` is a literal
 * RFC 6570 template, not a placeholder.
 * @status draft
 */
model MailApiRoutes {
  mailboxes: string;
  mails: string;
  mail_by_id: string;
  send_mail: string;
}

/**
 * Discovery document — modeled on JMAP's session resource (RFC 8620
 * §2) but trimmed to the REST surface.
 * @status draft
 */
model MailApiDiscoveryResponse {
  service: "citizenry-mail";
  api_version: "v1";

  /** Absolute base URL clients should use for subsequent requests. */
  api_base: string;

  capabilities: MailApiCapabilities;
  authentication: MailApiAuthentication;
  routes: MailApiRoutes;
}

/**
 * Liveness probe response from `GET /_health`.
 * @status draft
 */
model MailHealthResponse {
  service: "citizenry-mail";
  status: "ok";
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Routes — public (no auth)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Unauthenticated probes and discovery.
 * @status draft
 */
@tag("Mail Public")
@useAuth(NoAuth)
interface MailPublic {
  /**
   * Liveness probe. Returns `200` whenever the Worker is reachable.
   */
  @summary("Liveness probe")
  @operationId("mail-health")
  @route("/_health")
  @get health(): MailHealthResponse | InternalError;

  /**
   * Discovery document — capabilities, accepted JWT audiences, and
   * absolute URLs for the rest of the API.
   */
  @summary("Mail API discovery document")
  @operationId("mail-discovery")
  @route("/.well-known/mail-api")
  @get discover(): MailApiDiscoveryResponse | InternalError;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Routes — agent (Bearer self-signed JWT)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Agent-scoped mailbox listing.
 *
 * Auth: `Authorization: Bearer <self-signed agent JWT>` (RFC 7523).
 *
 * @status draft
 */
@tag("Mail")
@route("/mailboxes")
@useAuth(AgentJwtAuth)
interface Mailboxes {
  /**
   * Mailboxes owned by the caller. The default set (`inbox`, `sent`,
   * `drafts`, `archive`, `trash`) is provisioned lazily on first call.
   *
   * Possible errors: 401, 429, 500.
   */
  @summary("List the caller's mailboxes (auto-provisions defaults)")
  @operationId("mail-mailbox-list")
  @get list():
    | MailboxesGetResponse
    | UnauthorizedError
    | RateLimitedError
    | InternalError;
}

/**
 * Agent-scoped mail routes.
 *
 * Auth: `Authorization: Bearer <self-signed agent JWT>` (RFC 7523).
 *
 * @status draft
 */
@tag("Mail")
@route("/mails")
@useAuth(AgentJwtAuth)
interface Mails {
  /**
   * Mails owned by the caller, newest first. `before` is a ms-since-
   * epoch cursor (use `next_before` from the previous response). When
   * `mailbox_id` is omitted, every mailbox is included.
   *
   * Possible errors: 401, 429, 500.
   */
  @summary("List the caller's mails (cursor-paginated)")
  @operationId("mail-list")
  @get list(
    @query mailboxId?: mailboxId,
    @query before?: int64,
    @query @minValue(1) @maxValue(200) limit?: int32 = 50,
  ): MailsGetResponse | UnauthorizedError | RateLimitedError | InternalError;

  /**
   * Read a single mail, body included. Returns 404 when the row exists
   * but is owned by another account.
   *
   * Possible errors: 401, 404, 500.
   */
  @summary("Read a single mail by id")
  @operationId("mail-read")
  @route("{id}")
  @get read(@path id: mailId):
    | MailGetWrappedResponse
    | UnauthorizedError
    | NotFoundError
    | InternalError;

  /**
   * Submit an outbound message. The row is persisted into `Sent` with
   * `delivery_status = "queued"` before the provider call; success
   * updates it to `"sent"`, failure to `"failed"`. The response is
   * `202 Accepted` whenever the provider accepted the message; a
   * provider error surfaces as `502`.
   *
   * Possible errors: 400, 401, 422, 429, 500, 502.
   */
  @summary("Send an outbound mail")
  @operationId("mail-send")
  @post send(@body body: MailCreateRequest):
    | {
        @statusCode statusCode: 202;
        @body body: MailCreateResponse;
      }
    | BadRequestError
    | UnauthorizedError
    | UnprocessableError
    | RateLimitedError
    | InternalError
    | BadGatewayError;
}
