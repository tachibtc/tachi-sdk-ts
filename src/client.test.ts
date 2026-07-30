import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { TachiClient } from "./client";

interface CallRecord {
  input: string;
  init?: RequestInit;
}

function createMockFetch(body: unknown, status = 200) {
  const calls: CallRecord[] = [];
  const fn = async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input: String(input), init });
    return {
      ok: status >= 200 && status < 300,
      status,
      statusText: status === 200 ? "OK" : "Error",
      json: async () => body,
    } as Response;
  };
  return { fn, calls };
}

function makeClient(body: unknown, status = 200) {
  const mock = createMockFetch(body, status);
  const client = new TachiClient({ baseUrl: "https://example.com", fetch: mock.fn });
  return { client, calls: mock.calls };
}

describe("TachiClient", () => {
  describe("getHealth", () => {
    it("calls GET /health and returns HealthResponse", async () => {
      const { client, calls } = makeClient({ status: "ok", validators: 3 });
      const result = await client.getHealth();
      assert.deepEqual(result, { status: "ok", validators: 3 });
      assert.ok(calls[0].input.endsWith("/health"));
    });
  });

  describe("getStatus", () => {
    it("calls GET /tachi_status", async () => {
      const { client, calls } = makeClient({ id: 1, jsonrpc: "2.0", result: {} });
      await client.getStatus();
      assert.ok(calls[0].input.endsWith("/tachi_status"));
    });
  });

  describe("getPeerInfo", () => {
    it("calls GET /tachi_peerInfo", async () => {
      const { client, calls } = makeClient({ peer_id: "abc", pub_key_hex: "def", host: "127.0.0.1", p2p_port: 26656, rpc_addr: "http://localhost" });
      const result = await client.getPeerInfo();
      assert.equal(result.peer_id, "abc");
      assert.ok(calls[0].input.endsWith("/tachi_peerInfo"));
    });
  });

  describe("getValidators", () => {
    it("calls GET /tachi_validators", async () => {
      const { client, calls } = makeClient({ count: 1, validators: [] });
      const result = await client.getValidators();
      assert.equal(result.count, 1);
      assert.ok(calls[0].input.endsWith("/tachi_validators"));
    });
  });

  describe("getValidatorCount", () => {
    it("calls GET /tachi_validators/count", async () => {
      const { client } = makeClient({ count: 5 });
      const result = await client.getValidatorCount();
      assert.equal(result.count, 5);
    });
  });

  describe("getLiveValidators", () => {
    it("calls GET /tachi_validators/live", async () => {
      const { client } = makeClient({ count: 2, total_known: 5, validators: [] });
      const result = await client.getLiveValidators();
      assert.equal(result.count, 2);
      assert.equal(result.total_known, 5);
    });
  });

  describe("waitForValidatorsReady", () => {
    it("passes expected param in query string", async () => {
      const { client, calls } = makeClient({ count: 3, ready: true, validators: [] });
      const result = await client.waitForValidatorsReady(3);
      assert.equal(result.ready, true);
      assert.ok(calls[0].input.includes("expected=3"));
    });

    it("works without expected param", async () => {
      const { client, calls } = makeClient({ count: 2, ready: true, validators: [] });
      await client.waitForValidatorsReady();
      assert.ok(!calls[0].input.includes("expected="));
    });
  });

  describe("getVtxo", () => {
    it("passes the id as a query param", async () => {
      const { client, calls } = makeClient({ id: "ab", owner: "cd", amount: 1000, script: "ef", height: 42, spent: false });
      const result = await client.getVtxo("ab");
      assert.equal(result.amount, 1000);
      assert.ok(calls[0].input.includes("/tachi_vtxo?id=ab"));
    });
  });

  describe("listVtxos", () => {
    it("passes pagination params when provided", async () => {
      const { client, calls } = makeClient({ vtxos: [], page: 2, page_size: 10, total: 0, total_pages: 0 });
      const result = await client.listVtxos({ page: 2, page_size: 10 });
      assert.equal(result.page, 2);
      assert.ok(calls[0].input.includes("page=2"));
      assert.ok(calls[0].input.includes("page_size=10"));
    });

    it("omits pagination params when not provided", async () => {
      const { client, calls } = makeClient({ vtxos: [], page: 1, page_size: 50, total: 0, total_pages: 0 });
      await client.listVtxos();
      assert.ok(calls[0].input.endsWith("/tachi_listVtxos"));
    });
  });

  describe("getAddressVtxos", () => {
    it("requests unspent VTXOs by default", async () => {
      const { client, calls } = makeClient({ pubkey: "ab", count: 0, vtxos: [] });
      await client.getAddressVtxos("bcrt1p...");
      assert.ok(calls[0].input.includes("address=bcrt1p"));
      assert.ok(!calls[0].input.includes("include_spent"));
    });

    it("sets include_spent when requested", async () => {
      const { client, calls } = makeClient({ pubkey: "ab", count: 0, vtxos: [] });
      await client.getAddressVtxos("bcrt1p...", true);
      assert.ok(calls[0].input.includes("include_spent=true"));
    });
  });

  describe("getLockedVtxos", () => {
    it("passes the vault as a query param", async () => {
      const { client, calls } = makeClient({ vault: "bcrt1p", count: 0, vtxos: [] });
      await client.getLockedVtxos("bcrt1p");
      assert.ok(calls[0].input.includes("/tachi_vtxoLocked?vault=bcrt1p"));
    });
  });

  describe("listVaults", () => {
    it("passes the user and pagination params", async () => {
      const { client, calls } = makeClient({ user: "ab", vaults: [], page: 1, page_size: 50, total: 0, total_pages: 0 });
      await client.listVaults("bcrt1p...", { page: 3 });
      assert.ok(calls[0].input.includes("user=bcrt1p"));
      assert.ok(calls[0].input.includes("page=3"));
      assert.equal(calls[0].init?.headers, undefined);
    });

    it("sends X-Api-Key when an apiKey is supplied", async () => {
      const { client, calls } = makeClient({ user: "ab", vaults: [], page: 1, page_size: 50, total: 0, total_pages: 0 });
      await client.listVaults("bcrt1p...", { apiKey: "secret" });
      assert.deepEqual(calls[0].init?.headers, { "X-Api-Key": "secret" });
    });
  });

  describe("getNetInfo", () => {
    it("calls GET /tachi_netInfo", async () => {
      const { client, calls } = makeClient({ id: 1, jsonrpc: "2.0", result: {} });
      await client.getNetInfo();
      assert.ok(calls[0].input.endsWith("/tachi_netInfo"));
    });
  });

  describe("broadcastTxAsync", () => {
    it("sends POST with tx hex", async () => {
      const { client, calls } = makeClient({ id: 1, jsonrpc: "2.0", result: {} });
      await client.broadcastTxAsync("deadbeef");
      assert.equal(calls[0].init?.method, "POST");
      assert.ok(calls[0].input.includes("/tachi_txBroadcastAsync"));
      const sentBody = JSON.parse(calls[0].init?.body as string);
      assert.equal(sentBody.tx, "deadbeef");
    });
  });

  describe("broadcastTxSync", () => {
    it("sends POST with tx hex", async () => {
      const { client, calls } = makeClient({ id: 1, jsonrpc: "2.0", result: {} });
      await client.broadcastTxSync("cafe");
      assert.ok(calls[0].input.includes("/tachi_txBroadcastSync"));
    });
  });

  describe("query", () => {
    it("passes path, data, height as query params", async () => {
      const { client, calls } = makeClient({ id: 1, jsonrpc: "2.0", result: {} });
      await client.query({ path: "/store/key", data: "0xab", height: "100" });
      const url = calls[0].input;
      assert.ok(url.includes("path=%2Fstore%2Fkey"));
      assert.ok(url.includes("data=0xab"));
      assert.ok(url.includes("height=100"));
    });

    it("omits optional params when not provided", async () => {
      const { client, calls } = makeClient({ id: 1, jsonrpc: "2.0", result: {} });
      await client.query({ path: "/store/key" });
      const url = calls[0].input;
      assert.ok(!url.includes("data="));
      assert.ok(!url.includes("height="));
    });
  });

  describe("bitcoinRPC", () => {
    it("sends JSON-RPC body to POST /", async () => {
      const { client, calls } = makeClient({ jsonrpc: "1.0", result: { blocks: 100 }, error: null, id: "tachi-sdk" });
      const result = await client.bitcoinRPC({ method: "getblockchaininfo" });
      assert.equal(result.result.blocks, 100);
      const sentBody = JSON.parse(calls[0].init?.body as string);
      assert.equal(sentBody.method, "getblockchaininfo");
      assert.equal(sentBody.jsonrpc, "1.0");
      assert.equal(sentBody.id, "tachi-sdk");
    });

    it("allows custom jsonrpc, params, and id", async () => {
      const { client, calls } = makeClient({ jsonrpc: "2.0", result: null, error: null, id: "custom" });
      await client.bitcoinRPC({ method: "getblock", params: ["hash123"], jsonrpc: "2.0", id: "custom" });
      const sentBody = JSON.parse(calls[0].init?.body as string);
      assert.equal(sentBody.jsonrpc, "2.0");
      assert.equal(sentBody.id, "custom");
      assert.deepEqual(sentBody.params, ["hash123"]);
    });
  });

  describe("error handling", () => {
    it("throws on non-OK GET responses", async () => {
      const { client } = makeClient({}, 500);
      await assert.rejects(() => client.getHealth(), /GET \/health failed: 500/);
    });

    it("throws on non-OK POST responses", async () => {
      const { client } = makeClient({}, 404);
      await assert.rejects(() => client.broadcastTxSync("abc"), /POST .* failed: 404/);
    });
  });

  describe("base URL handling", () => {
    it("strips trailing slashes from baseUrl", async () => {
      const mock = createMockFetch({ status: "ok", validators: 0 });
      const client = new TachiClient({ baseUrl: "https://example.com///", fetch: mock.fn });
      await client.getHealth();
      assert.ok(mock.calls[0].input.startsWith("https://example.com/health"));
    });
  });
});
