import type {
  HealthResponse,
  ValidatorInfo,
  ValidatorsResponse,
  ValidatorCountResponse,
  LiveValidatorsResponse,
  ReadyResponse,
  CometRPCResponse,
  BroadcastTxRequest,
  BitcoinRPCRequest,
  BitcoinRPCResponse,
  QueryParams,
  VTXOResponse,
  ListVTXOsResponse,
  AddressVTXOsResponse,
  LockedVTXOsResponse,
  ListVaultsResponse,
  PageParams,
} from "./types";

/** Cap on how much of a daemon error body is quoted back in a thrown Error. */
const ERROR_BODY_MAX_CHARS = 500;

/** Turn optional pagination options into query-string entries. */
function pageQuery(params?: PageParams): Record<string, string> {
  const qs: Record<string, string> = {};
  if (params?.page !== undefined) qs.page = String(params.page);
  if (params?.page_size !== undefined) qs.page_size = String(params.page_size);
  return qs;
}

export interface TachiClientOptions {
  /** Base URL of the Tachi daemon RPC (e.g. "https://rpc-devnet.tachibtc.com"). */
  baseUrl: string;
  /** Optional custom fetch implementation (defaults to global fetch). */
  fetch?: typeof globalThis.fetch;
  /** Request timeout in milliseconds (default: 30000). Set to 0 to disable. */
  timeoutMs?: number;
  /**
   * Maximum accepted response body size in bytes (default: 64 MiB).
   * Set to 0 to disable the check.
   */
  maxResponseBytes?: number;
}

/**
 * TypeScript client for the Tachi BTC daemon RPC.
 *
 * @example
 * ```ts
 * import { TachiClient } from "@tachibtc/sdk";
 *
 * const client = new TachiClient({ baseUrl: "https://rpc-devnet.tachibtc.com" });
 * const health = await client.getHealth();
 * console.log(health.status);
 * ```
 */
export class TachiClient {
  private readonly baseUrl: string;
  private readonly fetch: typeof globalThis.fetch;
  private readonly timeoutMs: number;
  private readonly maxResponseBytes: number;

  constructor(options: TachiClientOptions) {
    const parsed = new URL(options.baseUrl);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error(`Invalid baseUrl protocol: ${parsed.protocol} (only http/https allowed)`);
    }
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.maxResponseBytes = options.maxResponseBytes ?? 64 * 1024 * 1024;
  }

  private get signal(): AbortSignal | undefined {
    return this.timeoutMs > 0 ? AbortSignal.timeout(this.timeoutMs) : undefined;
  }

  /**
   * Guard against sending credentials in cleartext.
   *
   * Called before any request that carries an API key. Plain http is fine for
   * a loopback daemon during local development, but sending the key
   * unencrypted to a remote host would expose the vault reconstruction
   * parameters it unlocks to anyone on the network path.
   */
  private assertSecureForAuth(): void {
    const { protocol, hostname } = new URL(this.baseUrl);
    const isLoopback =
      hostname === "localhost" ||
      hostname === "::1" ||
      hostname === "[::1]" ||
      /^127\./.test(hostname);
    if (protocol !== "https:" && !isLoopback) {
      throw new Error(
        `Refusing to send an API key over ${protocol}// to non-loopback host ${hostname}; use https.`,
      );
    }
  }

  /**
   * Parse a JSON response, refusing bodies larger than `maxResponseBytes`.
   *
   * A misbehaving or compromised daemon could otherwise return an unbounded
   * body — e.g. a list endpoint ignoring pagination — and exhaust memory in
   * the calling process. `Content-Length` is only a hint, so the streamed
   * bytes are counted as they arrive.
   */
  private async parseJson<T>(res: Response, label: string): Promise<T> {
    const max = this.maxResponseBytes;
    if (max <= 0) return res.json() as Promise<T>;

    const declared = Number(res.headers?.get?.("content-length"));
    if (Number.isFinite(declared) && declared > max) {
      throw new Error(`${label} response too large: ${declared} bytes exceeds limit of ${max}`);
    }

    // A mocked/streamless Response won't expose a body reader; fall back to json().
    const reader = res.body?.getReader?.();
    if (!reader) return res.json() as Promise<T>;

    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > max) {
        await reader.cancel();
        throw new Error(`${label} response too large: exceeds limit of ${max} bytes`);
      }
      chunks.push(value);
    }

    const buf = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
      buf.set(c, offset);
      offset += c.byteLength;
    }
    return JSON.parse(new TextDecoder().decode(buf)) as T;
  }

  /**
   * Perform the fetch, tagging transport failures with the endpoint involved.
   *
   * A bare `TimeoutError` says nothing about which of the client's calls
   * stalled, which is painful to debug in a process making many requests. The
   * original error is preserved as `cause`.
   */
  private async request(url: string, init: RequestInit, label: string): Promise<Response> {
    try {
      return await this.fetch(url, init);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      const name = err instanceof Error ? err.name : "Error";
      const timedOut = name === "TimeoutError" || name === "AbortError";
      const what = timedOut ? `timed out after ${this.timeoutMs}ms` : `request failed: ${reason}`;
      throw new Error(`${label} ${what} (${new URL(this.baseUrl).host})`, { cause: err });
    }
  }

  /**
   * Build the error for a non-2xx response, including the daemon's own message.
   *
   * The daemon explains validation failures in the response body — e.g. why an
   * address isn't taproot — and that text is far more useful than the bare
   * status line. The body is truncated so a huge error page can't blow up the
   * message, and any failure to read it is swallowed: we must not mask the
   * original HTTP error with a decoding error.
   */
  private async httpError(res: Response, label: string): Promise<Error> {
    let detail = "";
    try {
      const text = await res.text();
      detail = text.trim().slice(0, ERROR_BODY_MAX_CHARS);
      if (text.trim().length > ERROR_BODY_MAX_CHARS) detail += "…";
    } catch {
      // Body unreadable or already consumed — fall back to the status line.
    }
    const base = `${label} failed: ${res.status} ${res.statusText}`;
    return new Error(detail ? `${base} — ${detail}` : base);
  }

  private async get<T>(
    path: string,
    params?: Record<string, string>,
    headers?: Record<string, string>,
  ): Promise<T> {
    const url = new URL(path, this.baseUrl);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined) url.searchParams.set(k, v);
      }
    }
    const res = await this.request(url.toString(), { signal: this.signal, headers }, `GET ${path}`);
    if (!res.ok) throw await this.httpError(res, `GET ${path}`);
    return this.parseJson<T>(res, `GET ${path}`);
  }

  private async post<T>(path: string, body?: unknown): Promise<T> {
    const res = await this.request(
      new URL(path, this.baseUrl).toString(),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: this.signal,
      },
      `POST ${path}`,
    );
    if (!res.ok) throw await this.httpError(res, `POST ${path}`);
    return this.parseJson<T>(res, `POST ${path}`);
  }

  // ── Health & Status ──────────────────────────────────────────────

  /** Liveness probe returning daemon status and validator count. */
  async getHealth(): Promise<HealthResponse> {
    return this.get("/health");
  }

  /** Node info, sync status, and latest block height (via CometBFT). */
  async getStatus(): Promise<CometRPCResponse> {
    return this.get("/tachi_status");
  }

  // ── Peer Info ────────────────────────────────────────────────────

  /** PeerID, public key, and network addresses of this node. */
  async getPeerInfo(): Promise<ValidatorInfo> {
    return this.get("/tachi_peerInfo");
  }

  // ── Validators ───────────────────────────────────────────────────

  /** All validators from bootstrap registry merged with KDHT-discovered validators. */
  async getValidators(): Promise<ValidatorsResponse> {
    return this.get("/tachi_validators");
  }

  /**
   * Number of validators in the bootstrap registry.
   *
   * Registry-only — this counts fewer validators than the live network has.
   * Use `getValidators().count` for the merged registry + KDHT-discovered view.
   */
  async getValidatorCount(): Promise<ValidatorCountResponse> {
    return this.get("/tachi_validators/count");
  }

  /** Validators whose peers are currently connected via the overlay network. */
  async getLiveValidators(): Promise<LiveValidatorsResponse> {
    return this.get("/tachi_validators/live");
  }

  /**
   * Long-polls until the expected number of validators have registered
   * or a 60-second timeout expires.
   *
   * @param expected - Number of expected validators (default: 2).
   */
  async waitForValidatorsReady(expected?: number): Promise<ReadyResponse> {
    const params: Record<string, string> = {};
    if (expected !== undefined) params.expected = String(expected);
    return this.get("/tachi_validators/ready", params);
  }

  // ── Network ──────────────────────────────────────────────────────

  /** Listening addresses, connected peer count, and per-peer connection info (via CometBFT). */
  async getNetInfo(): Promise<CometRPCResponse> {
    return this.get("/tachi_netInfo");
  }

  // ── VTXOs ────────────────────────────────────────────────────────

  /**
   * Look up a single VTXO by its 32-byte hex ID.
   *
   * @param id - VTXO ID hex (64 characters).
   */
  async getVtxo(id: string): Promise<VTXOResponse> {
    return this.get("/tachi_vtxo", { id });
  }

  /**
   * List all VTXOs (unspent and spent), sorted by height descending.
   *
   * @param params.page - 1-based page number (default 1).
   * @param params.page_size - Entries per page (default 50, max 100).
   */
  async listVtxos(params?: PageParams): Promise<ListVTXOsResponse> {
    return this.get("/tachi_listVtxos", pageQuery(params));
  }

  /**
   * VTXOs owned by an address or public key. Unspent only by default.
   *
   * @param address - Taproot address (bc1p/tb1p/bcrt1p) or public key hex (32 or 33 bytes).
   * @param includeSpent - Include spent VTXOs (default false).
   */
  async getAddressVtxos(address: string, includeSpent = false): Promise<AddressVTXOsResponse> {
    const params: Record<string, string> = { address };
    if (includeSpent) params.include_spent = "true";
    return this.get("/tachi_addressVtxos", params);
  }

  /**
   * All VTXOs locked to a given vault.
   *
   * @param vault - Vault address (bech32m or hex).
   */
  async getLockedVtxos(vault: string): Promise<LockedVTXOsResponse> {
    return this.get("/tachi_vtxoLocked", { vault });
  }

  // ── Vaults ───────────────────────────────────────────────────────

  /**
   * List vaults owned by a user.
   *
   * The vault reconstruction parameters (`csv_delay`, `threshold`,
   * `quorum_keyset`, `user_key`) are redacted from the response unless
   * `apiKey` is supplied and the daemon recognises it.
   *
   * @param user - Taproot address (bc1p/tb1p/bcrt1p) or public key hex (32 or 33 bytes).
   * @param options.page - 1-based page number (default 1).
   * @param options.page_size - Entries per page (default 50, max 100).
   * @param options.apiKey - Sent as `X-Api-Key` to unlock reconstruction params.
   *   Requires an https `baseUrl` unless the daemon is on loopback.
   * @throws If `apiKey` is set and `baseUrl` is plain http to a non-loopback host.
   */
  async listVaults(
    user: string,
    options?: PageParams & { apiKey?: string },
  ): Promise<ListVaultsResponse> {
    let headers: Record<string, string> | undefined;
    if (options?.apiKey) {
      this.assertSecureForAuth();
      headers = { "X-Api-Key": options.apiKey };
    }
    return this.get("/tachi_listVaults", { user, ...pageQuery(options) }, headers);
  }

  // ── Transactions ─────────────────────────────────────────────────

  /**
   * Broadcast a hex-encoded transaction asynchronously.
   * Returns immediately without waiting for CheckTx.
   *
   * **A resolved promise does not mean the transaction was accepted.** This
   * returns before CheckTx runs at all. Check `result.code === 0` and read
   * `result.log`; a rejection only signals an HTTP-level failure.
   */
  async broadcastTxAsync(tx: string): Promise<CometRPCResponse> {
    return this.post("/tachi_txBroadcastAsync", { tx } satisfies BroadcastTxRequest);
  }

  /**
   * Broadcast a hex-encoded transaction synchronously.
   * Waits for CheckTx to complete before responding.
   *
   * **A resolved promise does not mean the transaction was accepted.** A
   * CheckTx failure comes back as HTTP 200 with a non-zero `result.code` and
   * an explanatory `result.log`, so inspect those rather than relying on the
   * promise resolving.
   */
  async broadcastTxSync(tx: string): Promise<CometRPCResponse> {
    return this.post("/tachi_txBroadcastSync", { tx } satisfies BroadcastTxRequest);
  }

  // ── Queries ──────────────────────────────────────────────────────

  /**
   * Forward a query to the CometBFT ABCI application.
   *
   * **A resolved promise does not mean the query succeeded.** CometBFT reports
   * ABCI failures as HTTP 200 with `result.response.code !== 0` and a `log`
   * field (e.g. `"unknown path: /store/key"`), so check those explicitly.
   *
   * @param params.path  - ABCI query path (required).
   * @param params.data  - Hex-encoded query data.
   * @param params.height - Block height to query at.
   */
  async query(params: QueryParams): Promise<CometRPCResponse> {
    const qs: Record<string, string> = { path: params.path };
    if (params.data) qs.data = params.data;
    if (params.height) qs.height = params.height;
    return this.get("/tachi_query", qs);
  }

  // ── Bitcoin RPC Proxy ────────────────────────────────────────────

  /**
   * Forward a JSON-RPC 1.0 request to the underlying bitcoind.
   *
   * **A resolved promise does not mean the call succeeded.** JSON-RPC reports
   * failures in the body, so check that `error` is `null` before trusting
   * `result`.
   *
   * **Security warning:** This proxies any Bitcoin RPC method, including
   * privileged ones (e.g. `sendtoaddress`, `dumpprivkey`, `stop`).
   * Ensure the daemon's RPC is properly access-controlled.
   *
   * @example
   * ```ts
   * const info = await client.bitcoinRPC({ method: "getblockchaininfo" });
   * console.log(info.result);
   * ```
   */
  async bitcoinRPC<T = unknown>(request: BitcoinRPCRequest): Promise<BitcoinRPCResponse<T>> {
    return this.post("/", {
      jsonrpc: request.jsonrpc ?? "1.0",
      method: request.method,
      params: request.params ?? [],
      id: request.id ?? "tachi-sdk",
    });
  }
}
