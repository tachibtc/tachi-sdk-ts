import type {
  HealthResponse,
  ValidatorInfo,
  ValidatorsResponse,
  ValidatorCountResponse,
  LiveValidatorsResponse,
  ReadyResponse,
  RegisterResponse,
  CometRPCResponse,
  BroadcastTxRequest,
  BitcoinRPCRequest,
  BitcoinRPCResponse,
  QueryParams,
} from "./types";

export interface TachiClientOptions {
  /** Base URL of the Tachi daemon RPC (e.g. "https://rpc-regtest.tachibtc.com" or "https://rpc-signet.tachibtc.com"). */
  baseUrl: string;
  /** Optional custom fetch implementation (defaults to global fetch). */
  fetch?: typeof globalThis.fetch;
  /** Request timeout in milliseconds (default: 30000). Set to 0 to disable. */
  timeoutMs?: number;
}

/**
 * TypeScript client for the Tachi BTC daemon RPC.
 *
 * @example
 * ```ts
 * import { TachiClient } from "@tachibtc/sdk";
 *
 * const client = new TachiClient({ baseUrl: "https://rpc-regtest.tachibtc.com" }); // or "https://rpc-signet.tachibtc.com"
 * const health = await client.getHealth();
 * console.log(health.status);
 * ```
 */
export class TachiClient {
  private readonly baseUrl: string;
  private readonly fetch: typeof globalThis.fetch;
  private readonly timeoutMs: number;

  constructor(options: TachiClientOptions) {
    const parsed = new URL(options.baseUrl);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error(`Invalid baseUrl protocol: ${parsed.protocol} (only http/https allowed)`);
    }
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  private get signal(): AbortSignal | undefined {
    return this.timeoutMs > 0 ? AbortSignal.timeout(this.timeoutMs) : undefined;
  }

  private async get<T>(path: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(path, this.baseUrl);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined) url.searchParams.set(k, v);
      }
    }
    const res = await this.fetch(url.toString(), { signal: this.signal });
    if (!res.ok) throw new Error(`GET ${path} failed: ${res.status} ${res.statusText}`);
    return res.json() as Promise<T>;
  }

  private async post<T>(path: string, body?: unknown): Promise<T> {
    const res = await this.fetch(new URL(path, this.baseUrl).toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: this.signal,
    });
    if (!res.ok) throw new Error(`POST ${path} failed: ${res.status} ${res.statusText}`);
    return res.json() as Promise<T>;
  }

  // ── Health & Status ──────────────────────────────────────────────

  /** Liveness probe returning daemon status and validator count. */
  async getHealth(): Promise<HealthResponse> {
    return this.get("/health");
  }

  /** Node info, sync status, and latest block height (via CometBFT). */
  async getStatus(): Promise<CometRPCResponse> {
    return this.get("/status");
  }

  // ── Peer Info ────────────────────────────────────────────────────

  /** PeerID, public key, and network addresses of this node. */
  async getPeerInfo(): Promise<ValidatorInfo> {
    return this.get("/peer-info");
  }

  // ── Validators ───────────────────────────────────────────────────

  /** All validators from bootstrap registry merged with KDHT-discovered validators. */
  async getValidators(): Promise<ValidatorsResponse> {
    return this.get("/validators");
  }

  /** Number of validators in the bootstrap registry. */
  async getValidatorCount(): Promise<ValidatorCountResponse> {
    return this.get("/validators/count");
  }

  /** Validators whose peers are currently connected via the overlay network. */
  async getLiveValidators(): Promise<LiveValidatorsResponse> {
    return this.get("/validators/live");
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
    return this.get("/validators/ready", params);
  }

  /**
   * Register a validator with this bootstrap node.
   * Only overwrites existing fields if the new value is non-empty.
   */
  async registerValidator(info: ValidatorInfo): Promise<RegisterResponse> {
    return this.post("/validators/register", info);
  }

  // ── Network ──────────────────────────────────────────────────────

  /** Listening addresses, connected peer count, and per-peer connection info (via CometBFT). */
  async getNetInfo(): Promise<CometRPCResponse> {
    return this.get("/net-info");
  }

  // ── Transactions ─────────────────────────────────────────────────

  /**
   * Broadcast a hex-encoded transaction asynchronously.
   * Returns immediately without waiting for CheckTx.
   */
  async broadcastTxAsync(tx: string): Promise<CometRPCResponse> {
    return this.post("/tx/broadcast/async", { tx } satisfies BroadcastTxRequest);
  }

  /**
   * Broadcast a hex-encoded transaction synchronously.
   * Waits for CheckTx to complete before responding.
   */
  async broadcastTxSync(tx: string): Promise<CometRPCResponse> {
    return this.post("/tx/broadcast/sync", { tx } satisfies BroadcastTxRequest);
  }

  // ── Queries ──────────────────────────────────────────────────────

  /**
   * Forward a query to the CometBFT ABCI application.
   *
   * @param params.path  - ABCI query path (required).
   * @param params.data  - Hex-encoded query data.
   * @param params.height - Block height to query at.
   */
  async query(params: QueryParams): Promise<CometRPCResponse> {
    const qs: Record<string, string> = { path: params.path };
    if (params.data) qs.data = params.data;
    if (params.height) qs.height = params.height;
    return this.get("/query", qs);
  }

  // ── Bitcoin RPC Proxy ────────────────────────────────────────────

  /**
   * Forward a JSON-RPC 1.0 request to the underlying bitcoind.
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
