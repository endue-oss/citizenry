import "@typespec/http";
import "@typespec/openapi";
import "../common/main.tsp";

using TypeSpec.Http;
using TypeSpec.OpenAPI;
using Citizenry.Common;

// @status draft — implements RFC-0001 (federation peers).
namespace Citizenry.Identity;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Federation enums / scalars
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * federation_peer.state — RFC-0001 §"State machine".
 *
 * 전이:
 *   invited   → pending | revoked
 *   pending   → trusted | revoked
 *   trusted   → suspended | revoked
 *   suspended → trusted   | revoked
 *
 * @status confirmed
 */
enum FederationPeerState {
  invited,
  pending,
  trusted,
  suspended,
  revoked,
}

/**
 * Handshake JWS `purpose` claim.
 *
 *   federation.invite        — A → B 최초 핸드셰이크
 *   federation.invite.ack    — B → A 응답 (확인 또는 거부 메타)
 *   federation.confirm       — A → B 확인 echo (trusted 진입)
 *   federation.confirm.ack   — B → A 최종 ack
 *   federation.revoke        — 어느 쪽이든 양방향 종료
 *   federation.suspend       — 일시 정지
 *   federation.resume        — 재개
 *
 * @status confirmed
 */
enum FederationPurpose {
  invite: "federation.invite",
  invite_ack: "federation.invite.ack",
  confirm: "federation.confirm",
  confirm_ack: "federation.confirm.ack",
  revoke: "federation.revoke",
  suspend: "federation.suspend",
  resume: "federation.resume",
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Wire models
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 공개 `/.well-known/citizenry-peer` 의 응답.
 *
 * @status confirmed
 */
model PeerDiscoveryGetResponse {
  /** 페더레이션 프로토콜 버전 (현재 1). */
  protocol_version: int32;

  /** 자기 자신의 issuer URL (예: "https://citizenry.id"). */
  issuer: string;

  /** 안정 self-id — JWKS 회전과 무관. */
  instance_id: instanceId;

  /** 표시용 이름. 운영자 설정. */
  display_name?: string;

  /** 페더레이션 JWS 검증용 JWKS endpoint. */
  federation_jwks_url: string;

  /** 페더레이션 핸드셰이크 endpoint. */
  federation_handshake_url: string;

  /** 정책 hint (advisory). */
  policies?: PeerPolicies;
}

/**
 * @status confirmed
 */
model PeerPolicies {
  /** true 면 inbound invite 가 자동으로 trusted 까지 승격. */
  auto_accept?: boolean = false;

  /** 인스턴스가 받아들이는 최대 peer 수 (server 가 enforce). */
  max_peers?: int32 = 256;
}

/**
 * 페더레이션 핸드셰이크 JWS body (compact JWS 의 payload).
 *
 * `Authorization` 헤더가 아니라 **body 자체가 JWS 컴팩트 직렬화** 다.
 * Content-Type: `application/jws`.
 *
 * @status confirmed
 */
model FederationHandshakePayload {
  /** 발신 인스턴스 issuer URL. */
  from_issuer: string;

  /** 발신 인스턴스 instance_id. */
  from_instance_id: instanceId;

  /** 수신 인스턴스 issuer URL (mismatch 시 401). */
  to_issuer: string;

  /** 메시지 의도 — 라우터가 디스패치에 사용. */
  purpose: FederationPurpose;

  /** 표시용 이름 (응답에 포함되어 mirror 에 저장). */
  display_name?: string;

  /** invite 시 발신 측이 생성한 32B base64url nonce. */
  nonce: base64url;

  /** confirm / ack 시: 원본 invite 의 `nonce` 를 echo. */
  nonce_echo?: base64url;

  /** Unix epoch seconds. */
  iat: unixTimestamp;

  /** `iat + 600` 이하. */
  exp: unixTimestamp;

  /** 자유 메타 (정책, 표시명 변경 등). */
  metadata?: Record<unknown>;
}

/**
 * Handshake endpoint 응답.
 *
 * @status confirmed
 */
model FederationHandshakeResponse {
  /** 처리 결과 — 수신측의 `federation_peer.state` 값. */
  state: FederationPeerState;

  /** 응답측의 instance_id (요청측이 mirror 에 기록). */
  instance_id: instanceId;

  /** 응답측 issuer. */
  issuer: string;

  /** 응답측이 동봉한 ack JWS (compact). 다음 라운드에서 검증해야 하면 비어 있을 수 있음. */
  ack_jws?: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Admin models — peer CRUD
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Admin 이 보는 peer row.
 *
 * @status confirmed
 */
model FederationPeerGetResponse {
  id: federationPeerId;
  issuer: string;
  instance_id?: instanceId;
  display_name?: string;
  state: FederationPeerState;
  protocol_version: int32;

  /** trusted 된 시점에 materialize 된 federated tenant. null = 아직 미생성. */
  tenant_id?: tenantId;

  /** discovery 응답 원본 캐시. */
  peer_metadata?: Record<unknown>;

  jwks_cached_at?: iso8601;
  trusted_at?: iso8601;
  suspended_at?: iso8601;
  revoked_at?: iso8601;
  created_at: iso8601;
  updated_at: iso8601;
}

/**
 * Admin POST body — peer 추가 (outbound 핸드셰이크 시작).
 *
 * @status confirmed
 */
model FederationPeerCreateRequest {
  /** 추가할 peer 의 issuer URL (예: "https://bob.citizenry.example"). */
  @minLength(8)
  @maxLength(255)
  issuer_url: string;

  /** 표시명 — 미지정 시 discovery 응답의 display_name 을 사용. */
  @maxLength(255)
  display_name?: string;
}

/**
 * Admin POST body — state 전이 (suspend / resume).
 *
 * `revoke` 는 별도 DELETE 라우트.
 *
 * @status confirmed
 */
model FederationPeerTransitionRequest {
  /** suspend → trusted, trusted → suspended 만 허용. */
  target_state: FederationPeerState;

  /** 운영자 메모 (audit log payload). */
  @maxLength(500)
  reason?: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Routes
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 공개 peer discovery — JSON, no auth, 캐시 가능 (max-age=300).
 *
 * @status confirmed
 */
@tag("Federation")
@route("/.well-known/citizenry-peer")
@useAuth(NoAuth)
interface FederationPeerDiscovery {
  @summary("Public peer discovery document")
  @operationId("federation-peer-discovery")
  @get read(): PeerDiscoveryGetResponse | InternalError;
}

/**
 * Peer-to-peer 핸드셰이크 endpoint.
 *
 * 요청 body 는 **compact JWS** (text/plain 가능, 권장 `application/jws`).
 * payload 는 `FederationHandshakePayload`.
 *
 * 인증은 JWS 서명 자체로 수행 — header `Authorization` 없음.
 *
 * 가능한 에러:
 *   401 (ERR-P01-FED-1001 JWS verify failed,
 *        ERR-P01-FED-1002 from_issuer mismatch,
 *        ERR-P01-FED-1003 replay)
 *   422 (ERR-P01-FED-2001 invalid issuer URL)
 *   409 (ERR-P01-FED-3003 state transition not allowed)
 *   502 (ERR-P01-FED-4001/4002 discovery / JWKS fetch failed)
 *
 * @status confirmed
 */
@tag("Federation")
@route("/federation/handshake")
@useAuth(NoAuth)
interface FederationHandshake {
  @summary("Federation handshake — receive an invite / confirm / revoke")
  @operationId("federation-handshake")
  @post handle(
    @header("content-type") contentType: "application/jws" | "application/jws+json",
    @body jws: string,
  ):
    | FederationHandshakeResponse
    | BadRequestError
    | UnauthorizedError
    | ConflictError
    | UnprocessableError
    | BadGatewayError
    | InternalError;
}

/**
 * Admin federation peer CRUD — `X-Service-Key` 인증.
 *
 * @status confirmed
 */
@tag("Federation")
@route("/api/v1/admin/federation/peers")
@useAuth(ServiceKeyAuth)
interface AdminFederationPeers {
  /**
   * Peer 추가 — outbound 핸드셰이크 시작.
   *
   * 1) issuer_url 의 `.well-known/citizenry-peer` 와 JWKS 를 fetch
   * 2) `federation_peer` row INSERT (state='invited')
   * 3) 상대 `/federation/handshake` 로 서명된 invite 전송
   * 4) 응답에 따라 state 갱신 (pending | trusted | revoked)
   * 5) trusted 되면 federated tenant 자동 생성
   *
   * 응답은 INSERT 직후의 row 상태 — 비동기 전이는 GET 으로 폴링.
   *
   * 가능한 에러: 401, 422 (2001), 409 (3002), 502 (4001/4002/4003), 500
   */
  @summary("Add a federation peer (initiates outbound handshake)")
  @operationId("admin-federation-peer-create")
  @post create(@body input: FederationPeerCreateRequest):
    | FederationPeerGetResponse
    | UnauthorizedError
    | UnprocessableError
    | ConflictError
    | BadGatewayError
    | InternalError;

  /**
   * 가능한 에러: 401, 500
   */
  @summary("List federation peers (paginated)")
  @operationId("admin-federation-peer-list")
  @get list(
    @query state?: FederationPeerState,
    ...PaginationParams,
  ): PaginatedList<FederationPeerGetResponse> | UnauthorizedError | InternalError;

  /**
   * 가능한 에러: 401, 404 (3001), 500
   */
  @summary("Read federation peer")
  @operationId("admin-federation-peer-read")
  @get read(@path id: federationPeerId):
    | FederationPeerGetResponse
    | UnauthorizedError
    | NotFoundError
    | InternalError;

  /**
   * trusted ⇄ suspended 전이.
   * 다른 전이 시도: 409 (ERR-P01-FED-3003).
   *
   * 가능한 에러: 401, 404 (3001), 409 (3003), 502 (4003), 500
   */
  @summary("Transition federation peer state")
  @operationId("admin-federation-peer-transition")
  @route("/{id}/transition")
  @post transition(@path id: federationPeerId, @body input: FederationPeerTransitionRequest):
    | FederationPeerGetResponse
    | UnauthorizedError
    | NotFoundError
    | ConflictError
    | BadGatewayError
    | InternalError;

  /**
   * Peer 영구 폐기.
   * - state='revoked', tenant.status='archived'
   * - 상대측에 `federation.revoke` JWS POST (best effort, 실패해도 로컬 종료)
   * - 멤버십은 historical record 로 보존.
   * - 동일 issuer 재가입 시 새 fdp_* row.
   *
   * 가능한 에러: 401, 404 (3001), 500
   */
  @summary("Revoke a federation peer (permanent)")
  @operationId("admin-federation-peer-revoke")
  @delete revoke(@path id: federationPeerId):
    | {
        @statusCode statusCode: 204;
      }
    | UnauthorizedError
    | NotFoundError
    | InternalError;

  /**
   * JWKS 즉시 갱신 — 상대 키 회전 시 운영자가 강제로 다시 받아온다.
   *
   * 가능한 에러: 401, 404 (3001), 502 (4002), 500
   */
  @summary("Refresh cached JWKS for a peer")
  @operationId("admin-federation-peer-refresh-jwks")
  @route("/{id}/jwks-refresh")
  @post refreshJwks(@path id: federationPeerId):
    | FederationPeerGetResponse
    | UnauthorizedError
    | NotFoundError
    | BadGatewayError
    | InternalError;
}
