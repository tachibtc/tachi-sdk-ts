---
sidebar_position: 2
title: Getting Started (Go)
---

# Tachi SDK for Go

Go SDK for the Tachi BTC daemon RPC.

## Installation

```bash
go get github.com/tachibtc/tachi-sdk-go
```

## Quick Start

```go
package main

import (
	"context"
	"fmt"
	"log"

	"github.com/tachibtc/tachi-sdk-go/tachi"
)

func main() {
	c, err := tachi.NewClient(
		tachi.WithBaseURL("https://rpc-regtest.tachibtc.com"), // or "https://rpc-signet.tachibtc.com"
	)
	if err != nil {
		log.Fatal(err)
	}

	ctx := context.Background()

	// Health check
	health, _, err := c.Node.Health(ctx)
	if err != nil {
		log.Fatal(err)
	}
	fmt.Println(health.Status, health.Validators)

	// Get all validators
	validators, _, err := c.Validators.List(ctx)
	if err != nil {
		log.Fatal(err)
	}
	fmt.Println(validators.Validators)

	// Broadcast a transaction (hex-encoded, no 0x prefix)
	result, _, err := c.Tx.BroadcastSync(ctx, "deadbeef...")
	if err != nil {
		log.Fatal(err)
	}
	fmt.Println(result)

	// Bitcoin RPC proxy
	info, _, err := c.Bitcoin.RPC(ctx, "getblockchaininfo", nil)
	if err != nil {
		log.Fatal(err)
	}
	fmt.Println(string(info))
}
```

`tachi.NewClient()` with no options defaults to the public Tachi regtest & signet daemon. Pass `WithBaseURL` to target a local or private node, e.g. `https://rpc-regtest.tachibtc.com or https://rpc-signet.tachibtc.com`.

:::info
Transaction hex strings do **not** use a `0x` prefix. Use `"deadbeef"`, not `"0xdeadbeef"`.
:::

## Client Options

`tachi.NewClient()` accepts optional `ClientOption` parameters, all combinable:

- `WithBaseURL(rawURL string)` — point the client at a different daemon (defaults to the public regtest daemon)
- `WithAPIKey(key string)` — attach `X-Api-Key` for privileged operations (see [API Reference](./go-api-reference#auth-model))
- `WithHTTPClient(hc *http.Client)` — override the default HTTP client (30s timeout, no retries)
- `WithUserAgent(ua string)` — override the default `tachi-sdk-go/<Version>` User-Agent

Every service method returns `(result, *tachi.Response, error)`, matching standard Go API client conventions.

## What's in this SDK?

The SDK provides a typed client for every route in the daemon's swagger spec, grouped into services:

- **Node** — health, info, status, net info, consensus state, raw ABCI query
- **Validators** — bootstrap registry list, live, count, ready, this node's peer info
- **Block / Epoch** — Tachi-chain block and epoch lookups
- **Tx / VTXO / Vault** — transaction, VTXO, and vault lookups, decode/validate/broadcast
- **Address** — account-scoped balance, nonce, VTXOs, transaction history, mempool
- **Dashboard** — aggregate stats, supply, search
- **Bitcoin** — pass-through Bitcoin Core JSON-RPC proxy
- **Sign** — cooperative-refund threshold-signing ceremony
- **Watchtower** — vault breach detection status and receipts
- **WS** — live event subscriptions over WebSocket

See the [Go API Reference](./go-api-reference) for full method signatures and response shapes, or the [Go package reference](https://pkg.go.dev/github.com/tachibtc/tachi-sdk-go/tachi) on pkg.go.dev.
