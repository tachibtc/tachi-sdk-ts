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
  baseUrl: "https://rpc-regtest.tachibtc.com", // or "https://rpc-signet.tachibtc.com"
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

### `registerValidator(info)`

Register a validator with this bootstrap node.

```ts
await client.registerValidator({
  peer_id: "abc",
  pub_key_hex: "def",
  host: "127.0.0.1",
  p2p_port: 26656,
  rpc_addr: "http://localhost:26657",
});
```

**Parameters:** `ValidatorInfo`

**Returns:** `RegisterResponse` — `{ status: string, total: number }`

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
