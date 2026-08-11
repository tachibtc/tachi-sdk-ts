---
sidebar_position: 2
title: Vault API Reference
---

# Vault API Reference

## Vault Creation

### `createVault(options)`

End-to-end vault creation — fetches validator keys, builds tapscripts, and derives the P2TR address.

```ts
const vault = await createVault({
  network: "regtest",
  userWallet,
  validators: { endpoint: "https://rpc-regtest.tachibtc.com/tachi_validators" }, // or https://rpc-signet.tachibtc.com/tachi_validators for signet
  // csvBlocks: 1008, // optional: override exit-leaf CSV
});
```

| Option | Type | Description |
|--------|------|-------------|
| `network` | `VaultNetworkName` | `mainnet` / `signet` / `regtest` |
| `userWallet` | `Wallet` | Wallet from `@tachibtc/taurus-wallet-aggregator` |
| `validators` | `{ endpoint: string }` | KDHT validator endpoint |
| `nodePubkeys` | `string[]` | Alternative: pass pubkeys directly, skip HTTP fetch |
| `csvBlocks` | `number` | Exit-leaf CSV blocks (default: 1008) |

### `verifyVaultP2tr(p2tr)`

Re-derives both leaves, the NUMS internal key, and the tweaked output key. Throws on any mismatch.

```ts
verifyVaultP2tr(vault.p2tr); // throws if invalid
```

### `depositToVault(options)`

Funds a vault from a P2PKH wallet.

```ts
const deposit = await depositToVault({
  vault,
  userWallet,
  rpc,
  amountSats: 100_000n,
  feeRateSatVb: 2,
});
```

## Tapscript

### `buildCooperativeScript(userPubkey, nodePubkeys, threshold)`

Builds the cooperative leaf script: user `CHECKSIGVERIFY` + N-of-M KDHT `CHECKSIGADD`.

### `buildExitScript(userPubkey, csvBlocks)`

Builds the exit leaf script: CSV timelock + user `CHECKSIG`.

### `describeTapscript(script)`

Returns a human-readable description of a tapscript.

### `NUMS_INTERNAL_KEY`

The BIP-341 NUMS point (`lift_x(SHA256(G))`). Used as the internal key to disable key-path spending.

## P2TR

### `buildVaultP2tr(options)`

Builds the P2TR output from user key, node keys, and CSV config. Lower-level than `createVault`.

## Pubkey Utilities

### `parsePubkeyHex(hex)`

Parses a compressed public key hex string.

### `toXOnly(pubkey)`

Converts a 33-byte compressed pubkey to 32-byte x-only.

### `hexToXOnly(hex)`

Shorthand: hex string → x-only buffer.
