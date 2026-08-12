---
sidebar_position: 3
title: API Reference
---

# API Reference

## TachiClient

### Constructor

```ts
import { TachiClient } from "@tachibtc/tachi-sdk-ts";

const client = new TachiClient({
  baseUrl: "https://rpc-regtest.tachibtc.com", // or "https://rpc-signet.tachibtc.com"
  timeoutMs: 30000, // optional, default 30s
});
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `baseUrl` | `string` | — | Base URL of the Tachi daemon RPC |
| `fetch` | `fetch` | `globalThis.fetch` | Custom fetch implementation |
| `timeoutMs` | `number` | `30000` | Request timeout in ms. Set to `0` to disable |
| `maxResponseBytes` | `number` | `67108864` (64 MiB) | Reject responses larger than this. Set to `0` to disable |

## Errors

Failed requests reject with the daemon's own explanation appended, not just the status line:

```
GET /tachi_addressVtxos failed: 400 Bad Request — address "bc1q…" is not a taproot (P2TR) address — use a raw pubkey hex or a bc1p/tb1p/bcrt1p address
```

Timeouts and transport failures name the endpoint and host, and keep the original error as `cause`:

```
GET /health timed out after 30000ms (rpc-regtest.tachibtc.com)
```

:::caution
A resolved promise is not always success. `query()`, `broadcastTxAsync()`, `broadcastTxSync()`, and `bitcoinRPC()` pass through protocols that report failures *inside* an HTTP 200 — check `result.response.code` / `result.code` (with `result.log`) for the CometBFT calls, and `error !== null` for `bitcoinRPC()`. Only HTTP-level failures reject.
:::

---

## Health & Status

### `getHealth()`

Liveness probe returning daemon status and validator count.

```ts
const health = await client.getHealth();
// { status: "ok", validators: 3 }
```

**Returns:** `HealthResponse`

| Field | Type | Description |
|-------|------|-------------|
| `status` | `string` | Daemon status |
| `validators` | `number` | Number of validators |

---

### `getStatus()`

Node info, sync status, and latest block height via CometBFT.

```ts
const status = await client.getStatus();
console.log(status.result);
```

**Returns:** `CometRPCResponse`

---

## Peer Info

### `getPeerInfo()`

Returns the PeerID, public key, and network addresses of this node.

```ts
const peer = await client.getPeerInfo();
// { peer_id: "abc...", pub_key_hex: "def...", host: "127.0.0.1", p2p_port: 26656, rpc_addr: "..." }
```

**Returns:** `ValidatorInfo`

| Field | Type | Description |
|-------|------|-------------|
| `peer_id` | `string` | Peer identifier |
| `pub_key_hex` | `string` | Public key (hex) |
| `host` | `string` | Host address |
| `p2p_port` | `number` | P2P port |
| `rpc_addr` | `string` | RPC address |

---

## Validators

### `getValidators()`

All validators from bootstrap registry merged with KDHT-discovered validators.

```ts
const { count, validators } = await client.getValidators();
```

**Returns:** `ValidatorsResponse`

| Field | Type | Description |
|-------|------|-------------|
| `count` | `number` | Total validator count |
| `validators` | `ValidatorInfo[]` | Validator list |

---

### `getValidatorCount()`

Number of validators in the bootstrap registry.

```ts
const { count } = await client.getValidatorCount();
```

**Returns:** `ValidatorCountResponse`

---

### `getLiveValidators()`

Validators whose peers are currently connected via the overlay network.

```ts
const live = await client.getLiveValidators();
console.log(`${live.count} of ${live.total_known} online`);
```

**Returns:** `LiveValidatorsResponse`

| Field | Type | Description |
|-------|------|-------------|
| `count` | `number` | Live validator count |
| `total_known` | `number` | Total known validators |
| `validators` | `ValidatorInfo[]` | Live validator list |

---

### `waitForValidatorsReady(expected?)`

Long-polls until the expected number of validators have registered or a 60-second timeout expires.

```ts
const ready = await client.waitForValidatorsReady(3);
console.log(ready.ready); // true or false
```

**Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `expected` | `number` | `2` | Number of expected validators |

**Returns:** `ReadyResponse`

---

### Validator registration

`POST /tachi_validators/register` is **not** exposed by the SDK, and deliberately stays that way.

:::warning Deliberate exclusion, not a coverage gap
This is a bootstrap-node-internal endpoint for validators joining the network. Its allowlist and signature checks exist to prevent registration-flood abuse, and a convenient SDK wrapper would invite exactly that. Please don't add it in a future "complete the coverage" pass.
:::

Operators who legitimately need it should call it directly. The signature is BIP-340 Schnorr over:

```
sha256("tachi-register-v1\n" + lowercase(pub_key_hex) + "\n" + peer_id + "\n" + host + "\n" + p2p_port + "\n" + rpc_addr + "\n" + timestamp)
```

---

## VTXOs

### `getVtxo(id)`

Look up a single VTXO by its 32-byte hex ID.

```ts
const vtxo = await client.getVtxo("5e43129f...");
// { id, owner, amount, script, height, spent }
```

**Returns:** `VTXOResponse`

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Hex-encoded 32-byte VTXO identifier |
| `owner` | `string` | Hex-encoded owner public key |
| `amount` | `number` | Value in satoshis |
| `script` | `string` | Hex-encoded locking script |
| `height` | `number` | Block height the VTXO was created at |
| `spent` | `boolean` | True once consumed by a confirmed transaction |

---

### `listVtxos(params?)`

Paginated list of all VTXOs (unspent and spent), sorted by height descending.

```ts
const { vtxos, total, total_pages } = await client.listVtxos({ page: 1, page_size: 50 });
```

**Parameters:** `PageParams`

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `page` | `number` | `1` | 1-based page number |
| `page_size` | `number` | `50` | Entries per page (max 100) |

**Returns:** `ListVTXOsResponse` — `{ vtxos, page, page_size, total, total_pages }`

---

### `getAddressVtxos(address, includeSpent?)`

VTXOs owned by an address or public key. Unspent only by default.

```ts
const { pubkey, count, vtxos } = await client.getAddressVtxos("bcrt1p...");
const all = await client.getAddressVtxos("bcrt1p...", true); // include spent
```

**Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `address` | `string` | — | Taproot address (`bc1p`/`tb1p`/`bcrt1p`) or public key hex (32 or 33 bytes) |
| `includeSpent` | `boolean` | `false` | Include spent VTXOs |

**Returns:** `AddressVTXOsResponse` — items are `VTXOItem`, which adds `locked` and an optional `vault_address` (present only when `locked` is true).

---

### `getLockedVtxos(vault)`

All VTXOs locked to a given vault.

```ts
const { vault, count, vtxos } = await client.getLockedVtxos("bcrt1p...");
```

**Returns:** `LockedVTXOsResponse`

---

## Vaults

### `listVaults(user, options?)`

Paginated list of vaults owned by a user.

```ts
const { vaults, total } = await client.listVaults("bcrt1p...");

// With an API key, the reconstruction params are included
const full = await client.listVaults("bcrt1p...", { apiKey: process.env.TACHI_API_KEY });
```

**Parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `user` | `string` | — | Taproot address or public key hex |
| `options.page` | `number` | `1` | 1-based page number |
| `options.page_size` | `number` | `50` | Entries per page (max 100) |
| `options.apiKey` | `string` | — | Sent as `X-Api-Key` |

**Returns:** `ListVaultsResponse` — vaults are `VaultListItem`:

| Field | Type | Description |
|-------|------|-------------|
| `vault_id` | `string` | Hex VaultID = H(funding_txid \|\| vout) |
| `address` | `string` | bech32m P2TR vault address; also the `?vault=` websocket filter key |
| `funding_txid` | `string` | Hex L1 funding txid |
| `funding_vout` | `number` | L1 funding output index |
| `state` | `string` | Always `"open"` today |
| `latest_state_num` | `number` | Always `0` today |
| `csv_delay`, `threshold`, `quorum_keyset`, `user_key` | optional | Reconstruction params — omitted unless a valid `apiKey` is supplied |

:::caution
`state` is always `"open"` and `latest_state_num` always `0` — the state-transition writer isn't wired yet. Don't build vault lifecycle logic on these fields.
:::

---

## Network

### `getNetInfo()`

Listening addresses, connected peer count, and per-peer connection info via CometBFT.

```ts
const netInfo = await client.getNetInfo();
```

**Returns:** `CometRPCResponse`

---

## Transactions

### `broadcastTxAsync(tx)`

Broadcast a hex-encoded transaction. Returns immediately without waiting for CheckTx.

```ts
const result = await client.broadcastTxAsync("deadbeef");
```

:::caution
Transaction hex strings do **not** use a `0x` prefix.
:::

**Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `tx` | `string` | Hex-encoded transaction bytes |

**Returns:** `CometRPCResponse`

---

### `broadcastTxSync(tx)`

Broadcast a hex-encoded transaction. Waits for CheckTx to complete before responding.

```ts
const result = await client.broadcastTxSync("deadbeef");
console.log(result.result);
```

**Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `tx` | `string` | Hex-encoded transaction bytes |

**Returns:** `CometRPCResponse`

---

## Queries

### `query(params)`

Forward a query to the CometBFT ABCI application.

```ts
const result = await client.query({
  path: "/store/key",
  data: "0xab",    // optional, hex-encoded
  height: "100",   // optional
});
```

**Parameters:** `QueryParams`

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `path` | `string` | Yes | ABCI query path |
| `data` | `string` | No | Hex-encoded query data |
| `height` | `string` | No | Block height to query at |

**Returns:** `CometRPCResponse`

---

## Bitcoin RPC

### `bitcoinRPC(request)`

Forward a JSON-RPC 1.0 request to the underlying bitcoind. Any method exposed by the Bitcoin node is reachable.

```ts
const info = await client.bitcoinRPC({ method: "getblockchaininfo" });
console.log(info.result);

const block = await client.bitcoinRPC({
  method: "getblock",
  params: ["<block-hash>"],
});
```

:::warning
This proxies **any** Bitcoin RPC method, including privileged ones like `sendtoaddress`, `dumpprivkey`, and `stop`. Ensure the daemon's RPC is properly access-controlled.
:::

**Parameters:** `BitcoinRPCRequest`

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `method` | `string` | — | Bitcoin RPC method name |
| `params` | `unknown` | `[]` | Method parameters |
| `jsonrpc` | `string` | `"1.0"` | JSON-RPC version |
| `id` | `string` | `"tachi-sdk"` | Request ID |

**Returns:** `BitcoinRPCResponse<T>`

| Field | Type | Description |
|-------|------|-------------|
| `result` | `T` | RPC result |
| `error` | `{code, message} \| null` | Error if any |
| `id` | `string` | Request ID |

---

## Address

### `getAddress(address)` / `getBalance(address)` / `getNonce(address)`

Balance, nonce, and VTXO count for a Taproot address or public key hex.

```ts
const { balance_sat, nonce, vtxo_count } = await client.getAddress("bcrt1p...");
```

**Returns:** `AddressResponse` / `BalanceResponse` / `Record<string, unknown>`

---

### `getAddressTransactions(address, options?)`

Transactions involving an address, newest first.

:::danger Full-chain scan
The daemon has no address index and walks every block. Measured at ~17s on a ~115k-block chain for an address with 2 matching transactions. Always pass `pageSize` and page with the `next_before_height` cursor.
:::

```ts
let cursor: number | undefined;
do {
  const page = await client.getAddressTransactions(addr, { pageSize: 25, beforeHeight: cursor });
  handle(page.transactions);
  cursor = page.next_before_height || undefined;
} while (cursor);
```

**Returns:** `AddressTransactionsResponse`

---

## Transactions

### `getTransaction(hash, options?)`

| Option | Type | Description |
|--------|------|-------------|
| `hat` | `boolean` | Include the Hash-Anchored Timestamp proof |
| `rip` | `boolean` | Include the RIP payload |
| `vtxoId` | `string` | Scope the HAT proof to one VTXO |
| `originEpoch` / `finalEpoch` | `number` | Epoch bounds for proof lookup |

**Returns:** `GetTransactionResponse`

### `getRawTransaction(hash)` — `GetRawTransactionResponse`
### `listTransactions(options?)` — `ListTransactionsResponse` (same full-chain-scan caveat)
### `getMempool()` / `getMempoolByAddress(address)` — `MempoolResponse` / `MempoolByAddressResponse`
### `getFeeEstimate()` — `FeeEstimateResponse`

### `decodeTransaction(tx)` / `validateTransaction(tx)`

Decode or validate raw hex without broadcasting.

:::note
These two endpoints take a `hex` body field, unlike the broadcast endpoints which take `tx`. The SDK handles this — pass the hex string either way.
:::

`decodeTransaction` **rejects** on undecodable input (HTTP 400). `validateTransaction` **resolves** with `valid: false` instead — check the field, don't rely on the promise.

---

## Blocks

### `getBlockByHeight(height)` — `BlockResponse`
### `getBlock({ height | hash })` — `BlockResponse`
### `getBlockHash(height)` — `GetBlockHashResponse`
### `getBlockHeader({ height | hash })` — `GetBlockHeaderResponse`
### `listBlocks(params?)` — `ListBlocksResponse`

`getBlock` and `getBlockHeader` throw before making a request if given neither a height nor a hash.

---

## Epochs

### `getEpoch({ id | hash })`

Requires **exactly one** of `id` or `hash` — there is no "current epoch" form. Use `getStats().current_epoch` to find the latest id. Throws locally if given neither or both.

### `listEpochs(params?)` — `ListEpochsResponse`

:::note
`bitcoin_block_height` is `null` until the epoch is anchored to a Bitcoin block.
:::

---

## Dashboard & stats

### `getStats()` — `StatsResponse`
### `getSupply()` — `SupplyResponse`
### `getNodeInfo()` — `NodeInfoResponse`
### `getConsensusState()` / `getValidatorsPower()` — `CometRPCResponse`

### `search(q)`

Resolve a height, hash, address, or VTXO id. Narrow on the returned `type` before using `result`.

```ts
const hit = await client.search("229917");
if (hit.type === "block") { /* hit.result is a block */ }
```

---

## Watchtower

### `getWatchtowerStatus()` — `WatchtowerStatus`
### `getWatchtowerReceipts({ vault?, state? })` — observed L1 spends of vault funding outpoints

---

## Vault refund signing

### `signTransaction(refund)`

Ask the daemon's quorum to co-sign a vault refund transaction.

**Parameters:** `RefundTx` — the refund carrying the user's signature
**Returns:** `SignTransactionResponse` — `{ refund, signatures }`

---

## Live events

### `watch(filters, options?)`

Async generator over the daemon's WebSocket push stream.

```ts
const ac = new AbortController();
for await (const ev of client.watch({ blocks: true }, { signal: ac.signal })) {
  console.log(ev.event, ev);
}
```

| Filter | Type | Pushes |
|--------|------|--------|
| `address` | `string` | Transactions crediting the address |
| `vault` | `string` | Transactions locking funds into the vault |
| `vaultId` | `string` | Watchtower-observed L1 spends of the vault's funding outpoint |
| `blocks` | `boolean` | Every durably-committed block |
| `validators` | `boolean` | Every new validator registration |

At least one filter is required; `watch()` throws before opening a socket otherwise.

Transaction alerts arrive **twice** — `state: "pending"` on CheckTx acceptance, then `state: "committed"` once the block commits. The stream is push-only; the daemon never expects client messages.

Leaving the loop by any means closes the socket — no separate teardown call.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `signal` | `AbortSignal` | — | Abort to stop the stream and close the socket |
| `WebSocket` | `typeof WebSocket` | `globalThis.WebSocket` | Custom implementation |
| `maxQueuedEvents` | `number` | `10000` | Buffer bound while the consumer is busy; `0` disables |

:::caution Node 22+
Uses the global `WebSocket`, native in Node from v22 (this package's `engines` floor). Pass `options.WebSocket` to supply your own implementation for older runtimes, browsers, or tests.
:::

:::note Backpressure
Events arriving between iterations are buffered up to `maxQueuedEvents`. Past that the stream throws rather than growing without bound — mirroring `maxResponseBytes` for HTTP responses. Already-buffered events are delivered before the error surfaces, so nothing legitimately received is discarded.
:::
