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
