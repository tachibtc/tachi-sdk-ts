---
sidebar_position: 4
title: API Reference (Go)
---

# Go API Reference

A complete reference for `tachi-sdk-go`: the auth model, error handling, pagination, and every service method with its signature, request/response shapes, and a usage example.

## Client construction

```go
c, err := tachi.NewClient(
    tachi.WithBaseURL("https://rpc-regtest.tachibtc.com"), // or https://rpc-signet.tachibtc.com for signet
    tachi.WithAPIKey(os.Getenv("TACHI_API_KEY")),
)
```

| Option | Effect |
|---|---|
| `WithBaseURL(url string)` | Point at a non-default daemon. Defaults to `https://rpc-regtest.tachibtc.com/`. |
| `WithAPIKey(key string)` | Send `X-Api-Key` on every request (see [Auth model](#auth-model)). |
| `WithHTTPClient(hc *http.Client)` | Use a custom `*http.Client` — custom TLS config, proxy, timeouts, or a retry-wrapped `RoundTripper`. The SDK itself never retries. |
| `WithUserAgent(ua string)` | Override the default `tachi-sdk-go/<Version>` User-Agent. |

`NewClient` validates the base URL eagerly and returns an error instead of a usable client on failure:
- scheme must be `http` or `https`
- if an API key is set, the URL must be `https` unless the host is loopback (`localhost`, `127.0.0.1`, `::1`) — this prevents accidentally sending a privileged key in cleartext over a network link

## Auth model

- **No key**: every read-only endpoint works — node status, blocks, epochs, transactions, VTXOs, vault listing (public fields only), address lookups, dashboard stats, and common read-only `Bitcoin.RPC` methods.
- **`WithAPIKey(key)`**: sent as `X-Api-Key` on every HTTP and WebSocket request. Required for:
  - privileged `Bitcoin.RPC` methods (wallet, admin, network-mutation)
  - the reconstruction fields on `Vault.List` items (`CSVDelay`, `Threshold`, `QuorumKeyset`, `UserKey`) — omitted from the response without a key
  - the `vaults_by_user` ABCI passthrough via `Node.Query`
  - it also raises the daemon's per-caller rate limit

There is no per-request auth override — the key is fixed at client construction. Build a second `*Client` if you need both an authenticated and an anonymous view.

## Error handling

Every service method returns `(result, *tachi.Response, error)`.

- Network/transport errors (DNS, TLS, timeout, context cancellation) come back as a plain `error` (or `ctx.Err()` if the context was already done). `resp` is `nil` in this case.
- A non-2xx HTTP response comes back as `*tachi.ErrorResponse`, wrapping the raw `*http.Response` and the daemon's plain-text error body (the daemon uses `http.Error`, not a JSON error envelope):

```go
epoch, resp, err := c.Epoch.Get(ctx, uint32(42))
if err != nil {
    var apiErr *tachi.ErrorResponse
    if errors.As(err, &apiErr) {
        fmt.Println(apiErr.Response.StatusCode, apiErr.Message)
    }
    return err
}
_ = resp // *tachi.Response wraps *http.Response — inspect headers/status on success too
```

- `Bitcoin.RPC` has a third failure mode: a bitcoind-level error (the request round-tripped fine, but bitcoind rejected it). That comes back as a plain `error` wrapping `*tachi.BitcoinRPCError` (`Code`, `Message`) — use `errors.As` to recover it.
- `Sign.Transaction` returns a 503 `*ErrorResponse` if refund signing is disabled on the daemon, or 504 if the signing threshold wasn't reached before its deadline.
- `Watchtower.Status`/`Receipts`/`Receipt` return a 503 `*ErrorResponse` if the daemon has no watchtower configured; `Receipt` returns 404 if no receipt exists at the requested state.

`*tachi.Response` is non-nil on any response the daemon actually sent (even error responses) — nil only on request-construction or transport failure.

:::caution
As with the TypeScript SDK, a `nil` error is not always success for CometBFT-proxied calls (`Tx.BroadcastSync`, `Tx.BroadcastAsync`, `Node.Query`, `Node.Status`, etc.) — those report failure *inside* an HTTP 200. Inspect `CometRPCResponse.Result` yourself.
:::

## Pagination

Two different pagination styles are used, depending on the endpoint.

**Height-cursor** (`Tx.List`, `Address.Transactions`) — newest-first, no fixed page count:

```go
var before int64 // 0 = start from the chain tip
for {
    page, _, err := c.Tx.List(ctx, &tachi.ListTransactionsOptions{BeforeHeight: before})
    if err != nil {
        log.Fatal(err)
    }
    handle(page.Transactions)
    if page.NextBeforeHeight == nil {
        break // reached genesis
    }
    before = *page.NextBeforeHeight
}
```

**Page-number** (`Block.List`, `Epoch.List`, `VTXO.List`, `Vault.List`) — pass `page`/`pageSize` as plain `int` (0 for either uses the server default: page 1, size 50, max 100):

```go
page, pageSize := 1, 50
for {
    resp, _, err := c.Block.List(ctx, page, pageSize)
    if err != nil {
        log.Fatal(err)
    }
    handle(resp.Blocks)
    if page >= resp.TotalPages {
        break
    }
    page++
}
```

## Services

The `Client` exposes one field per resource group. Every method takes `context.Context` first and respects cancellation mid-request.

---

### Node

```go
c.Node.Health(ctx) (*HealthResponse, *Response, error)
c.Node.Info(ctx) (*NodeInfoResponse, *Response, error)
c.Node.Status(ctx) (*CometRPCResponse, *Response, error)
c.Node.NetInfo(ctx) (*CometRPCResponse, *Response, error)
c.Node.ConsensusState(ctx) (*CometRPCResponse, *Response, error)
c.Node.ValidatorsPower(ctx) (*CometRPCResponse, *Response, error)
c.Node.Query(ctx, path string, opts *QueryOptions) (*CometRPCResponse, *Response, error)
```

- **`Health`** — `GET /health`. Liveness probe. `HealthResponse{Status, Validators}`.
- **`Info`** — `GET /tachi_nodeInfo`. `NodeInfoResponse{Version, ChainID, NodeID, Network, Moniker, SyncStatus, LatestBlockHeight, LatestBlockTime, EpochBlocks, Peers}`.
- **`Status`** — `GET /tachi_status`, forwards CometBFT `/status` verbatim in `CometRPCResponse.Result`.
- **`NetInfo`** — `GET /tachi_netInfo`, forwards CometBFT `net_info` (peer connections).
- **`ConsensusState`** — `GET /tachi_consensusState`, forwards CometBFT `consensus_state` (round/step/proposer).
- **`ValidatorsPower`** — `GET /tachi_validatorsPower`, forwards CometBFT `validators` (voting power set).
- **`Query`** — `GET /tachi_query`, forwards a raw ABCI query. `path` selects the query type (`"height"`, `"nonce"`, `"supply"`, `"vtxo"`, `"utxos"`, `"all_vtxos"`, `"locked_vtxos"`, `"current_epoch"`, `"epoch_root"`, `"epoch"`, `"epochs"`, `"rip"`, `"vaults_by_user"`); `opts.DataHex` carries path-specific hex-encoded input, `opts.Height` queries historical state (`""`/`"0"` = latest).

```go
health, _, err := c.Node.Health(ctx)
fmt.Println(health.Status, health.Validators)

info, _, err := c.Node.Info(ctx)
fmt.Println(info.ChainID, info.LatestBlockHeight, info.SyncStatus)

resp, _, err := c.Node.Query(ctx, "current_epoch", nil)
```

---

### Validators

```go
c.Validators.List(ctx) (*ValidatorsResponse, *Response, error)
c.Validators.Live(ctx) (*LiveValidatorsResponse, *Response, error)
c.Validators.Count(ctx) (*ValidatorCountResponse, *Response, error)
c.Validators.Ready(ctx, expected int) (*ReadyResponse, *Response, error)
c.Validators.PeerInfo(ctx) (*ValidatorInfo, *Response, error)
```

`ValidatorInfo{PeerID, PubKeyHex, Host, P2PPort, RPCAddr}` is the shape shared by every list here and by `PeerInfo`.

- **`List`** — `GET /tachi_validators`. Merged bootstrap-registered + KDHT-discovered validator set.
- **`Live`** — `GET /tachi_validators/live`. Only validators currently connected via the overlay network. `LiveValidatorsResponse` adds `TotalKnown`.
- **`Count`** — `GET /tachi_validators/count`. Just the registry size.
- **`Ready`** — `GET /tachi_validators/ready`. Long-polls server-side (up to 60s) until `expected` validators have joined, then returns the current snapshot. Pass `0` to skip the `expected` query param.
- **`PeerInfo`** — `GET /tachi_peerInfo`. This node's own `ValidatorInfo`.

```go
list, _, err := c.Validators.List(ctx)
for _, v := range list.Validators {
    fmt.Println(v.PeerID, v.Host)
}

ready, _, err := c.Validators.Ready(ctx, 4) // block until 4 validators registered
fmt.Println(ready.Ready, ready.Count)
```

---

### Block

```go
c.Block.Get(ctx, height int64) (*BlockResponse, *Response, error)
c.Block.List(ctx, page, pageSize int) (*ListBlocksResponse, *Response, error)
c.Block.Hash(ctx, height int64) (*GetBlockHashResponse, *Response, error)
c.Block.HeaderByHeight(ctx, height int64) (*GetBlockHeaderResponse, *Response, error)
c.Block.HeaderByHash(ctx, hash string) (*GetBlockHeaderResponse, *Response, error)
c.Block.ByHeight(ctx, height int64) (*BlockResponse, *Response, error)
c.Block.ByHash(ctx, hash string) (*BlockResponse, *Response, error)
```

All Tachi-chain lookups (not Bitcoin L1) — bitcoind-analogue naming for familiarity: `Hash` ~ `getblockhash`, `HeaderBy*` ~ `getblockheader`, `ByHeight`/`ByHash` ~ `getblock`.

- **`Get`** / **`ByHeight`** — `GET /tachi_block` / `/tachi_getBlock` by height. Identical response shape: `BlockResponse{Height, Hash, Time, Epoch, TxCount, Transactions []ListTransactionItem}` — full decoded tx list included.
- **`ByHash`** — same as `ByHeight` but keyed by hex block hash.
- **`List`** — `GET /tachi_listBlocks`. `ListBlocksResponse{Blocks []BlockSummary, Total, Page, PageSize, TotalPages}` — lightweight, no tx bodies.
- **`Hash`** — `GET /tachi_getBlockHash`. Just `{Height, Hash}`.
- **`HeaderByHeight`** / **`HeaderByHash`** — `GET /tachi_getBlockHeader`. `GetBlockHeaderResponse{Height, Hash, PrevHash, Time, Epoch}` — header only, no tx list.

```go
blk, _, err := c.Block.ByHeight(ctx, 1000)
fmt.Println(blk.Hash, blk.TxCount)

page, _, err := c.Block.List(ctx, 1, 20) // first 20 blocks, newest first
for _, b := range page.Blocks {
    fmt.Println(b.Height, b.TxCount)
}

hdr, _, err := c.Block.HeaderByHash(ctx, blk.Hash)
fmt.Println(hdr.PrevHash)
```

---

### Epoch

```go
c.Epoch.Get(ctx, id uint32) (*GetEpochResponse, *Response, error)
c.Epoch.ByHash(ctx, hash string) (*GetEpochResponse, *Response, error)
c.Epoch.List(ctx, page, pageSize int) (*ListEpochsResponse, *Response, error)
```

`GetEpochResponse{Hash, Height, BitcoinBlockHeight, Status, Timestamp, TxCount, TxHashes, HATCount, L1SettlementTxID}` — `Status` is `"open"` or `"closed"`; `BitcoinBlockHeight`/`Timestamp`/`L1SettlementTxID` are unset until the epoch is L1-settled.

- **`Get`** — `GET /tachi_epoch?id=`. Look up by sequential `EpochID`.
- **`ByHash`** — `GET /tachi_epoch?hash=`. Look up by the epoch's Verkle root hash.
- **`List`** — `GET /tachi_listEpochs`. Page-number paginated, latest-first.

```go
epoch, _, err := c.Epoch.Get(ctx, 42)
fmt.Println(epoch.Status, epoch.TxCount, epoch.L1SettlementTxID)

page, _, err := c.Epoch.List(ctx, 1, 10)
for _, e := range page.Epochs {
    fmt.Println(e.Height, e.Status)
}
```

---

### Tx

```go
c.Tx.Get(ctx, hash string, opts *TxOptions) (*GetTransactionResponse, *Response, error)
c.Tx.Raw(ctx, hash string) (*GetRawTransactionResponse, *Response, error)
c.Tx.List(ctx, opts *ListTransactionsOptions) (*ListTransactionsResponse, *Response, error)
c.Tx.Mempool(ctx) (*MempoolResponse, *Response, error)
c.Tx.Decode(ctx, hexTx string) (*TxDecodeResponse, *Response, error)
c.Tx.Validate(ctx, hexTx string) (*TxValidateResponse, *Response, error)
c.Tx.BroadcastSync(ctx, hexTx string) (*CometRPCResponse, *Response, error)
c.Tx.BroadcastAsync(ctx, hexTx string) (*CometRPCResponse, *Response, error)
c.Tx.FeeEstimate(ctx) (*FeeEstimateResponse, *Response, error)
```

- **`Get`** — `GET /tachi_tx?hash=`. Looks up committed txs first, falls back to mempool. `hash` is the 40-char hex CometBFT hash. `opts.HAT` attaches the HAT commitment for the tx's first spent VTXO; `opts.RIP` additionally attaches a recursive inclusion proof and requires `opts.OriginEpoch`/`opts.FinalEpoch`.
- **`Raw`** — `GET /tachi_txRaw?hash=`. Just `{TxHash, Hex}` — no decoding.
- **`List`** — `GET /tachi_listTransactions`. Height-cursor paginated, newest-first — see [Pagination](#pagination).
- **`Mempool`** — `GET /tachi_mempool`. All pending transactions in the CometBFT unconfirmed pool.
- **`Decode`** — `POST /tachi_txDecode` `{"hex": hexTx}`. Decodes without broadcasting or checking chain state.
- **`Validate`** — `POST /tachi_txValidate` `{"hex": hexTx}`. Runs CometBFT `CheckTx` without broadcasting; `TxValidateResponse{Valid, Code, Log}`.
- **`BroadcastSync`** — `POST /tachi_txBroadcastSync` `{"tx": hexTx}`. Waits for `CheckTx` to complete.
- **`BroadcastAsync`** — `POST /tachi_txBroadcastAsync` `{"tx": hexTx}`. Returns immediately.
- **`FeeEstimate`** — `GET /tachi_feeEstimate`. `{MinFeeSat, AvgFeeSat, RecommendedFeeSat}` derived from recent blocks.

```go
tx, _, err := c.Tx.Get(ctx, txHash, &tachi.TxOptions{HAT: true})
fmt.Println(tx.Type, tx.State, tx.HAT.Proof)

valid, _, err := c.Tx.Validate(ctx, hexTx)
if !valid.Valid {
    log.Fatalf("rejected: %s", valid.Log)
}

resp, _, err := c.Tx.BroadcastSync(ctx, hexTx)

fee, _, err := c.Tx.FeeEstimate(ctx)
fmt.Println("use", fee.RecommendedFeeSat, "sat")
```

---

### VTXO

```go
c.VTXO.Get(ctx, id string) (*VTXOResponse, *Response, error)
c.VTXO.Locked(ctx, vault string) (*LockedVTXOsResponse, *Response, error)
c.VTXO.List(ctx, page, pageSize int) (*ListVTXOsResponse, *Response, error)
```

`VTXOResponse{ID, Owner, Amount, Spent, Height, Script, Locked, VaultAddress, BTCHeight, BTCTimestamp}` — `BTCHeight`/`BTCTimestamp` are the Bitcoin L1 deposit block info (unset for non-deposit VTXOs).

- **`Get`** — `GET /tachi_vtxo?id=`. Single VTXO by its 64-char hex ID.
- **`Locked`** — `GET /tachi_vtxoLocked?vault=`. All VTXOs currently locked to a vault address.
- **`List`** — `GET /tachi_listVtxos`. Page-number paginated, all VTXOs (spent and unspent), height descending.

```go
vtxo, _, err := c.VTXO.Get(ctx, vtxoID)
fmt.Println(vtxo.Amount, vtxo.Spent)

locked, _, err := c.VTXO.Locked(ctx, vaultAddress)
fmt.Println(locked.Count, "VTXOs locked to", locked.Vault)
```

---

### Vault

```go
c.Vault.List(ctx, user string, page, pageSize int) (*ListVaultsResponse, *Response, error)
```

- **`List`** — `GET /tachi_listVaults?user=`. Page-number paginated vaults owned by `user` (a public key or taproot address). `VaultListItem{VaultID, Name, State, LatestStateNum, FundingTxid, FundingVout, Address, CSVDelay, Threshold, QuorumKeyset, UserKey}` — the last four (reconstruction params) are only populated with `WithAPIKey` set to a master or vault-scoped key; omitted otherwise.

:::caution
`VaultListItem.Name` is an untrusted, opener-chosen display label — HTML-escape it before rendering in a browser, and don't interpolate it into shell commands or SQL. `State` is always `"open"` and `LatestStateNum` always `0` today — the state-transition writer isn't wired up yet.
:::

```go
vaults, _, err := c.Vault.List(ctx, userPubkeyHex, 1, 50)
for _, v := range vaults.Vaults {
    fmt.Println(v.VaultID, v.Address, v.State)
}
```

---

### Address

```go
c.Address.Get(ctx, address string) (*AddressResponse, *Response, error)
c.Address.VTXOs(ctx, address string, includeSpent bool) (*AddressVTXOsResponse, *Response, error)
c.Address.Transactions(ctx, address string, opts *AddressTransactionsOptions) (*AddressTransactionsResponse, *Response, error)
c.Address.Balance(ctx, address string) (*BalanceResponse, *Response, error)
c.Address.Nonce(ctx, address string) (*NonceResponse, *Response, error)
c.Address.Mempool(ctx, address string) (*MempoolByAddressResponse, *Response, error)
```

`address` accepts a public key or taproot address (`bc1p`/`tb1p`/`bcrt1p`, or 32/33-byte hex) throughout this service.

- **`Get`** — `GET /tachi_address`. One-call account summary: `{Pubkey, BalanceSat, Nonce, VTXOCount}`.
- **`VTXOs`** — `GET /tachi_addressVtxos`. Unspent VTXOs by default; pass `includeSpent=true` for full history. Items are `VTXOItem`, the same shape as `VTXOResponse` (see [VTXO](#vtxo)).
- **`Transactions`** — `GET /tachi_addressTransactions`. Height-cursor paginated (`opts.BeforeHeight`, `opts.PageSize`) — see [Pagination](#pagination). The scan is bounded by a server-side time budget rather than a fixed block count, so a sparse address can return zero transactions along with a valid cursor to keep walking.
- **`Balance`** — `GET /tachi_balance`. Just `{Pubkey, BalanceSat}`.
- **`Nonce`** — `GET /tachi_nonce`. `{Address, Nonce, NextNonce}` — use `NextNonce` for your next outgoing transaction.
- **`Mempool`** — `GET /tachi_mempoolByAddress`. Pending transactions crediting or spending this address. Poll once for current state, then prefer `WS.Subscribe` for new arrivals instead of re-polling.

:::danger Full-chain scan
`Transactions` is bounded by a server-side time budget, not an address index — a sparse address can take a while to scan. Always set `opts.PageSize` and page with `NextBeforeHeight`.
:::

```go
acct, _, err := c.Address.Get(ctx, addr)
fmt.Println(acct.BalanceSat, acct.VTXOCount)

vtxos, _, err := c.Address.VTXOs(ctx, addr, false) // unspent only
for _, v := range vtxos.VTXOs {
    fmt.Println(v.ID, v.Amount)
}

nonce, _, err := c.Address.Nonce(ctx, addr)
// build your next tx with nonce.NextNonce
```

---

### Dashboard

```go
c.Dashboard.Stats(ctx) (*StatsResponse, *Response, error)
c.Dashboard.Supply(ctx) (*SupplyResponse, *Response, error)
c.Dashboard.Search(ctx, q string) (*SearchResponse, *Response, error)
```

- **`Stats`** — `GET /tachi_stats`. Single-call network overview: `{Height, TotalTransactions, TotalAccounts, CurrentEpoch, NodeCount, ChainID, LatestBlockTime, TotalSupplySat, VTXOCount}`.
- **`Supply`** — `GET /tachi_supply`. Just `{TotalSupplySat, VTXOCount}`.
- **`Search`** — `GET /tachi_search?q=`. Auto-detects whether `q` is a tx hash, block height, epoch ID, VTXO ID, or pubkey. `SearchResponse.Type` is one of `"block"`, `"epoch"`, `"tx"`, `"vtxo"`, `"address"`; `.Result` is raw JSON — `json.Unmarshal` it into the matching type.

```go
stats, _, err := c.Dashboard.Stats(ctx)
fmt.Println(stats.Height, stats.TotalSupplySat)

found, _, err := c.Dashboard.Search(ctx, "a1b2c3...")
switch found.Type {
case "tx":
    var tx tachi.GetTransactionResponse
    json.Unmarshal(found.Result, &tx)
case "epoch":
    var epoch tachi.GetEpochResponse
    json.Unmarshal(found.Result, &epoch)
}
```

---

### Bitcoin

```go
c.Bitcoin.RPC(ctx, method string, params interface{}) (json.RawMessage, *Response, error)
```

- **`RPC`** — `POST /`. Forwards a JSON-RPC 1.0 request to the daemon's configured bitcoind. `params` is marshalled as-is into the request's params array/object; pass `nil` for none. Returns the raw `Result` — decode it into whatever shape the specific bitcoind method returns.

Common read-only methods (chain/mempool/tx-decoding) need no auth. Any other method (wallet, admin, network-mutation) requires `WithAPIKey` set to the daemon's master `BTC_RPC_API_KEY` — a missing or non-matching key returns a 403 `*ErrorResponse`.

:::warning
`RPC` proxies **any** Bitcoin RPC method, including privileged ones like `sendtoaddress`, `dumpprivkey`, and `stop`. Ensure the daemon's RPC is properly access-controlled.
:::

```go
raw, _, err := c.Bitcoin.RPC(ctx, "getblockchaininfo", nil)
if err != nil {
    var rpcErr *tachi.BitcoinRPCError
    if errors.As(err, &rpcErr) {
        fmt.Println("bitcoind error", rpcErr.Code, rpcErr.Message)
    }
    log.Fatal(err)
}
var info map[string]interface{}
json.Unmarshal(raw, &info)
fmt.Println(info["blocks"])

// with params
raw, _, err = c.Bitcoin.RPC(ctx, "getblock", []interface{}{blockHash, 1})

// privileged method — requires WithAPIKey(BTC_RPC_API_KEY)
raw, _, err = c.Bitcoin.RPC(ctx, "listwallets", nil)
```

---

### Sign

```go
c.Sign.Transaction(ctx, tx *RefundTx) (*SignTransactionResponse, *Response, error)
```

- **`Transaction`** — `POST /tachi_signTransaction`. Fans a PSBT-shaped cooperative-refund transaction out to the vault's signing quorum and returns it with the collected `tapScriptSig` partials attached. The caller must supply `tx.Inputs[0].UserSig` (the vault owner's signature) before calling; the caller then adds its own final signature and finalizes/broadcasts. Returns a 503 `*ErrorResponse` if refund signing is disabled on the daemon, or 504 if the signing threshold wasn't reached in time.

`RefundTx` mirrors PSBT structure (camelCase JSON tags to match the daemon's reference schema): `{Version, Locktime, Inputs []RefundInput, Outputs []RefundOutput}`, where `Inputs[0]` is the vault's funding UTXO (`Prevout`, `Sequence`, `WitnessUtxo`, `TapLeafScript` — the cooperative leaf, `TapInternalKey`, `SighashType`, and `UserSig`), and `Outputs[0]` is the canonical `to_local` P2TR.

```go
tx := &tachi.RefundTx{
    Version:  2,
    Locktime: 0,
    Inputs: []tachi.RefundInput{{
        Prevout:        tachi.RefundPrevout{Hash: fundingTxid, Index: 0},
        Sequence:       0,
        WitnessUtxo:    tachi.RefundWitnessUtxo{Value: vaultValueSat, Script: vaultScriptHex},
        TapLeafScript:  []tachi.RefundTapLeaf{{LeafVersion: 0xc0, Script: coopLeafScriptHex, ControlBlock: controlBlockHex}},
        TapInternalKey: internalKeyHex,
        SighashType:    0,
        UserSig:        userSigHex, // caller-supplied, over the cooperative-leaf sighash
    }},
    Outputs: []tachi.RefundOutput{
        {Value: refundValueSat, Script: toLocalScriptHex},
    },
}
signed, _, err := c.Sign.Transaction(ctx, tx)
if err != nil {
    log.Fatal(err)
}
fmt.Println(signed.Signatures, "quorum signatures collected")
// caller now appends its own signature to signed.Refund and finalizes
```

---

### Watchtower

```go
c.Watchtower.Status(ctx) (*WatchtowerStatus, *Response, error)
c.Watchtower.Receipts(ctx, vaultID string) ([]BreachReceipt, *Response, error)
c.Watchtower.Receipt(ctx, vaultID string, state uint64) (*BreachReceipt, *Response, error)
```

- **`Status`** — `GET /tachi_watchtower/status`. `WatchtowerStatus{Mode, LastScannedHeight, ReceiptCount, SweepThreshold, BountyConfigured}` — `Mode` is `"detection"`, `"responder"`, or `"initiator"`.
- **`Receipts`** — `GET /tachi_watchtower/receipts`. Pass `""` for `vaultID` to list every receipt, or a specific vault ID to filter.
- **`Receipt`** — `GET /tachi_watchtower/receipts?vault=&state=`. A single breach receipt at a specific broadcast state; 404 if none exists.

`BreachReceipt{VaultID, BroadcastState, LatestState, Classification, SpendTxID, SpendVout, DetectedHeight, DetectedAt}` — `Classification` is `"legitimate"`, `"stale"`, or `"anomalous"`.

Both `Status` and the receipt methods return a 503 `*ErrorResponse` if the daemon has no watchtower configured.

```go
status, _, err := c.Watchtower.Status(ctx)
if err != nil {
    var apiErr *tachi.ErrorResponse
    if errors.As(err, &apiErr) && apiErr.Response.StatusCode == 503 {
        fmt.Println("no watchtower configured")
        return
    }
    log.Fatal(err)
}
fmt.Println(status.Mode, status.ReceiptCount)

receipts, _, err := c.Watchtower.Receipts(ctx, "") // every receipt
for _, r := range receipts {
    fmt.Println(r.VaultID, r.Classification)
}
```

---

### WS (live subscriptions)

```go
c.WS.Subscribe(ctx, opts SubscribeOptions) (*WSConn, error)
```

`SubscribeOptions` — at least one field required, or `Subscribe` returns an error before opening a connection:

| Field | Alerts delivered |
|---|---|
| `Address string` | Incoming vouts to this taproot address or pubkey hex. |
| `Vault string` | Incoming locks into this vault address. |
| `VaultID string` | Watchtower breach receipts for this vault (64-hex). |
| `Blocks bool` | Every durably-committed block. |
| `Validators bool` | Every new validator registration. |
| `Txs bool` | Every transaction, pending then committed, unfiltered by Address/Vault. |

Each delivered `WSEvent` sets `Event` to `"tx"`, `"block"`, `"validator"`, or `"breach"`, with the corresponding field populated (`Tx *WSTxAlert`, `Block *WSBlockAlert`, `Validator *WSValidatorAlert`, `Breach *WSBreachAlert`) — one connection can watch multiple filters at once, so check `Event` before reading the field.

`WSConn` methods: `Events() <-chan WSEvent`, `Err() <-chan error` (receives at most one error on abnormal termination — nothing on a clean `Close`), `Close() error` (idempotent). The connection sends periodic pings internally to detect a dead transport; the server never expects client messages.

```go
conn, err := c.WS.Subscribe(ctx, tachi.SubscribeOptions{
    Address: ownerPubkeyHex,
    Blocks:  true,
})
if err != nil {
    log.Fatal(err)
}
defer conn.Close()

for {
    select {
    case evt, ok := <-conn.Events():
        if !ok {
            return // channel closed; check conn.Err() for why
        }
        switch evt.Event {
        case "tx":
            fmt.Println("tx", evt.Tx.TxHash, evt.Tx.State)
        case "block":
            fmt.Println("block", evt.Block.Height, evt.Block.TxCount)
        }
    case err := <-conn.Err():
        log.Println("ws error:", err)
        return
    case <-ctx.Done():
        return
    }
}
```

Watchtower breach alerts, unfiltered tx stream, and validator-join alerts follow the same pattern with different `SubscribeOptions`:

```go
// every breach alert for one vault
conn, _ := c.WS.Subscribe(ctx, tachi.SubscribeOptions{VaultID: vaultIDHex})

// every transaction on the chain, unfiltered
conn, _ := c.WS.Subscribe(ctx, tachi.SubscribeOptions{Txs: true})

// new validator joins
conn, _ := c.WS.Subscribe(ctx, tachi.SubscribeOptions{Validators: true})
```

## Escaping untrusted fields

A handful of response fields are set by other chain participants and are not sanitized by the daemon — most notably `VaultListItem.Name` (the display label a vault opener chooses at open time). Treat these as untrusted input: HTML-escape before rendering in a browser, and don't interpolate them into shell commands or SQL.

## Shared types

```go
type HATProofResponse struct {
    VTXOID       string `json:"vtxo_id"`
    BTCTimestamp uint32 `json:"btc_timestamp"`
    BTCHeight    uint32 `json:"btc_height"`
    Proof        string `json:"proof"`
}

const Version = "0.1.0"
```

## Examples

Runnable end-to-end examples live in the SDK's [`examples/`](https://github.com/tachibtc/tachi-sdk-go/tree/main/examples) directory:
- `examples/basic` exercises read-only calls across most services.
- `examples/websocket` opens a block-alert subscription and prints one event.

See the [Go package reference](https://pkg.go.dev/github.com/tachibtc/tachi-sdk-go/tachi) for the canonical, always-current source.
