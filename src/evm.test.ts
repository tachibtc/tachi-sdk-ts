import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { TachiClient } from "./client";
import {
  buildCallTx,
  buildDeployTx,
  bytesToHex,
  contractAddress,
  encodeEVMTx,
  evmAddressFromPubKey,
  evmSigHash,
  evmTxHash,
  evmTxHex,
  gasFeeSats,
  keccak256,
  maxGasFeeSats,
  refundVtxoId,
  signEVMTx,
  vtxoId,
  type EVMTx,
} from "./evm";

// Vectors produced by the daemon's own code (types.EncodeTx, types.SigHash,
// types.TxHash, types.ComputeVTXOID, satvm.EVMAddressFromPubKey and
// satvm.DeriveContractAddress) for the key 0x11 repeated 32 times.
const PUBKEY = "4f355bdcb7cc0af728ef3cceb9615d90684bb5b2ca5f859ab0f0b704075871aa";
const EVM_ADDRESS = "0xeb88ae7a94086cbbe948cdd6a13c0bd41e12d470";
const INPUTS = ["a1".repeat(32), "b2".repeat(32)];
const OUTPUTS = [{ owner: PUBKEY, amount: 1_500_000n }];

const DEPLOY = {
  hex: "01080002a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b200000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000100204f355bdcb7cc0af728ef3cceb9615d90684bb5b2ca5f859ab0f0b704075871aa000000000016e36000000000000000000000000000000000000000204f355bdcb7cc0af728ef3cceb9615d90684bb5b2ca5f859ab0f0b704075871aa00409539770c6a29741150972a11b39c3d0106b31ad9b6050e303ab58daaae7f40eba01a5fd5ec66021d949cc4e5724283b4be1efab4e7d31f99faa3fe404c1be296000000000000000000061a8000000000000003e800000000000000000000000000000000000000000000000560006000f3",
  sighash: "7d07a5212dfac37cd90aa9567265b2899ff883d44688bf6f63f44f651dd76976",
  signature:
    "9539770c6a29741150972a11b39c3d0106b31ad9b6050e303ab58daaae7f40eba01a5fd5ec66021d949cc4e5724283b4be1efab4e7d31f99faa3fe404c1be296",
  hash: "9fab5cfbfaeff43d353cdc5200a1120e0ad50c5459d117b407744cd93785d506",
  refundVtxoId: "ca4bfc0808613c18e3340892227ecbf90f5121ff9879760d44a0fa566ad6c4db",
};

const CALL = {
  hex: "01090002a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b200000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000100204f355bdcb7cc0af728ef3cceb9615d90684bb5b2ca5f859ab0f0b704075871aa000000000016e36000000000000000000000000000000000000100204f355bdcb7cc0af728ef3cceb9615d90684bb5b2ca5f859ab0f0b704075871aa0040d6488c4d35282146b7fcc75897674571d050c0bc168d493a73b28fec8e046e14bc650dbdee17d604b0f8daf8b07898eb74a15b6ad8214bd0a61c459e7c37cbf4000000000000000000061a8000000000000003e82ccbb0ba7bcdce5877c937005b525cad49ea77880000000470a08231",
  sighash: "a353f8dc945f69210b14c2b44a872317c644833dc99e7390e1aa5deb42d9a438",
  signature:
    "d6488c4d35282146b7fcc75897674571d050c0bc168d493a73b28fec8e046e14bc650dbdee17d604b0f8daf8b07898eb74a15b6ad8214bd0a61c459e7c37cbf4",
  hash: "f71e851261330f1bd453a42ead8b17b4ac642a4132d93d39749cba756070fd77",
  refundVtxoId: "4779375109206a46175d3a9ac2066de4a38dad99c92114e5253f5d25122f9eea",
};

const common = { inputs: INPUTS, outputs: OUTPUTS, pubKey: PUBKEY, gasLimit: 400_000n, gasPrice: 1000n };
const deployTx = () => buildDeployTx({ ...common, nonce: 0n, initCode: "0x60006000f3" });
const callTx = () =>
  buildCallTx({ ...common, nonce: 1n, to: "0x2ccbb0ba7bcdce5877c937005b525cad49ea7788", data: "70a08231" });

/** A signer that checks it was handed the expected digest. */
function vectorSigner(v: { sighash: string; signature: string }) {
  return (sigHash: Uint8Array) => {
    assert.equal(bytesToHex(sigHash), v.sighash);
    return Uint8Array.from(Buffer.from(v.signature, "hex"));
  };
}

describe("EVM transactions match the daemon", () => {
  for (const [name, build, v] of [
    ["deploy", deployTx, DEPLOY],
    ["call", callTx, CALL],
  ] as const) {
    it(`${name}: signing digest, encoding, hash and refund VTXO ID`, async () => {
      const tx = build();
      assert.equal(bytesToHex(await evmSigHash(tx)), v.sighash);
      const signed = await signEVMTx(tx, vectorSigner(v));
      assert.equal(evmTxHex(signed), v.hex);
      assert.equal(await evmTxHash(signed), v.hash);
      assert.equal(await refundVtxoId(signed), v.refundVtxoId);
    });
  }

  it("signing leaves the unsigned tx unchanged", async () => {
    const tx = deployTx();
    await signEVMTx(tx, vectorSigner(DEPLOY));
    assert.equal(tx.signature, undefined);
    assert.throws(() => evmTxHex(tx), /not signed/);
  });

  it("omits the EVM payload slot when there is none", () => {
    const tx: EVMTx = { ...deployTx(), data: new Uint8Array(0) };
    // Ends with GasLimit and GasPrice, no address or length after them.
    assert.ok(bytesToHex(encodeEVMTx(tx)).endsWith("0000000000061a80" + "00000000000003e8"));
  });
});

describe("EVM addresses", () => {
  it("keccak256 matches known digests", () => {
    assert.equal(bytesToHex(keccak256(new Uint8Array(0))), "c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470");
    assert.equal(bytesToHex(keccak256(new TextEncoder().encode("abc"))), "4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45");
    // Crosses the 136-byte block boundary; digest from @noble/hashes.
    assert.equal(
      bytesToHex(keccak256(new Uint8Array(200).fill(0x61))),
      "96ea54061def936c4be90b518992fdc6f12f535068a256229aca54267b4d084d",
    );
  });

  it("derives the Ethereum address of a Tachi key", () => {
    assert.equal(evmAddressFromPubKey(PUBKEY), EVM_ADDRESS);
    // Private key 1: the generator point, whose Ethereum address is well known.
    const g = "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";
    assert.equal(evmAddressFromPubKey(g), "0x7e5f4552091a69125d5dfcb7b8c2659029395bdf");
    assert.equal(evmAddressFromPubKey("02" + g), "0x7e5f4552091a69125d5dfcb7b8c2659029395bdf");
  });

  it("rejects keys that are not on the curve or the wrong size", () => {
    assert.throws(() => evmAddressFromPubKey("00".repeat(32)), /not on secp256k1/);
    assert.throws(() => evmAddressFromPubKey("00".repeat(31)), /want 32/);
    assert.throws(() => evmAddressFromPubKey("04" + "01".repeat(64)), /not on secp256k1/);
  });

  it("accepts an uncompressed key, and an odd-Y compressed key differs from x-only", () => {
    const gx = "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";
    const gy = "483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8";
    assert.equal(evmAddressFromPubKey("04" + gx + gy), "0x7e5f4552091a69125d5dfcb7b8c2659029395bdf");
    assert.notEqual(evmAddressFromPubKey("03" + gx), evmAddressFromPubKey(gx));
  });

  it("derives contract addresses like CREATE", () => {
    assert.equal(contractAddress(EVM_ADDRESS, 0n), "0x2ccbb0ba7bcdce5877c937005b525cad49ea7788");
    assert.equal(contractAddress(EVM_ADDRESS, 1n), "0x32dfc62318cc0bd2a28f54382c2dab3d93dff958");
    assert.equal(contractAddress(EVM_ADDRESS, 300n), "0xdc9311cbe462de21c1d81adc09fc299347dee97e");
  });
});

describe("EVM transaction validation", () => {
  it("rejects what the daemon would reject", () => {
    const base = { inputs: INPUTS, pubKey: PUBKEY, nonce: 0n, gasLimit: 100_000n };
    assert.throws(() => buildDeployTx({ ...base, initCode: "" }), /initCode/);
    assert.throws(() => buildDeployTx({ ...base, gasLimit: 0n, initCode: "00" }), /gasLimit/);
    assert.throws(() => buildDeployTx({ ...base, gasLimit: 1_000_001n, initCode: "00" }), /gasLimit/);
    assert.throws(() => buildDeployTx({ ...base, gasPrice: 0n, initCode: "00" }), /gasPrice/);
    assert.throws(() => buildDeployTx({ ...base, inputs: [], initCode: "00" }), /input/);
    assert.throws(() => buildDeployTx({ ...base, pubKey: "02" + PUBKEY, initCode: "00" }), /x-only/);
    assert.throws(() => buildCallTx({ ...base, to: "00".repeat(20), data: "" }), /non-zero/);
    assert.throws(() => buildCallTx({ ...base, to: "zz", data: "" }), /hex/);
  });

  it("defaults the gas price to the minimum", () => {
    const tx = buildDeployTx({ inputs: INPUTS, pubKey: PUBKEY, nonce: 0n, gasLimit: 100_000n, initCode: "00" });
    assert.equal(tx.gasPrice, 1n);
  });

  it("rejects a signer that does not return 64 bytes", async () => {
    await assert.rejects(signEVMTx(deployTx(), () => new Uint8Array(32)), /64-byte/);
  });

  it("refuses values that do not fit their wire field", async () => {
    assert.throws(() => encodeEVMTx({ ...deployTx(), nonce: -1n }), /nonce/);
    assert.throws(() => encodeEVMTx({ ...deployTx(), gasLimit: 1n << 64n }), /does not fit/);
    const signed = await signEVMTx(deployTx(), vectorSigner(DEPLOY));
    assert.throws(() => evmTxHex({ ...signed, signature: new Uint8Array(63) }), /64-byte/);
    await assert.rejects(vtxoId(signed, -1), /uint32/);
    await assert.rejects(vtxoId(signed, 2 ** 32), /uint32/);
  });

  it("signs a snapshot, so edits during an async signer do not leak into the result", async () => {
    const tx = deployTx();
    const signed = await signEVMTx(tx, async (sigHash) => {
      tx.data[0] ^= 0xff;
      tx.nonce = 9n;
      return vectorSigner(DEPLOY)(sigHash);
    });
    assert.equal(evmTxHex(signed), DEPLOY.hex);
  });
});

describe("EVM gas fees", () => {
  it("prices gas in millisats, rounding up", () => {
    assert.equal(gasFeeSats(21_000n, 1n), 21n);
    assert.equal(gasFeeSats(1n, 1n), 1n);
    assert.equal(gasFeeSats(1_000n, 1_000n), 1_000n);
    assert.equal(gasFeeSats(0n, 5n), 0n);
    assert.equal(maxGasFeeSats(deployTx()), 400_000n);
  });
});

describe("TachiClient EVM methods", () => {
  function client(body: unknown) {
    const calls: { input: string; init?: RequestInit }[] = [];
    const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ input: String(input), init });
      return { ok: true, status: 200, statusText: "OK", json: async () => body } as Response;
    };
    return { c: new TachiClient({ baseUrl: "https://example.com", fetch }), calls };
  }

  it("evmCall posts the request to /tachi_evmCall", async () => {
    const { c, calls } = client({ status: 1, gas_used: 2400, return_data: "0x01", logs: [] });
    const res = await c.evmCall({ to: "0xc0ffee0000000000000000000000000000000000", data: "0x70a08231" });
    assert.equal(res.status, 1);
    assert.ok(calls[0].input.endsWith("/tachi_evmCall"));
    assert.equal(calls[0].init?.method, "POST");
    assert.deepEqual(JSON.parse(String(calls[0].init?.body)), {
      to: "0xc0ffee0000000000000000000000000000000000",
      data: "0x70a08231",
    });
  });

  it("getEvmCode and getEvmReceipt query by address and hash", async () => {
    const { c, calls } = client({ address: "0x00", code: "0x" });
    await c.getEvmCode("0xc0ffee0000000000000000000000000000000000");
    await c.getEvmReceipt(DEPLOY.hash);
    assert.ok(calls[0].input.includes("/tachi_evmCode?address=0xc0ffee"));
    assert.ok(calls[1].input.includes(`/tachi_evmReceipt?hash=${DEPLOY.hash}`));
  });

  it("getEvmNonce returns the nonce to sign with, not next_nonce", async () => {
    const { c, calls } = client({ address: PUBKEY, nonce: 3, next_nonce: 4 });
    assert.equal(await c.getEvmNonce(PUBKEY), 3n);
    assert.ok(calls[0].input.includes(`/tachi_nonce?address=${PUBKEY}`));
  });

  it("sendEvmTx broadcasts the signed hex", async () => {
    const { c, calls } = client({ jsonrpc: "2.0", id: 1, result: { code: 0 } });
    await c.sendEvmTx(await signEVMTx(deployTx(), vectorSigner(DEPLOY)));
    assert.ok(String(calls[0].init?.body).includes(DEPLOY.hex));
  });
});
