---
sidebar_position: 3
title: VTXO Transaction Flow
---

# VTXO Transaction Flow

After a vault is funded, transfers between vault UTXOs are expressed as PSBTs spending the cooperative leaf, then wrapped in a Tachi wire envelope and submitted to the Tachi mempool.

## Pipeline

```mermaid
flowchart LR
    A[Build PSBT] --> B[Verify]
    B --> C[User Signs]
    C --> D[KDHT 5/7 Signs]
    D --> E[Finalize]
    E --> F[Wrap in TachiTx]
    F --> G[Broadcast]

    style A fill:#BC0000,stroke:#fff,color:#fff
    style G fill:#BC0000,stroke:#fff,color:#fff
    style B fill:#1a1a1a,stroke:#BC0000,color:#e0e0e0
    style C fill:#1a1a1a,stroke:#BC0000,color:#e0e0e0
    style D fill:#1a1a1a,stroke:#BC0000,color:#e0e0e0
    style E fill:#1a1a1a,stroke:#BC0000,color:#e0e0e0
    style F fill:#1a1a1a,stroke:#BC0000,color:#e0e0e0
```

### 1. Build

```ts
import { buildVtxoPsbt } from "@tachibtc/taurus-vault-core";

const built = buildVtxoPsbt({
  vault,
  inputs: [{ txid, vout, valueSats, scriptPubKey: vault.p2tr.output.toString("hex") }],
  outputs: [
    { address: receiverAddr, valueSats: 40_00000000n },
    { address: vault.p2tr.address, valueSats: 59_00000000n }, // change
  ],
  feeSats: 1_00000000n,
});
```

Creates a PSBT with the vault's NUMS internal key and cooperative tap leaf attached to each input.

### 2. Verify

```ts
import { verifyVtxoPsbt } from "@tachibtc/taurus-vault-core";

verifyVtxoPsbt(built.psbt, vault, { maxFeeSats: 2_00000000n });
```

Re-checks structure, `witnessUtxo.script`, internal key, leaf scripts, and enforces a fee ceiling.

:::warning
Always pass `maxFeeSats` to prevent a malformed PSBT from silently draining value to miners. If you explicitly want no cap, pass `allowUnboundedFee: true`.
:::

### 3. Sign

```ts
import { signVtxoPsbtAsUser } from "@tachibtc/taurus-vault-core";

await signVtxoPsbtAsUser(built.psbt, userSigner, vault, { maxFeeSats: 2_00000000n });
```

Attaches the user's Schnorr tapScriptSig. The 5-of-7 KDHT quorum contributes their signatures out-of-band.

### 4. Finalize

```ts
import { finalizeVtxoPsbt } from "@tachibtc/taurus-vault-core";

finalizeVtxoPsbt(built.psbt, vault, { maxFeeSats: 2_00000000n });
```

Assembles the witness from user + node signatures and the cooperative leaf control block.

### 5. Wrap in Tachi Envelope

```ts
import { buildTachiTxTransfer, signTachiTx } from "@tachibtc/taurus-vault-core";

const draft = buildTachiTxTransfer({
  vault,
  inputs: built.inputs,
  outputs: built.outputs,
  feeSats: 1_00000000n,
  nonce: 0n,
  psbt: built.psbt,
});

const tachi = await signTachiTx(draft, userSigner);
```

### 6. Broadcast

```ts
import { broadcastTachiTx, waitForVtxoCommit } from "@tachibtc/taurus-vault-core";

await broadcastTachiTx(tachi, {
  url: "https://rpc-regtest.tachibtc.com/tachi_txBroadcastSync",
});

// Optionally wait for inclusion
await waitForVtxoCommit(/* ... */);
```

:::caution
In production, always use `https://`. For local regtest, pass `{ allowInsecureHttp: true }` to opt into plaintext HTTP — the library refuses to leak Schnorr signatures in the clear by default.
:::

## Deposits

For initial deposits (P2PKH → vault), use `buildTachiTxDeposit` instead of `buildTachiTxTransfer`:

```ts
import { buildTachiTxDeposit, vtxoIdFromDeposit } from "@tachibtc/taurus-vault-core";

const depositTx = buildTachiTxDeposit({ vault, /* ... */ });
const vtxoId = vtxoIdFromDeposit(depositTx);
```

The 32-byte `vtxoId` is derived from the deposit envelope and used as input for subsequent transfers.

## Tachi Transaction Helpers

| Function | Description |
|----------|-------------|
| `buildTachiTxDeposit` | Build a deposit envelope (P2PKH → vault) |
| `buildTachiTxTransfer` | Build a transfer envelope (vault → vault) |
| `encodeTachiTx` | Encode a TachiTx to bytes |
| `encodeTachiTxBase64` | Encode a TachiTx to base64 |
| `signTachiTx` | BIP-340 sign over `tachiTxSigHash` |
| `tachiTxSigHash` | Compute the sighash for a TachiTx |
| `computeVtxoId` | Compute a vtxoId from inputs |
| `vtxoIdFromDeposit` | Derive vtxoId from a deposit envelope |
| `xOnlyFromAddress` | Extract x-only pubkey from a P2TR address |
