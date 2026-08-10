/** Response from the /health endpoint. */
export interface HealthResponse {
  status: string;
  validators: number;
}

/** Information about a single validator/peer. */
export interface ValidatorInfo {
  peer_id: string;
  pub_key_hex: string;
  host: string;
  p2p_port: number;
  rpc_addr: string;
}

/** Response from /validators. */
export interface ValidatorsResponse {
  count: number;
  validators: ValidatorInfo[];
}

/** Response from /validators/count. */
export interface ValidatorCountResponse {
  count: number;
}

/** Response from /validators/live. */
export interface LiveValidatorsResponse {
  count: number;
  total_known: number;
  validators: ValidatorInfo[];
}

/** Response from /validators/ready. */
export interface ReadyResponse {
  count: number;
  ready: boolean;
  validators: ValidatorInfo[];
}

/**
 * Response from /tachi_validators/register.
 *
 * The SDK has no method for this endpoint: registration requires a BIP-340
 * Schnorr signature over a canonical digest whose construction is not
 * described by the daemon's OpenAPI spec. Call it directly until that is
 * documented.
 */
export interface RegisterResponse {
  status: string;
  total: number;
}

/** A VTXO as returned by the single-lookup and list endpoints. */
export interface VTXOResponse {
  /** Hex-encoded 32-byte VTXO identifier. */
  id: string;
  /** Hex-encoded owner public key authorized to spend this VTXO. */
  owner: string;
  /** Value in satoshis. */
  amount: number;
  /** Hex-encoded locking script. */
  script: string;
  /** Block height at which this VTXO was created. */
  height: number;
  /** True once consumed by a confirmed transaction. */
  spent: boolean;
}

/** A VTXO as returned by the per-address endpoint, with vault lock details. */
export interface VTXOItem extends VTXOResponse {
  /** True while this VTXO is bound to a vault and not freely spendable. */
  locked: boolean;
  /** bech32m P2TR vault address when `locked` is true; omitted otherwise. */
  vault_address?: string;
}

/** Response from /tachi_listVtxos. */
export interface ListVTXOsResponse {
  vtxos: VTXOResponse[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

/** Response from /tachi_addressVtxos. */
export interface AddressVTXOsResponse {
  /** Normalized 32-byte x-only public key hex the VTXOs are owned by. */
  pubkey: string;
  count: number;
  vtxos: VTXOItem[];
}

/** Response from /tachi_vtxoLocked. */
export interface LockedVTXOsResponse {
  /** Vault address (bech32m or hex) the locked VTXOs are bound to. */
  vault: string;
  count: number;
  vtxos: VTXOResponse[];
}

/**
 * A vault entry from /tachi_listVaults.
 *
 * The reconstruction parameters (`csv_delay`, `threshold`, `quorum_keyset`,
 * `user_key`) disclose the vault's spending policy, so the daemon only returns
 * them when the request carries a valid API key — otherwise they are omitted.
 */
export interface VaultListItem {
  /** Hex VaultID = H(funding_txid || vout). */
  vault_id: string;
  /** bech32m P2TR vault address; also the `?vault=` websocket filter key. */
  address: string;
  /** Hex L1 funding txid. */
  funding_txid: string;
  /** L1 funding output index. */
  funding_vout: number;
  /**
   * Always `"open"` today — the state-transition writer is not yet wired, so
   * don't build lifecycle logic on this field.
   */
  state: string;
  /** Always 0 today, for the same reason as `state`. */
  latest_state_num: number;
  csv_delay?: number;
  threshold?: number;
  quorum_keyset?: string[];
  user_key?: string;
}

/** Response from /tachi_listVaults. */
export interface ListVaultsResponse {
  /** Normalized 32-byte x-only pubkey hex the vaults are owned by. */
  user: string;
  vaults: VaultListItem[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

/** Pagination options shared by the list endpoints. */
export interface PageParams {
  /** 1-based page number (default 1). */
  page?: number;
  /** Entries per page (default 50, max 100). */
  page_size?: number;
}

/** Generic CometBFT JSON-RPC response wrapper. */
export interface CometRPCResponse<T = unknown> {
  id: number;
  jsonrpc: string;
  result: T;
}

/** Request body for transaction broadcast endpoints. */
export interface BroadcastTxRequest {
  tx: string;
}

/**
 * Request body for /tachi_txDecode and /tachi_txValidate.
 *
 * These two take `hex` rather than the `tx` field the broadcast endpoints use
 * — an inconsistency in the daemon, not a typo here.
 */
export interface TxHexRequest {
  hex: string;
}

/** Request body for the Bitcoin JSON-RPC proxy. */
export interface BitcoinRPCRequest {
  jsonrpc?: string;
  method: string;
  params?: unknown;
  id?: string;
}

/** Response from the Bitcoin JSON-RPC proxy. */
export interface BitcoinRPCResponse<T = unknown> {
  jsonrpc: string;
  result: T;
  error: { code: number; message: string } | null;
  id: string;
}

/** Options for querying the ABCI application. */
export interface QueryParams {
  path: string;
  data?: string;
  height?: string;
}

// ── Address ────────────────────────────────────────────────────────

/** Response from /tachi_address. */
export interface AddressResponse {
  /** Normalized 32-byte x-only public key hex. */
  pubkey: string;
  balance_sat: number;
  nonce: number;
  vtxo_count: number;
}

/** Response from /tachi_balance. */
export interface BalanceResponse {
  pubkey: string;
  balance_sat: number;
}

// ── Transactions ───────────────────────────────────────────────────

/** A transaction input. */
export interface TxVin {
  txid: string;
  vout: number;
  vtxo_id: string;
  sig_script: string;
  value_sats: number;
}

/** A transaction output. */
export interface TxVout {
  owner: string;
  amount: number;
  script: string;
}

/** CheckTx/DeliverTx result code and log. */
export interface TxStatus {
  code: number;
  log: string;
}

/** A Hash-Anchored Timestamp proof. */
export interface HATProofResponse {
  vtxo_id: string;
  proof: string;
  btc_height: number;
  btc_timestamp: number;
}

/** A transaction as returned by the list, block, and mempool endpoints. */
export interface ListTransactionItem {
  tx_hash: string;
  type: string;
  state: string;
  direction: string;
  height: number;
  block_hash: string;
  epoch: number;
  time: number;
  fee: number;
  size: number;
  vsize: number;
  weight: number;
  is_segwit: boolean;
  has_rip: boolean;
  hat?: HATProofResponse;
  vin: TxVin[];
  vout: TxVout[];
}

/** Response from /tachi_tx. */
export interface GetTransactionResponse {
  txid: string;
  txHash: string;
  type: string;
  state: string;
  hex: string;
  blockhash: string;
  epoch: number;
  time: number;
  version: number;
  size: number;
  vsize: number;
  weight: number;
  is_segwit: boolean;
  status?: TxStatus;
  hat?: HATProofResponse;
  rip?: unknown;
  vin: TxVin[];
  vout: TxVout[];
}

/** Response from /tachi_txRaw. */
export interface GetRawTransactionResponse {
  txHash: string;
  hex: string;
}

/**
 * Cursor-paginated transaction list.
 *
 * `next_before_height` is the cursor for the following page — pass it back as
 * `before_height`. A zero/absent value means there are no more pages.
 */
export interface ListTransactionsResponse {
  transactions: ListTransactionItem[];
  page_size: number;
  next_before_height: number;
  /** Height range the daemon walked to build this page. */
  scanned_from_height: number;
  scanned_to_height: number;
}

/** Response from /tachi_addressTransactions. */
export interface AddressTransactionsResponse extends ListTransactionsResponse {
  pubkey: string;
}

/** Response from /tachi_mempool. */
export interface MempoolResponse {
  count: number;
  transactions: ListTransactionItem[];
}

/** Response from /tachi_mempoolByAddress. */
export interface MempoolByAddressResponse extends MempoolResponse {
  pubkey: string;
}

/** Response from /tachi_txDecode. */
export interface TxDecodeResponse {
  tx_hash: string;
  type: string;
  pubkey: string;
  nonce: number;
  fee: number;
  version: number;
  size: number;
  vsize: number;
  weight: number;
  is_segwit: boolean;
  vin: TxVin[];
  vout: TxVout[];
}

/** Response from /tachi_txValidate. */
export interface TxValidateResponse {
  valid: boolean;
  code: number;
  log: string;
}

/** Response from /tachi_feeEstimate. */
export interface FeeEstimateResponse {
  recommended_fee_sat: number;
  avg_fee_sat: number;
  min_fee_sat: number;
}

// ── Blocks ─────────────────────────────────────────────────────────

/** Response from /tachi_block and /tachi_getBlock. */
export interface BlockResponse {
  height: number;
  hash: string;
  time: number;
  epoch: number;
  tx_count: number;
  transactions: ListTransactionItem[];
}

/** A block without its transaction bodies. */
export interface BlockSummary {
  height: number;
  hash: string;
  time: number;
  epoch: number;
  tx_count: number;
}

/** Response from /tachi_listBlocks. */
export interface ListBlocksResponse {
  blocks: BlockSummary[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

/** Response from /tachi_getBlockHash. */
export interface GetBlockHashResponse {
  height: number;
  hash: string;
}

/** Response from /tachi_getBlockHeader. */
export interface GetBlockHeaderResponse {
  height: number;
  hash: string;
  prev_hash: string;
  time: number;
  epoch: number;
}

// ── Epochs ─────────────────────────────────────────────────────────

/** Response from /tachi_epoch. */
export interface GetEpochResponse {
  height: number;
  hash: string;
  status: string;
  timestamp: number;
  tx_count: number;
  tx_hashes: string[];
  hat_count: number;
  /** Null until the epoch is anchored to a Bitcoin block. */
  bitcoin_block_height: number | null;
  /** Hex L1 settlement txid; empty until the epoch settles. */
  l1_settlement_txid: string;
}

/** Response from /tachi_listEpochs. */
export interface ListEpochsResponse {
  epochs: GetEpochResponse[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

// ── Dashboard & stats ──────────────────────────────────────────────

/** Response from /tachi_stats. */
export interface StatsResponse {
  chain_id: string;
  height: number;
  current_epoch: number;
  latest_block_time: number;
  node_count: number;
  total_accounts: number;
  total_transactions: number;
  total_supply_sat: number;
  vtxo_count: number;
}

/** Response from /tachi_supply. */
export interface SupplyResponse {
  total_supply_sat: number;
  vtxo_count: number;
}

/**
 * Response from /tachi_search.
 *
 * `type` discriminates what `result` holds — e.g. `"block"`, `"tx"`,
 * `"address"`, `"vtxo"`. Narrow on it before using `result`.
 */
export interface SearchResponse {
  type: string;
  result: unknown;
}

/** Response from /tachi_nodeInfo. */
export interface NodeInfoResponse {
  node_id: string;
  moniker: string;
  network: string;
  chain_id: string;
  version: string;
  latest_block_height: number;
  latest_block_time: number;
  epoch_blocks: number;
  peers: number;
  sync_status: string;
}

// ── Watchtower ─────────────────────────────────────────────────────

/** Response from /tachi_watchtower/status. */
export interface WatchtowerStatus {
  mode: string;
  last_scanned_height: number;
  receipt_count: number;
  sweep_threshold: number;
  bounty_configured: boolean;
}

// ── Vault refund signing ───────────────────────────────────────────

/** A refund transaction input awaiting signatures. */
export interface RefundInput {
  [key: string]: unknown;
}

/** A refund transaction output. */
export interface RefundOutput {
  [key: string]: unknown;
}

/** Request body for /tachi_signTransaction. */
export interface RefundTx {
  version: number;
  locktime: number;
  inputs: RefundInput[];
  outputs: RefundOutput[];
  userSig: string;
}

/** Response from /tachi_signTransaction. */
export interface SignTransactionResponse {
  /** The refund transaction with daemon signatures attached. */
  refund: RefundTx;
  /** Number of signatures the daemon contributed. */
  signatures: number;
}

// ── Real-time events ───────────────────────────────────────────────

/**
 * Filters for the `/tachi_ws` event stream. At least one is required — the
 * daemon rejects a filterless connection.
 */
export interface WatchFilters {
  /** Taproot address or pubkey hex: transactions crediting it. */
  address?: string;
  /** Vault address: transactions locking funds into it. */
  vault?: string;
  /** Vault ID: watchtower-observed L1 spends of its funding outpoint. */
  vaultId?: string;
  /** Every durably-committed block. */
  blocks?: boolean;
  /** Every new validator registration. */
  validators?: boolean;
}

/**
 * An event pushed over `/tachi_ws`.
 *
 * `event` discriminates the payload — `"block"`, `"tx"`, `"validator"`, and
 * watchtower spend alerts. Transaction alerts arrive twice: `state: "pending"`
 * on CheckTx acceptance, then `state: "committed"` once the block durably
 * commits. The stream is push-only; the daemon never expects client messages.
 */
export interface TachiEvent {
  event: string;
  [key: string]: unknown;
}
