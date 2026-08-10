import type {
  HealthResponse,
  ValidatorInfo,
  ValidatorsResponse,
  ValidatorCountResponse,
  LiveValidatorsResponse,
  ReadyResponse,
  CometRPCResponse,
  BroadcastTxRequest,
  TxHexRequest,
  BitcoinRPCRequest,
  BitcoinRPCResponse,
  QueryParams,
  VTXOResponse,
  ListVTXOsResponse,
  AddressVTXOsResponse,
  LockedVTXOsResponse,
  ListVaultsResponse,
  PageParams,
  AddressResponse,
  BalanceResponse,
  AddressTransactionsResponse,
  GetTransactionResponse,
  GetRawTransactionResponse,
  ListTransactionsResponse,
  MempoolResponse,
  MempoolByAddressResponse,
  TxDecodeResponse,
  TxValidateResponse,
  FeeEstimateResponse,
  BlockResponse,
  ListBlocksResponse,
  GetBlockHashResponse,
  GetBlockHeaderResponse,
  GetEpochResponse,
  ListEpochsResponse,
  StatsResponse,
  SupplyResponse,
  SearchResponse,
  NodeInfoResponse,
  WatchtowerStatus,
  RefundTx,
  SignTransactionResponse,
  WatchFilters,
  TachiEvent,
} from "./types";

/** Cap on how much of a daemon error body is quoted back in a thrown Error. */
const ERROR_BODY_MAX_CHARS = 500;

/**
 * Is this hostname a genuine loopback address?
 *
 * Deliberately strict: a prefix test like `/^127\./` also matches DNS names
 * such as `127.evil.com` or `127.0.0.1.attacker.com`, which resolve to
 * whatever the owner points them at. Treating those as loopback would let an
 * attacker who can influence `baseUrl` — via an env var, a config file, or a
 * user-supplied custom-RPC field — disable the HTTPS requirement for API keys.
 *
 * `URL` normalizes shorthand and octal forms (`127.1`, `0177.0.0.1`) to
 * dotted-quad and IPv6 loopback to `[::1]` before we see them, so matching a
 * full dotted-quad plus the two literals is sufficient.
 */
function isLoopbackHost(hostname: string): boolean {
  if (hostname === "localhost" || hostname === "::1" || hostname === "[::1]") return true;
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname);
  if (!m) return false;
  const octets = m.slice(1, 5).map(Number);
  return octets.every((o) => o <= 255) && octets[0] === 127;
}

/** Turn optional cursor-pagination options into query-string entries. */
function cursorQuery(options?: { beforeHeight?: number; pageSize?: number }): Record<string, string> {
  const qs: Record<string, string> = {};
  if (options?.beforeHeight !== undefined) qs.before_height = String(options.beforeHeight);
  if (options?.pageSize !== undefined) qs.page_size = String(options.pageSize);
  return qs;
}

/**
 * Validate a height-or-hash selector.
 *
 * The daemon 400s on a selectorless request; failing here keeps the error at
 * the call site instead of a round-trip later.
 */
function blockSelector(
  selector: { height?: number; hash?: string },
  method: string,
): Record<string, string> {
  if (selector.height === undefined && !selector.hash) {
    throw new Error(`${method} requires either a height or a hash`);
  }
  const qs: Record<string, string> = {};
  if (selector.height !== undefined) qs.height = String(selector.height);
  if (selector.hash) qs.hash = selector.hash;
  return qs;
}

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
    if (protocol !== "https:" && !isLoopbackHost(hostname)) {
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

  // ── Address ──────────────────────────────────────────────────────

  /**
   * Balance, nonce, and VTXO count for an address.
   *
   * @param address - Taproot address (bc1p/tb1p/bcrt1p) or public key hex (32 or 33 bytes).
   */
  async getAddress(address: string): Promise<AddressResponse> {
    return this.get("/tachi_address", { address });
  }

  /** Spendable balance in satoshis for an address. */
  async getBalance(address: string): Promise<BalanceResponse> {
    return this.get("/tachi_balance", { address });
  }

  /** Current transaction nonce for an address. */
  async getNonce(address: string): Promise<Record<string, unknown>> {
    return this.get("/tachi_nonce", { address });
  }

  /**
   * Transactions involving an address, newest first.
   *
   * **This is a full-chain scan.** The daemon has no address index and walks
   * every block, so latency grows with chain height — measured at ~17s on a
   * ~115k-block regtest chain for an address with 2 matching transactions.
   * Always pass `pageSize`, and page backwards with `beforeHeight` using the
   * `next_before_height` cursor from the previous response rather than asking
   * for an address's entire history in one call.
   *
   * @param address - Taproot address or public key hex.
   * @param options.beforeHeight - Return transactions below this height (the cursor).
   * @param options.pageSize - Entries per page.
   */
  async getAddressTransactions(
    address: string,
    options?: { beforeHeight?: number; pageSize?: number },
  ): Promise<AddressTransactionsResponse> {
    return this.get("/tachi_addressTransactions", { address, ...cursorQuery(options) });
  }

  // ── Transactions ─────────────────────────────────────────────────

  /**
   * Look up a transaction by hash.
   *
   * @param hash - Transaction hash hex.
   * @param options.hat - Include the Hash-Anchored Timestamp proof.
   * @param options.rip - Include the RIP payload.
   * @param options.vtxoId - Scope the HAT proof to a single VTXO.
   * @param options.originEpoch - Lower epoch bound for proof lookup.
   * @param options.finalEpoch - Upper epoch bound for proof lookup.
   */
  async getTransaction(
    hash: string,
    options?: {
      hat?: boolean;
      rip?: boolean;
      vtxoId?: string;
      originEpoch?: number;
      finalEpoch?: number;
    },
  ): Promise<GetTransactionResponse> {
    const qs: Record<string, string> = { hash };
    if (options?.hat) qs.hat = "true";
    if (options?.rip) qs.rip = "true";
    if (options?.vtxoId) qs.vtxo_id = options.vtxoId;
    if (options?.originEpoch !== undefined) qs.origin_epoch = String(options.originEpoch);
    if (options?.finalEpoch !== undefined) qs.final_epoch = String(options.finalEpoch);
    return this.get("/tachi_tx", qs);
  }

  /** Raw transaction hex by hash. */
  async getRawTransaction(hash: string): Promise<GetRawTransactionResponse> {
    return this.get("/tachi_txRaw", { hash });
  }

  /**
   * Recent transactions across the chain, newest first.
   *
   * Same full-chain-scan caveat as {@link getAddressTransactions} — omitting
   * `pageSize` has been observed to exceed an 8-second timeout. Pass one, and
   * page with the `next_before_height` cursor.
   */
  async listTransactions(options?: {
    beforeHeight?: number;
    pageSize?: number;
  }): Promise<ListTransactionsResponse> {
    return this.get("/tachi_listTransactions", cursorQuery(options));
  }

  /** Transactions currently in the mempool. */
  async getMempool(): Promise<MempoolResponse> {
    return this.get("/tachi_mempool");
  }

  /** Mempool transactions involving a given address. */
  async getMempoolByAddress(address: string): Promise<MempoolByAddressResponse> {
    return this.get("/tachi_mempoolByAddress", { address });
  }

  /**
   * Decode a raw transaction without broadcasting it.
   *
   * @param tx - Hex-encoded transaction (no `0x` prefix).
   */
  async decodeTransaction(tx: string): Promise<TxDecodeResponse> {
    // Note: this endpoint takes `hex`, not the `tx` field the broadcast
    // endpoints use. Verified against the live daemon.
    return this.post("/tachi_txDecode", { hex: tx } satisfies TxHexRequest);
  }

  /**
   * Validate a raw transaction without broadcasting it.
   *
   * **A resolved promise does not mean the transaction is valid** — check the
   * `valid` field. The promise only rejects on an HTTP-level failure.
   *
   * @param tx - Hex-encoded transaction (no `0x` prefix).
   */
  async validateTransaction(tx: string): Promise<TxValidateResponse> {
    return this.post("/tachi_txValidate", { hex: tx } satisfies TxHexRequest);
  }

  /** Recommended, average, and minimum fee in satoshis. */
  async getFeeEstimate(): Promise<FeeEstimateResponse> {
    return this.get("/tachi_feeEstimate");
  }

  // ── Blocks ───────────────────────────────────────────────────────

  /** Block at a height, including its transactions. */
  async getBlockByHeight(height: number): Promise<BlockResponse> {
    return this.get("/tachi_block", { height: String(height) });
  }

  /**
   * Block by height or hash, including its transactions.
   *
   * @throws If neither `height` nor `hash` is supplied.
   */
  async getBlock(selector: { height?: number; hash?: string }): Promise<BlockResponse> {
    return this.get("/tachi_getBlock", blockSelector(selector, "getBlock"));
  }

  /** Block hash at a height. */
  async getBlockHash(height: number): Promise<GetBlockHashResponse> {
    return this.get("/tachi_getBlockHash", { height: String(height) });
  }

  /**
   * Block header by height or hash — no transaction bodies.
   *
   * @throws If neither `height` nor `hash` is supplied.
   */
  async getBlockHeader(selector: {
    height?: number;
    hash?: string;
  }): Promise<GetBlockHeaderResponse> {
    return this.get("/tachi_getBlockHeader", blockSelector(selector, "getBlockHeader"));
  }

  /** Paginated block list, newest first. */
  async listBlocks(params?: PageParams): Promise<ListBlocksResponse> {
    return this.get("/tachi_listBlocks", pageQuery(params));
  }

  // ── Epochs ───────────────────────────────────────────────────────

  /**
   * Epoch by id or hash.
   *
   * The daemon requires exactly one of the two — there is no "current epoch"
   * form. Use `getStats().current_epoch` to find the latest id first.
   *
   * @throws If neither or both of `id` and `hash` are supplied.
   */
  async getEpoch(selector: { id?: number; hash?: string }): Promise<GetEpochResponse> {
    const hasId = selector.id !== undefined;
    const hasHash = Boolean(selector.hash);
    if (hasId === hasHash) {
      throw new Error("getEpoch requires exactly one of id or hash");
    }
    const qs: Record<string, string> = {};
    if (hasId) qs.id = String(selector.id);
    if (hasHash) qs.hash = selector.hash as string;
    return this.get("/tachi_epoch", qs);
  }

  /** Paginated epoch list, newest first. */
  async listEpochs(params?: PageParams): Promise<ListEpochsResponse> {
    return this.get("/tachi_listEpochs", pageQuery(params));
  }

  // ── Dashboard & stats ────────────────────────────────────────────

  /** Chain-wide counters: height, epoch, supply, accounts, transactions. */
  async getStats(): Promise<StatsResponse> {
    return this.get("/tachi_stats");
  }

  /** Total supply in satoshis and the VTXO count backing it. */
  async getSupply(): Promise<SupplyResponse> {
    return this.get("/tachi_supply");
  }

  /**
   * Resolve a free-form query to a block, transaction, address, or VTXO.
   *
   * Narrow on the returned `type` before using `result`.
   *
   * @param q - A height, hash, address, or VTXO id.
   */
  async search(q: string): Promise<SearchResponse> {
    return this.get("/tachi_search", { q });
  }

  /** Node identity, version, sync status, and peer count. */
  async getNodeInfo(): Promise<NodeInfoResponse> {
    return this.get("/tachi_nodeInfo");
  }

  /** Full CometBFT consensus state dump. */
  async getConsensusState(): Promise<CometRPCResponse> {
    return this.get("/tachi_consensusState");
  }

  /** Validator voting power distribution (via CometBFT). */
  async getValidatorsPower(): Promise<CometRPCResponse> {
    return this.get("/tachi_validatorsPower");
  }

  // ── Watchtower ───────────────────────────────────────────────────

  /** Watchtower mode, scan progress, and receipt count. */
  async getWatchtowerStatus(): Promise<WatchtowerStatus> {
    return this.get("/tachi_watchtower/status");
  }

  /**
   * Watchtower receipts for observed L1 spends of vault funding outpoints.
   *
   * @param options.vault - Restrict to one vault address.
   * @param options.state - Restrict to one receipt state.
   */
  async getWatchtowerReceipts(options?: {
    vault?: string;
    state?: number;
  }): Promise<Record<string, unknown>> {
    const qs: Record<string, string> = {};
    if (options?.vault) qs.vault = options.vault;
    if (options?.state !== undefined) qs.state = String(options.state);
    return this.get("/tachi_watchtower/receipts", qs);
  }

  // ── Vault refund signing ─────────────────────────────────────────

  /**
   * Ask the daemon's quorum to co-sign a vault refund transaction.
   *
   * @param refund - The refund transaction carrying the user's signature.
   */
  async signTransaction(refund: RefundTx): Promise<SignTransactionResponse> {
    return this.post("/tachi_signTransaction", refund);
  }

  // ── Real-time events ─────────────────────────────────────────────

  /**
   * Subscribe to the daemon's push event stream over WebSocket.
   *
   * Yields events until the caller breaks out of the loop, the connection
   * closes, or `signal` aborts — whichever happens first. Leaving the loop by
   * any means (`break`, `return`, or an exception) closes the socket, so there
   * is no separate teardown call.
   *
   * At least one filter is required; the daemon rejects a filterless
   * connection. Transaction alerts arrive twice — once as `state: "pending"`
   * when CheckTx accepts, then as `state: "committed"` once the block commits.
   *
   * Uses the global `WebSocket`, which Node provides natively from v22 (hence
   * this package's `engines` floor). Pass `options.WebSocket` to supply your
   * own implementation — for a browser bundle, an older runtime, or a test.
   *
   * @example
   * ```ts
   * const ac = new AbortController();
   * setTimeout(() => ac.abort(), 30_000);
   * for await (const ev of client.watch({ blocks: true }, { signal: ac.signal })) {
   *   if (ev.event === "block") console.log(ev.block);
   * }
   * ```
   *
   * @throws If no filter is set, or if no WebSocket implementation is available.
   */
  async *watch(
    filters: WatchFilters,
    options?: { signal?: AbortSignal; WebSocket?: typeof globalThis.WebSocket },
  ): AsyncGenerator<TachiEvent, void, undefined> {
    const qs = new URLSearchParams();
    if (filters.address) qs.set("address", filters.address);
    if (filters.vault) qs.set("vault", filters.vault);
    if (filters.vaultId) qs.set("vaultId", filters.vaultId);
    if (filters.blocks) qs.set("blocks", "true");
    if (filters.validators) qs.set("validators", "true");
    if ([...qs.keys()].length === 0) {
      throw new Error(
        "watch() requires at least one filter (address, vault, vaultId, blocks, or validators)",
      );
    }

    const Impl = options?.WebSocket ?? globalThis.WebSocket;
    if (!Impl) {
      throw new Error(
        "No WebSocket implementation available. Node provides one natively from v22; " +
          "on older runtimes pass options.WebSocket.",
      );
    }

    const url = new URL("/tachi_ws", this.baseUrl);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.search = qs.toString();

    const socket = new Impl(url.toString());
    // Buffer events that arrive while the consumer is between iterations, so a
    // slow loop body drops nothing.
    const queue: TachiEvent[] = [];
    let notify: (() => void) | undefined;
    let closed = false;
    let failure: Error | undefined;

    const wake = () => {
      notify?.();
      notify = undefined;
    };
    const stop = (err?: Error) => {
      if (err && !failure) failure = err;
      closed = true;
      wake();
    };

    socket.onmessage = (ev: MessageEvent) => {
      try {
        queue.push(JSON.parse(String(ev.data)) as TachiEvent);
      } catch {
        // A frame we can't parse shouldn't kill an otherwise healthy stream.
        return;
      }
      wake();
    };
    socket.onerror = () => stop(new Error(`watch: websocket error (${url.host})`));
    socket.onclose = () => stop();

    const onAbort = () => stop();
    options?.signal?.addEventListener("abort", onAbort, { once: true });

    try {
      for (;;) {
        while (queue.length > 0) yield queue.shift() as TachiEvent;
        if (failure) throw failure;
        if (closed) return;
        if (options?.signal?.aborted) return;
        await new Promise<void>((resolve) => {
          notify = resolve;
        });
      }
    } finally {
      options?.signal?.removeEventListener("abort", onAbort);
      try {
        socket.close();
      } catch {
        // Already closing or closed — nothing to do.
      }
    }
  }
}
