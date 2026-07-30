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
    const res = await this.fetch(url.toString(), { signal: this.signal, headers });
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

  /** Number of validators in the bootstrap registry. */
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
   */
  async listVaults(
    user: string,
    options?: PageParams & { apiKey?: string },
  ): Promise<ListVaultsResponse> {
    const headers = options?.apiKey ? { "X-Api-Key": options.apiKey } : undefined;
    return this.get("/tachi_listVaults", { user, ...pageQuery(options) }, headers);
  }

  // ── Transactions ─────────────────────────────────────────────────

  /**
   * Broadcast a hex-encoded transaction asynchronously.
   * Returns immediately without waiting for CheckTx.
   */
  async broadcastTxAsync(tx: string): Promise<CometRPCResponse> {
    return this.post("/tachi_txBroadcastAsync", { tx } satisfies BroadcastTxRequest);
  }

  /**
   * Broadcast a hex-encoded transaction synchronously.
   * Waits for CheckTx to complete before responding.
   */
  async broadcastTxSync(tx: string): Promise<CometRPCResponse> {
    return this.post("/tachi_txBroadcastSync", { tx } satisfies BroadcastTxRequest);
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
    return this.get("/tachi_query", qs);
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
