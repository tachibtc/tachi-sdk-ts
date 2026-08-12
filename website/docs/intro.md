---
slug: /
sidebar_position: 1
title: Getting Started
---

# Tachi SDK

TypeScript SDK for the Tachi BTC daemon RPC.

## Installation

```bash
npm install @tachibtc/tachi-sdk-ts
```

## Quick Start

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

// Broadcast a transaction (hex-encoded, no 0x prefix)
const result = await client.broadcastTxSync("deadbeef...");

// Bitcoin RPC proxy
const info = await client.bitcoinRPC({ method: "getblockchaininfo" });
console.log(info.result);
```

:::info
Transaction hex strings do **not** use a `0x` prefix. Use `"deadbeef"`, not `"0xdeadbeef"`.
:::

## What's in this SDK?

The SDK provides a typed client for all 13 Tachi daemon RPC endpoints:

- **Health & Status** — node health, sync status
- **Validators** — list, count, live, register
- **Network** — peer info, net info
- **Transactions** — broadcast (async/sync)
- **Queries** — ABCI queries
- **Bitcoin RPC** — proxy to underlying bitcoind
