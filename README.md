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

// Broadcast a transaction
const result = await client.broadcastTxSync("deadbeef...");

// Query ABCI
const query = await client.query({ path: "/store/key" });

// Bitcoin RPC proxy
const info = await client.bitcoinRPC({ method: "getblockchaininfo" });
console.log(info.result);
```

## API Reference

Full API documentation is available at the [GitHub Pages site](https://tachibtc.github.io/tachi-sdk-ts/).

### Methods

| Method | Endpoint | Description |
|--------|----------|-------------|
| `getHealth()` | `GET /health` | Daemon liveness probe |
| `getStatus()` | `GET /status` | Node info & sync status |
| `getPeerInfo()` | `GET /peer-info` | This node's peer info |
| `getValidators()` | `GET /validators` | All known validators |
| `getValidatorCount()` | `GET /validators/count` | Validator count |
| `getLiveValidators()` | `GET /validators/live` | Currently connected validators |
| `waitForValidatorsReady(expected?)` | `GET /validators/ready` | Long-poll until validators ready |
| `registerValidator(info)` | `POST /validators/register` | Register a validator |
| `getNetInfo()` | `GET /net-info` | Network connection info |
| `broadcastTxAsync(tx)` | `POST /tx/broadcast/async` | Broadcast tx (fire & forget) |
| `broadcastTxSync(tx)` | `POST /tx/broadcast/sync` | Broadcast tx (wait for CheckTx) |
| `query(params)` | `GET /query` | ABCI query |
| `bitcoinRPC(request)` | `POST /` | Bitcoin JSON-RPC proxy |

## Development

```bash
npm install
npm run build
npm run docs    # Generate TypeDoc documentation
npm test        # Run tests
```

## License

MIT
