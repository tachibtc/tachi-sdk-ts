# @tachibtc/tachi-sdk-ts

TypeScript SDK for the Tachi BTC daemon RPC.

## Installation

```bash
npm install @tachibtc/tachi-sdk-ts
```

## Quick Start

> **Endpoint paths:** every daemon route is namespaced under `tachi_` (e.g. `GET /tachi_status`) except `/health` and the Bitcoin JSON-RPC proxy at `POST /`. If you hand-roll `fetch` calls alongside the SDK, unprefixed paths will 404.

```ts
import { TachiClient } from "@tachibtc/tachi-sdk-ts";

const client = new TachiClient({
  baseUrl: "https://rpc-regtest.tachibtc.com", // or "https://rpc-signet.tachibtc.com"
});

// Health check
const health = await client.getHealth();
console.log(health.status, health.validators);

// Get all validators
const { validators } = await client.getValidators();

// Get live validators
const live = await client.getLiveValidators();

// VTXOs owned by an address or x-only public key
const { vtxos } = await client.getAddressVtxos("bcrt1p...");

// Vaults owned by that same user
const { vaults } = await client.listVaults("bcrt1p...");

// Broadcast a transaction
const result = await client.broadcastTxSync("deadbeef...");

// Query ABCI
const query = await client.query({ path: "/store/key" });

// Bitcoin RPC proxy
const info = await client.bitcoinRPC({ method: "getblockchaininfo" });
console.log(info.result);
```

## Documentation

- [Tutorial: Build Your First App](https://tachibtc.github.io/tachi-sdk-ts/tutorial.html) — Simple guide to get started
- [API Reference](https://tachibtc.github.io/tachi-sdk-ts/) — Full TypeDoc documentation
- [Brand Kit](https://tachibtc.github.io/tachi-sdk-ts/brand-kit.html) — Logos, colours, typography, and assets

> Docs site source lives in [tachibtc/tachi-docs-website](https://github.com/tachibtc/tachi-docs-website), not this repo.

> **Note:** Transaction hex strings do **not** use a `0x` prefix (e.g. `"deadbeef"`, not `"0xdeadbeef"`).

### Methods

| Method | Endpoint | Description |
|--------|----------|-------------|
| `getHealth()` | `GET /health` | Daemon liveness probe |
| `getStatus()` | `GET /tachi_status` | Node info & sync status |
| `getPeerInfo()` | `GET /tachi_peerInfo` | This node's peer info |
| `getValidators()` | `GET /tachi_validators` | All known validators |
| `getValidatorCount()` | `GET /tachi_validators/count` | Validator count |
| `getLiveValidators()` | `GET /tachi_validators/live` | Currently connected validators |
| `waitForValidatorsReady(expected?)` | `GET /tachi_validators/ready` | Long-poll until validators ready |
| `getNetInfo()` | `GET /tachi_netInfo` | Network connection info |
| `getVtxo(id)` | `GET /tachi_vtxo` | Look up one VTXO by hex ID |
| `listVtxos(params?)` | `GET /tachi_listVtxos` | Paginated list of all VTXOs |
| `getAddressVtxos(address, includeSpent?)` | `GET /tachi_addressVtxos` | VTXOs owned by an address/pubkey |
| `getLockedVtxos(vault)` | `GET /tachi_vtxoLocked` | VTXOs locked to a vault |
| `listVaults(user, options?)` | `GET /tachi_listVaults` | Paginated list of a user's vaults |
| `broadcastTxAsync(tx)` | `POST /tachi_txBroadcastAsync` | Broadcast tx (fire & forget) |
| `broadcastTxSync(tx)` | `POST /tachi_txBroadcastSync` | Broadcast tx (wait for CheckTx) |
| `query(params)` | `GET /tachi_query` | ABCI query |
| `bitcoinRPC(request)` | `POST /` | Bitcoin JSON-RPC proxy |
| `getAddress(address)` | `GET /tachi_address` | Balance, nonce & VTXO count |
| `getBalance(address)` | `GET /tachi_balance` | Spendable balance |
| `getNonce(address)` | `GET /tachi_nonce` | Current transaction nonce |
| `getAddressTransactions(address, opts?)` | `GET /tachi_addressTransactions` | Address history (**slow — see below**) |
| `getTransaction(hash, opts?)` | `GET /tachi_tx` | Transaction by hash, optional HAT/RIP proofs |
| `getRawTransaction(hash)` | `GET /tachi_txRaw` | Raw transaction hex |
| `listTransactions(opts?)` | `GET /tachi_listTransactions` | Recent transactions (**slow — see below**) |
| `getMempool()` | `GET /tachi_mempool` | Pending transactions |
| `getMempoolByAddress(address)` | `GET /tachi_mempoolByAddress` | Pending transactions for an address |
| `decodeTransaction(tx)` | `POST /tachi_txDecode` | Decode raw hex without broadcasting |
| `validateTransaction(tx)` | `POST /tachi_txValidate` | Validate raw hex without broadcasting |
| `getFeeEstimate()` | `GET /tachi_feeEstimate` | Recommended / avg / min fee |
| `getBlockByHeight(height)` | `GET /tachi_block` | Block with transactions |
| `getBlock({height\|hash})` | `GET /tachi_getBlock` | Block by height or hash |
| `getBlockHash(height)` | `GET /tachi_getBlockHash` | Block hash at a height |
| `getBlockHeader({height\|hash})` | `GET /tachi_getBlockHeader` | Header only |
| `listBlocks(params?)` | `GET /tachi_listBlocks` | Paginated block list |
| `getEpoch({id\|hash})` | `GET /tachi_epoch` | Epoch by id or hash |
| `listEpochs(params?)` | `GET /tachi_listEpochs` | Paginated epoch list |
| `getStats()` | `GET /tachi_stats` | Chain-wide counters |
| `getSupply()` | `GET /tachi_supply` | Total supply & VTXO count |
| `search(q)` | `GET /tachi_search` | Resolve height/hash/address/VTXO |
| `getNodeInfo()` | `GET /tachi_nodeInfo` | Node identity & sync status |
| `getConsensusState()` | `GET /tachi_consensusState` | CometBFT consensus dump |
| `getValidatorsPower()` | `GET /tachi_validatorsPower` | Voting power distribution |
| `getWatchtowerStatus()` | `GET /tachi_watchtower/status` | Watchtower mode & scan progress |
| `getWatchtowerReceipts(opts?)` | `GET /tachi_watchtower/receipts` | Observed L1 vault spends |
| `signTransaction(refund)` | `POST /tachi_signTransaction` | Quorum co-sign a vault refund |
| `evmCall(request)` | `POST /tachi_evmCall` | Read-only EVM call, or deploy gas estimate |
| `getEvmCode(address)` | `GET /tachi_evmCode` | Runtime code at an EVM address |
| `getEvmReceipt(hash)` | `GET /tachi_evmReceipt` | Receipt of a deploy or call |
| `getEvmNonce(pubKey)` | `GET /tachi_nonce` | Nonce to sign the next EVM tx with |
| `sendEvmTx(tx)` | `POST /tachi_txBroadcastSync` | Broadcast a signed EVM tx |
| `watch(filters, opts?)` | `WS /tachi_ws` | Live event stream |

> **Note:** every endpoint except `/health` and the Bitcoin RPC proxy is namespaced under `tachi_`. SDK versions before 0.2.0 used unprefixed paths and will 404 against current daemons.

This covers all 50 daemon routes except `POST /tachi_validators/register`, which is documented below.

### Live events

`watch()` streams daemon events over WebSocket. At least one filter is required — the daemon rejects a filterless connection.

```ts
const ac = new AbortController();
setTimeout(() => ac.abort(), 30_000);

for await (const ev of client.watch({ blocks: true }, { signal: ac.signal })) {
  if (ev.event === "block") console.log(ev.block);
}
```

Filters: `address`, `vault`, `vaultId`, `blocks`, `validators`. Transaction alerts arrive **twice** — `state: "pending"` when CheckTx accepts, then `state: "committed"` once the block durably commits.

Leaving the loop by any means (`break`, `return`, throw, or aborting the signal) closes the socket, so there's no separate teardown call.

This uses the global `WebSocket`, which Node provides natively from **v22** — hence this package's `engines` floor. To run on an older runtime or supply a browser/test implementation, pass `options.WebSocket`.

**Backpressure.** Events arriving while your loop body is busy are buffered, bounded by `maxQueuedEvents` (default 10,000). Past that the stream throws rather than growing without limit — a consumer that can't keep up is a real problem, and silently dropping events would hide it as a gap that looks like the daemon never sent them. Buffered events are still delivered before the error surfaces. Set to `0` to disable the bound.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `signal` | `AbortSignal` | — | Abort to stop the stream and close the socket |
| `WebSocket` | `typeof WebSocket` | `globalThis.WebSocket` | Custom implementation |
| `maxQueuedEvents` | `number` | `10000` | Buffer bound; `0` disables |

### Slow endpoints

`getAddressTransactions()` and `listTransactions()` are **full-chain scans** — the daemon has no address index and walks every block. On a ~115k-block regtest chain, fetching an address with 2 matching transactions took ~17 seconds, and `listTransactions()` with no `pageSize` exceeded an 8-second timeout.

Always pass `pageSize`, and page backwards with the `next_before_height` cursor rather than requesting a full history:

```ts
let cursor: number | undefined;
do {
  const page = await client.getAddressTransactions(addr, { pageSize: 25, beforeHeight: cursor });
  handle(page.transactions);
  cursor = page.next_before_height || undefined;
} while (cursor);
```

### EVM contracts

Contracts run on the EVM. A `TxDeploy` or `TxCall` spends your VTXOs to pay for gas. You set aside `gasLimit` at `gasPrice` (in millisats per gas), and whatever goes unused comes back to you as a refund VTXO.

The SDK builds, encodes and hashes these transactions without any runtime dependencies. Signing is up to you: pass any BIP-340 Schnorr signer. This example uses `@noble/curves`:

```ts
import { schnorr } from "@noble/curves/secp256k1";
import {
  TachiClient, buildDeployTx, buildCallTx, signEVMTx, evmTxHash,
  evmAddressFromPubKey, contractAddress, maxGasFeeSats,
} from "@tachibtc/tachi-sdk-ts";

const client = new TachiClient({ baseUrl: "http://127.0.0.1:26670" });
const pubKey = Buffer.from(schnorr.getPublicKey(privateKey)).toString("hex");
const signer = (sigHash: Uint8Array) => schnorr.sign(sigHash, privateKey);
const me = evmAddressFromPubKey(pubKey); // your msg.sender

// 1. Size the gas: simulate the deploy and add headroom.
const sim = await client.evmCall({ from: me, data: initCode });
const gasLimit = BigInt(Math.ceil(sim.gas_used * 1.2));

// 2. Build, sign and send. Inputs must cover the outputs plus maxGasFeeSats.
const nonce = await client.getEvmNonce(pubKey);
const deploy = buildDeployTx({
  inputs: [vtxoId], outputs: [{ owner: pubKey, amount: change }],
  pubKey, nonce, gasLimit, gasPrice: 1n, initCode,
});
console.log("sets aside", maxGasFeeSats(deploy), "sats for gas");
const signed = await signEVMTx(deploy, signer);
await client.sendEvmTx(signed);

// 3. Once it is in a block, read the receipt.
const receipt = await client.getEvmReceipt(await evmTxHash(signed));
if (receipt.status !== 1) throw new Error(receipt.error);
const token = receipt.contract_address; // also contractAddress(me, nonce)

// Calls work the same way with buildCallTx({ ..., to: token, data }).
// Reads need no transaction:
const res = await client.evmCall({ from: me, to: token, data: balanceOfCalldata });
```

Use any ABI library (viem, ethers) to build `initCode` and calldata, and to decode `return_data` and logs.

Things to know:

- **Status 0 still costs you.** A reverted or out-of-gas transaction still applied: its inputs were spent, its gas was charged and its nonce was used. Always check the receipt's `status`, not just the broadcast result code. A failed deploy still reports a `contract_address`.
- **The refund VTXO is not in `outputs`.** It sits at the output index right after your outputs. `refundVtxoId(signed)` gives its ID. It only exists if some gas went unused.
- **Use `getEvmNonce`.** It returns the nonce to sign with. The raw `/tachi_nonce` response also has a `next_nonce` field, which is one higher, so don't sign with that.
- **No native BTC in contracts yet.** Every balance reads zero, and any call or deploy that sends value fails. Tokens like ERC-20 keep their balances in contract storage, so they work fine.
- The EVM chain ID is `EVM_CHAIN_ID` (`0x54434849`). Use it in EIP-712 domains.

### Client options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `baseUrl` | `string` | — | Base URL of the Tachi daemon RPC |
| `fetch` | `fetch` | `globalThis.fetch` | Custom fetch implementation |
| `timeoutMs` | `number` | `30000` | Per-request timeout in ms. `0` disables |
| `maxResponseBytes` | `number` | `67108864` (64 MiB) | Reject responses larger than this. `0` disables |

### Errors

Failed requests reject with the daemon's own explanation appended, not just the status line:

```
GET /tachi_addressVtxos failed: 400 Bad Request — address "bc1q…" is not a taproot (P2TR) address — use a raw pubkey hex or a bc1p/tb1p/bcrt1p address
```

Timeouts and transport failures name the endpoint and host, and keep the original error as `cause`:

```
GET /health timed out after 30000ms (rpc-regtest.tachibtc.com)
```

> **A resolved promise is not always success.** `query()`, `broadcastTxAsync()`, `broadcastTxSync()`, and `bitcoinRPC()` pass through protocols that report failures *inside* an HTTP 200. Check `result.response.code` / `result.code` (with `result.log`) for the CometBFT calls, and `error !== null` for `bitcoinRPC()`. Only HTTP-level failures reject.

Validator registration (`POST /tachi_validators/register`) is intentionally **not** exposed by the SDK, and deliberately stays that way.

It is a bootstrap-node-internal endpoint for validators joining the network. Its allowlist and signature checks exist to prevent registration-flood abuse, and shipping a convenient SDK wrapper would invite exactly that. This is a deliberate exclusion, not a coverage gap — please don't add it in a future "complete the coverage" pass.

Operators who legitimately need it should call it directly. The signature is BIP-340 Schnorr over:

```
sha256("tachi-register-v1\n" + lowercase(pub_key_hex) + "\n" + peer_id + "\n" + host + "\n" + p2p_port + "\n" + rpc_addr + "\n" + timestamp)
```

`listVaults` redacts each vault's reconstruction parameters (`csv_delay`, `threshold`, `quorum_keyset`, `user_key`) unless you pass an `apiKey`:

```ts
const { vaults } = await client.listVaults(pubkeyHex, { apiKey: process.env.TACHI_API_KEY });
```

## Development

```bash
npm install
npm run build
npm run docs    # Generate TypeDoc documentation
npm test        # Run tests
```

## License

MIT
