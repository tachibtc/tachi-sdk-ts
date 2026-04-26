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

/** Response from /validators/register. */
export interface RegisterResponse {
  status: string;
  total: number;
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
