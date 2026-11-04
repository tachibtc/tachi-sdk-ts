// Building, encoding and signing Tachi EVM transactions (TxDeploy, TxCall).
//
// The wire format, signing digest and ID derivations match the daemon's
// types.EncodeTx, types.SigHash, types.TxHash and types.ComputeVTXOID, and
// the address helpers match satvm.EVMAddressFromPubKey and
// satvm.DeriveContractAddress. The tests pin all of them to vectors produced
// by the daemon itself.
//
// No runtime dependencies: SHA-256 comes from WebCrypto, keccak256 and the
// secp256k1 point decompression an EVM address needs are implemented here,
// and signing is left to the caller (see EVMSigner).

/** Tachi transaction format version. */
export const TX_VERSION = 1;
/** Transaction type that deploys a contract. */
export const TX_DEPLOY = 0x08;
/** Transaction type that calls a contract. */
export const TX_CALL = 0x09;

/** `gasPrice` is in millisats per gas: this many units make one sat. */
export const GAS_PRICE_UNIT = 1000n;
/** Lowest gas price the daemon accepts, in millisats per gas. */
export const MIN_GAS_PRICE = 1n;
/** Highest gas limit one EVM transaction may set. */
export const MAX_GAS_PER_EVM_CALL = 1_000_000n;
/** Largest init code a deploy may carry (EIP-3860). */
export const MAX_EVM_INIT_CODE_SIZE = 49_152;
/** EVM chain ID ("TCHI"), what CHAINID returns and EIP-712 domains use. */
export const EVM_CHAIN_ID = 0x54434849n;

const MAX_U64 = (1n << 64n) - 1n;
const MAX_I64 = (1n << 63n) - 1n;

/** Hex, with or without a 0x prefix, or raw bytes. */
export type BytesLike = string | Uint8Array;

/**
 * Signs a 32-byte Tachi signing digest with BIP-340 Schnorr and returns the
 * 64-byte signature. For example, with `@noble/curves`:
 *
 * ```ts
 * import { schnorr } from "@noble/curves/secp256k1";
 * const signer: EVMSigner = (sigHash) => schnorr.sign(sigHash, privateKey);
 * ```
 */
export type EVMSigner = (sigHash: Uint8Array) => Uint8Array | Promise<Uint8Array>;

/** A VTXO the transaction creates. */
export interface EVMTxOutput {
  /** Recipient's 32-byte x-only public key. */
  owner: BytesLike;
  /** Amount in sats. */
  amount: bigint;
}

/** Fields shared by deploys and calls. */
export interface EVMTxCommon {
  /** IDs of the sender's VTXOs to spend. They pay for gas and the outputs. */
  inputs: BytesLike[];
  /**
   * VTXOs to create, usually change back to the sender. Inputs must cover
   * these plus `maxGasFeeSats(gasLimit, gasPrice)`; the unused part of the
   * gas comes back as a refund VTXO (see `refundVtxoId`).
   */
  outputs?: EVMTxOutput[];
  /** Sender's 32-byte x-only public key. */
  pubKey: BytesLike;
  /** The sender's next nonce: the `nonce` field of `getEvmNonce`/`getNonce`. */
  nonce: bigint;
  /** Gas limit, intrinsic gas included. At most MAX_GAS_PER_EVM_CALL. */
  gasLimit: bigint;
  /** Millisats per gas. Defaults to MIN_GAS_PRICE. */
  gasPrice?: bigint;
}

/** Parameters for `buildDeployTx`. */
export interface DeployTxParams extends EVMTxCommon {
  /** Contract init code, with any ABI-encoded constructor arguments appended. */
  initCode: BytesLike;
}

/** Parameters for `buildCallTx`. */
export interface CallTxParams extends EVMTxCommon {
  /** 20-byte address of the contract to call. */
  to: BytesLike;
  /** ABI-encoded calldata. */
  data: BytesLike;
}

/** An EVM transaction, signed once `signature` is set. */
export interface EVMTx {
  type: typeof TX_DEPLOY | typeof TX_CALL;
  inputs: Uint8Array[];
  outputs: { owner: Uint8Array; amount: bigint }[];
  pubKey: Uint8Array;
  nonce: bigint;
  gasLimit: bigint;
  gasPrice: bigint;
  /** Called contract; 20 zero bytes for a deploy. */
  to: Uint8Array;
  /** Init code for a deploy, calldata for a call. */
  data: Uint8Array;
  signature?: Uint8Array;
}

/** Builds an unsigned TxDeploy. Throws if the daemon would reject its format. */
export function buildDeployTx(params: DeployTxParams): EVMTx {
  const data = toBytes(params.initCode, "initCode");
  if (data.length === 0 || data.length > MAX_EVM_INIT_CODE_SIZE) {
    throw new Error(`initCode must be 1 to ${MAX_EVM_INIT_CODE_SIZE} bytes, got ${data.length}`);
  }
  return buildCommon(TX_DEPLOY, params, new Uint8Array(20), data);
}

/** Builds an unsigned TxCall. Throws if the daemon would reject its format. */
export function buildCallTx(params: CallTxParams): EVMTx {
  const to = toBytes(params.to, "to");
  if (to.length !== 20 || to.every((b) => b === 0)) {
    throw new Error("to must be a non-zero 20-byte address");
  }
  const data = toBytes(params.data, "data");
  if (data.length > 0xffffff) throw new Error("data exceeds 16 MiB");
  return buildCommon(TX_CALL, params, to, data);
}

function buildCommon(type: EVMTx["type"], p: EVMTxCommon, to: Uint8Array, data: Uint8Array): EVMTx {
  const pubKey = toBytes(p.pubKey, "pubKey");
  if (pubKey.length !== 32) throw new Error(`pubKey must be a 32-byte x-only key, got ${pubKey.length} bytes`);
  if (p.inputs.length === 0) throw new Error("at least one input is required to pay for gas");
  if (p.inputs.length > 0xffff) throw new Error("too many inputs");
  const inputs = p.inputs.map((id, i) => {
    const b = toBytes(id, `inputs[${i}]`);
    if (b.length !== 32) throw new Error(`inputs[${i}] must be a 32-byte VTXO ID`);
    return b;
  });
  const outputs = (p.outputs ?? []).map((o, i) => {
    const owner = toBytes(o.owner, `outputs[${i}].owner`);
    if (owner.length !== 32) throw new Error(`outputs[${i}].owner must be a 32-byte x-only key`);
    if (o.amount <= 0n || o.amount > MAX_I64) throw new Error(`outputs[${i}].amount must be positive`);
    return { owner, amount: o.amount };
  });
  if (outputs.length > 0xffff) throw new Error("too many outputs");
  const gasPrice = p.gasPrice ?? MIN_GAS_PRICE;
  if (p.gasLimit <= 0n || p.gasLimit > MAX_GAS_PER_EVM_CALL) {
    throw new Error(`gasLimit must be 1 to ${MAX_GAS_PER_EVM_CALL}`);
  }
  if (gasPrice < MIN_GAS_PRICE || gasPrice > MAX_U64) {
    throw new Error(`gasPrice must be at least ${MIN_GAS_PRICE} millisat per gas`);
  }
  if (p.nonce < 0n || p.nonce > MAX_U64) throw new Error("nonce must be a uint64");
  return { type, inputs, outputs, pubKey, nonce: p.nonce, gasLimit: p.gasLimit, gasPrice, to, data };
}

/**
 * Sats that `gas` units cost at `gasPrice` millisats per gas, rounded up as
 * the daemon does.
 */
export function gasFeeSats(gas: bigint, gasPrice: bigint): bigint {
  const msat = gas * gasPrice;
  return (msat + GAS_PRICE_UNIT - 1n) / GAS_PRICE_UNIT;
}

/**
 * Sats a transaction sets aside for gas: its inputs must cover this plus its
 * outputs. What is not used comes back as a refund VTXO.
 */
export function maxGasFeeSats(tx: Pick<EVMTx, "gasLimit" | "gasPrice">): bigint {
  return gasFeeSats(tx.gasLimit, tx.gasPrice);
}

/**
 * Serializes the transaction in the daemon's wire format. With `forSigning`
 * it produces the signing preimage instead: no signature, as types.SigHash
 * hashes it.
 */
export function encodeEVMTx(tx: EVMTx, forSigning = false): Uint8Array {
  const w = new Writer();
  w.u8(TX_VERSION).u8(tx.type).u16(tx.inputs.length);
  for (const id of tx.inputs) {
    // VTXO ID, then the L1 txid, vout and value an EVM spend leaves zero,
    // and an empty sigScript.
    w.bytes(id).bytes(new Uint8Array(32)).u32(0).u64(0n).u16(0);
  }
  w.u16(tx.outputs.length);
  for (const out of tx.outputs) {
    w.u16(out.owner.length).bytes(out.owner).u64(out.amount).u16(0); // empty script
  }
  const sig = forSigning || !tx.signature ? new Uint8Array(0) : tx.signature;
  w.u64(0n) // Fee: always 0 on EVM txs, gas pays instead
    .u64(tx.nonce)
    .u16(tx.pubKey.length)
    .bytes(tx.pubKey)
    .u16(sig.length)
    .bytes(sig)
    .u32(0) // empty PSBT payload
    .u64(tx.gasLimit)
    .u64(tx.gasPrice);
  // The EVM payload slot is present only when there is something in it.
  if (tx.data.length > 0 || tx.to.some((b) => b !== 0)) {
    w.bytes(tx.to).u32(tx.data.length).bytes(tx.data);
  }
  return w.finish();
}

/** The 32-byte digest the sender signs (types.SigHash). */
export async function evmSigHash(tx: EVMTx): Promise<Uint8Array> {
  return sha256(encodeEVMTx(tx, true));
}

/** Returns a copy of `tx` signed with `signer`. */
export async function signEVMTx(tx: EVMTx, signer: EVMSigner): Promise<EVMTx> {
  const signature = await signer(await evmSigHash(tx));
  if (!(signature instanceof Uint8Array) || signature.length !== 64) {
    throw new Error("signer must return a 64-byte BIP-340 signature");
  }
  return { ...tx, signature: Uint8Array.from(signature) };
}

/** Hex of a signed transaction, for `broadcastTxSync` and `validateTransaction`. */
export function evmTxHex(tx: EVMTx): string {
  if (!tx.signature) throw new Error("transaction is not signed; call signEVMTx first");
  return bytesToHex(encodeEVMTx(tx));
}

/** Transaction hash, as `getEvmReceipt` and the explorer endpoints take it. */
export async function evmTxHash(tx: EVMTx): Promise<string> {
  if (!tx.signature) throw new Error("transaction is not signed; call signEVMTx first");
  return bytesToHex(await sha256(encodeEVMTx(tx)));
}

/**
 * ID of the VTXO that returns unused gas to the sender. It sits at the output
 * index after the transaction's own outputs, so it is not in `tx.outputs`,
 * and it exists only if some gas went unused.
 */
export async function refundVtxoId(tx: EVMTx): Promise<string> {
  return vtxoId(tx, tx.outputs.length);
}

/** ID of the VTXO at `index` among those the transaction creates. */
export async function vtxoId(tx: EVMTx, index: number): Promise<string> {
  if (!tx.signature) throw new Error("transaction is not signed; call signEVMTx first");
  const hash = await sha256(encodeEVMTx(tx));
  return bytesToHex(await sha256(new Writer().bytes(hash).u32(index).finish()));
}

// ── EVM addresses ──────────────────────────────────────────────────

/**
 * The EVM address (`msg.sender`) of a Tachi key: the standard Ethereum
 * address of the same secp256k1 key, so it matches what Ethereum wallets show
 * for it. Takes a 32-byte x-only key, a 33-byte compressed key or a 65-byte
 * uncompressed key. Returns 0x-prefixed lowercase hex.
 */
export function evmAddressFromPubKey(pubKey: BytesLike): string {
  const key = toBytes(pubKey, "pubKey");
  let xy: Uint8Array;
  if (key.length === 65) {
    if (key[0] !== 0x04) throw new Error("uncompressed key must start with 0x04");
    xy = key.subarray(1);
  } else if (key.length === 32 || key.length === 33) {
    // An x-only key has an even Y by definition (BIP-340).
    const odd = key.length === 33 ? parity(key[0]) : false;
    const x = bytesToBigInt(key.subarray(key.length - 32));
    xy = concat(bigIntToBytes(x, 32), bigIntToBytes(liftX(x, odd), 32));
  } else {
    throw new Error(`pubKey is ${key.length} bytes, want 32 (x-only), 33 or 65`);
  }
  return "0x" + bytesToHex(keccak256(xy).subarray(12));
}

/**
 * Address a contract deployed by `deployer` with `nonce` gets, the standard
 * CREATE rule. A deploy's address is fixed before it runs, so this matches
 * the receipt's `contract_address`.
 */
export function contractAddress(deployer: BytesLike, nonce: bigint): string {
  const addr = toBytes(deployer, "deployer");
  if (addr.length !== 20) throw new Error("deployer must be a 20-byte address");
  if (nonce < 0n || nonce > MAX_U64) throw new Error("nonce must be a uint64");
  const n = nonce === 0n ? new Uint8Array(0) : bigIntToBytes(nonce, Math.ceil(nonce.toString(16).length / 2));
  const nonceRLP = n.length === 1 && n[0] < 0x80 ? n : concat(Uint8Array.of(0x80 + n.length), n);
  const payload = concat(Uint8Array.of(0x80 + 20), addr, nonceRLP);
  return "0x" + bytesToHex(keccak256(concat(Uint8Array.of(0xc0 + payload.length), payload)).subarray(12));
}

function parity(prefix: number): boolean {
  if (prefix !== 0x02 && prefix !== 0x03) throw new Error("compressed key must start with 0x02 or 0x03");
  return prefix === 0x03;
}

// secp256k1: y^2 = x^3 + 7 over F_p, p = 3 mod 4, so sqrt(a) = a^((p+1)/4).
const P = (1n << 256n) - (1n << 32n) - 977n;

function liftX(x: bigint, odd: boolean): bigint {
  if (x >= P) throw new Error("public key is not on secp256k1");
  const c = (modPow(x, 3n, P) + 7n) % P;
  const y = modPow(c, (P + 1n) / 4n, P);
  if ((y * y) % P !== c) throw new Error("public key is not on secp256k1");
  return (y & 1n) === (odd ? 1n : 0n) ? y : P - y;
}

function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  let result = 1n;
  base %= mod;
  while (exp > 0n) {
    if (exp & 1n) result = (result * base) % mod;
    base = (base * base) % mod;
    exp >>= 1n;
  }
  return result;
}

// ── keccak256 ──────────────────────────────────────────────────────

const MASK64 = MAX_U64;
const KECCAK_RC = [
  0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n,
  0x000000000000808bn, 0x0000000080000001n, 0x8000000080008081n, 0x8000000000008009n,
  0x000000000000008an, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
  0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n,
  0x8000000000008002n, 0x8000000000000080n, 0x000000000000800an, 0x800000008000000an,
  0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n,
];
// Rotation offsets, indexed x + 5y.
const KECCAK_ROT = [0, 1, 62, 28, 27, 36, 44, 6, 55, 20, 3, 10, 43, 25, 39, 41, 45, 15, 21, 8, 18, 2, 61, 56, 14];

function rotl(v: bigint, n: number): bigint {
  if (n === 0) return v;
  return ((v << BigInt(n)) | (v >> BigInt(64 - n))) & MASK64;
}

function keccakF(s: bigint[]): void {
  const c = new Array<bigint>(5);
  const b = new Array<bigint>(25);
  for (const rc of KECCAK_RC) {
    for (let x = 0; x < 5; x++) c[x] = s[x] ^ s[x + 5] ^ s[x + 10] ^ s[x + 15] ^ s[x + 20];
    for (let x = 0; x < 5; x++) {
      const d = c[(x + 4) % 5] ^ rotl(c[(x + 1) % 5], 1);
      for (let y = 0; y < 25; y += 5) s[x + y] ^= d;
    }
    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 5; y++) {
        b[y + 5 * ((2 * x + 3 * y) % 5)] = rotl(s[x + 5 * y], KECCAK_ROT[x + 5 * y]);
      }
    }
    for (let y = 0; y < 25; y += 5) {
      for (let x = 0; x < 5; x++) {
        s[x + y] = b[x + y] ^ (~b[((x + 1) % 5) + y] & MASK64 & b[((x + 2) % 5) + y]);
      }
    }
    s[0] ^= rc;
  }
}

/** Keccak-256 as Ethereum uses it (the original padding, not SHA3-256). */
export function keccak256(data: Uint8Array): Uint8Array {
  const rate = 136;
  const padded = new Uint8Array((Math.floor(data.length / rate) + 1) * rate);
  padded.set(data);
  padded[data.length] ^= 0x01;
  padded[padded.length - 1] ^= 0x80;
  const s = new Array<bigint>(25).fill(0n);
  for (let off = 0; off < padded.length; off += rate) {
    for (let i = 0; i < rate / 8; i++) {
      let lane = 0n;
      for (let k = 7; k >= 0; k--) lane = (lane << 8n) | BigInt(padded[off + i * 8 + k]);
      s[i] ^= lane;
    }
    keccakF(s);
  }
  const out = new Uint8Array(32);
  for (let i = 0; i < 4; i++) {
    let lane = s[i];
    for (let k = 0; k < 8; k++) {
      out[i * 8 + k] = Number(lane & 0xffn);
      lane >>= 8n;
    }
  }
  return out;
}

// ── bytes ──────────────────────────────────────────────────────────

async function sha256(data: Uint8Array): Promise<Uint8Array> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error("WebCrypto (globalThis.crypto.subtle) is required for SHA-256");
  return new Uint8Array(await subtle.digest("SHA-256", data));
}

/** Decodes hex (0x prefix optional); passes bytes through as a copy. */
export function toBytes(v: BytesLike, field = "value"): Uint8Array {
  if (v instanceof Uint8Array) return Uint8Array.from(v);
  const hex = v.startsWith("0x") || v.startsWith("0X") ? v.slice(2) : v;
  if (hex.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(hex)) throw new Error(`${field} is not valid hex`);
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** Lowercase hex without a 0x prefix. */
export function bytesToHex(b: Uint8Array): string {
  let s = "";
  for (const x of b) s += x.toString(16).padStart(2, "0");
  return s;
}

function bytesToBigInt(b: Uint8Array): bigint {
  return b.length === 0 ? 0n : BigInt("0x" + bytesToHex(b));
}

function bigIntToBytes(v: bigint, len: number): Uint8Array {
  return toBytes(v.toString(16).padStart(len * 2, "0"));
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

class Writer {
  private parts: Uint8Array[] = [];
  private num(n: number | bigint, size: 1 | 2 | 4 | 8): this {
    const b = new Uint8Array(size);
    const v = new DataView(b.buffer);
    if (size === 1) v.setUint8(0, Number(n));
    else if (size === 2) v.setUint16(0, Number(n));
    else if (size === 4) v.setUint32(0, Number(n));
    else v.setBigUint64(0, BigInt(n));
    this.parts.push(b);
    return this;
  }
  u8(n: number): this {
    return this.num(n, 1);
  }
  u16(n: number): this {
    return this.num(n, 2);
  }
  u32(n: number): this {
    return this.num(n, 4);
  }
  /** Big-endian 64-bit; amounts are non-negative, so int64 encodes the same. */
  u64(n: bigint): this {
    return this.num(n, 8);
  }
  bytes(b: Uint8Array): this {
    this.parts.push(b);
    return this;
  }
  finish(): Uint8Array {
    return concat(...this.parts);
  }
}
