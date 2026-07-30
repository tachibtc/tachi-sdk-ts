---
sidebar_position: 3
title: API Reference
---

# API Reference

## TachiClient

### Constructor

```ts
import { TachiClient } from "@tachibtc/sdk";

const client = new TachiClient({
  baseUrl: "https://rpc-devnet.tachibtc.com",
  timeoutMs: 30000, // optional, default 30s
});
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `baseUrl` | `string` | — | Base URL of the Tachi daemon RPC |
| `fetch` | `fetch` | `globalThis.fetch` | Custom fetch implementation |
| `timeoutMs` | `number` | `30000` | Request timeout in ms. Set to `0` to disable |

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

`POST /tachi_validators/register` is **not** exposed by the SDK. The daemon requires a BIP-340 Schnorr signature over a canonical register digest whose construction isn't described by the OpenAPI spec, so the SDK can't build a correct request. Call the endpoint directly until that's documented.

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
