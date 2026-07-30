# @tachibtc/sdk

TypeScript SDK for the Tachi BTC daemon RPC.

## Installation

```bash
npm install @tachibtc/sdk
```

## Quick Start

```ts
import { TachiClient } from "@tachibtc/sdk";

const client = new TachiClient({
  baseUrl: "https://rpc-devnet.tachibtc.com",
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

> **Note:** every endpoint except `/health` and the Bitcoin RPC proxy is namespaced under `tachi_`. SDK versions before 0.2.0 used unprefixed paths and will 404 against current daemons.

Validator registration (`POST /tachi_validators/register`) is intentionally **not** exposed by the SDK. It requires a BIP-340 Schnorr signature over a canonical digest whose construction the daemon's OpenAPI spec doesn't describe, so the SDK can't build a correct request. Call the endpoint directly until that's documented.

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
