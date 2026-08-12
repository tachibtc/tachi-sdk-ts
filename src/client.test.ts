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

  describe("API key transport safety", () => {
    const vaultBody = { user: "ab", vaults: [], page: 1, page_size: 50, total: 0, total_pages: 0 };

    it("refuses to send an apiKey over http to a remote host", async () => {
      const mock = createMockFetch(vaultBody);
      const client = new TachiClient({ baseUrl: "http://daemon.example.com", fetch: mock.fn });
      await assert.rejects(
        () => client.listVaults("bcrt1p...", { apiKey: "secret" }),
        /Refusing to send an API key over http/,
      );
      assert.equal(mock.calls.length, 0, "must not hit the network before refusing");
    });

    it("allows an apiKey over http to loopback", async () => {
      for (const host of ["http://127.0.0.1:8080", "http://localhost:8080"]) {
        const mock = createMockFetch(vaultBody);
        const client = new TachiClient({ baseUrl: host, fetch: mock.fn });
        await client.listVaults("bcrt1p...", { apiKey: "secret" });
        assert.deepEqual(mock.calls[0].init?.headers, { "X-Api-Key": "secret" });
      }
    });

    // A prefix test like /^127\./ also matches DNS names that merely start with
    // "127." and resolve wherever the owner points them. Each of these would
    // have passed the old check and leaked the key in cleartext.
    it("rejects hostnames that only look like loopback", async () => {
      const impostors = [
        "http://127.evil.com",
        "http://127.0.0.1.attacker.com",
        "http://127.0.0.1.evil.co.uk",
        "http://localhost.evil.com",
        "http://notlocalhost",
      ];
      for (const base of impostors) {
        const mock = createMockFetch(vaultBody);
        const client = new TachiClient({ baseUrl: base, fetch: mock.fn });
        await assert.rejects(
          () => client.listVaults("bcrt1p...", { apiKey: "secret" }),
          /Refusing to send an API key/,
          `${base} must not be treated as loopback`,
        );
        assert.equal(mock.calls.length, 0, `${base} must not hit the network`);
      }
    });

    it("rejects out-of-range dotted quads at construction", async () => {
      // These never reach the loopback check — URL itself refuses them, which
      // is why the octet bound in isLoopbackHost is belt-and-braces.
      for (const base of ["http://1270.0.0.1", "http://127.999.0.1"]) {
        assert.throws(() => new TachiClient({ baseUrl: base }), /Invalid URL/, base);
      }
    });

    it("still accepts genuine loopback forms over http", async () => {
      // URL normalizes shorthand/octal/IPv6 forms before the check sees them.
      const real = [
        "http://127.0.0.1:8080",
        "http://127.1",
        "http://0177.0.0.1",
        "http://127.255.255.254",
        "http://localhost:3000",
        "http://LOCALHOST",
        "http://[::1]:8080",
        "http://[0:0:0:0:0:0:0:1]",
      ];
      for (const base of real) {
        const mock = createMockFetch(vaultBody);
        const client = new TachiClient({ baseUrl: base, fetch: mock.fn });
        await client.listVaults("bcrt1p...", { apiKey: "secret" });
        assert.deepEqual(mock.calls[0].init?.headers, { "X-Api-Key": "secret" }, base);
      }
    });

    it("allows an apiKey over https to a remote host", async () => {
      const mock = createMockFetch(vaultBody);
      const client = new TachiClient({ baseUrl: "https://daemon.example.com", fetch: mock.fn });
      await client.listVaults("bcrt1p...", { apiKey: "secret" });
      assert.deepEqual(mock.calls[0].init?.headers, { "X-Api-Key": "secret" });
    });

    it("still allows unauthenticated calls over http to a remote host", async () => {
      const mock = createMockFetch(vaultBody);
      const client = new TachiClient({ baseUrl: "http://daemon.example.com", fetch: mock.fn });
      await client.listVaults("bcrt1p...");
      assert.equal(mock.calls.length, 1);
    });
  });

  describe("response size limit", () => {
    /** A Response whose body streams `size` bytes of JSON in small chunks. */
    function streamingResponse(size: number, declaredLength?: number): Response {
      const payload = new TextEncoder().encode(`"${"x".repeat(Math.max(size - 2, 0))}"`);
      let sent = 0;
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        headers: { get: (k: string) => (k.toLowerCase() === "content-length" && declaredLength !== undefined ? String(declaredLength) : null) },
        body: {
          getReader: () => ({
            read: async () => {
              if (sent >= payload.byteLength) return { done: true, value: undefined };
              const chunk = payload.subarray(sent, sent + 1024);
              sent += chunk.byteLength;
              return { done: false, value: chunk };
            },
            cancel: async () => {},
          }),
        },
        json: async () => JSON.parse(new TextDecoder().decode(payload)),
      } as unknown as Response;
    }

    it("rejects a streamed body that exceeds the cap", async () => {
      const client = new TachiClient({
        baseUrl: "https://example.com",
        maxResponseBytes: 4096,
        fetch: async () => streamingResponse(20_000),
      });
      await assert.rejects(() => client.getHealth(), /response too large/);
    });

    it("rejects early on an oversized content-length", async () => {
      const client = new TachiClient({
        baseUrl: "https://example.com",
        maxResponseBytes: 4096,
        fetch: async () => streamingResponse(10, 999_999),
      });
      await assert.rejects(() => client.getHealth(), /exceeds limit of 4096/);
    });

    it("accepts a body under the cap", async () => {
      const client = new TachiClient({
        baseUrl: "https://example.com",
        maxResponseBytes: 1024 * 1024,
        fetch: async () => streamingResponse(5000),
      });
      const result = await client.getHealth();
      assert.equal(typeof result, "string");
    });

    it("skips the check when maxResponseBytes is 0", async () => {
      const client = new TachiClient({
        baseUrl: "https://example.com",
        maxResponseBytes: 0,
        fetch: async () => streamingResponse(20_000),
      });
      await assert.doesNotReject(() => client.getHealth());
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
    /** A non-OK Response whose body carries the daemon's explanation. */
    function errorResponse(status: number, body: string): Response {
      return {
        ok: false,
        status,
        statusText: status === 400 ? "Bad Request" : "Error",
        text: async () => body,
        json: async () => ({}),
      } as unknown as Response;
    }

    it("throws on non-OK GET responses", async () => {
      const { client } = makeClient({}, 500);
      await assert.rejects(() => client.getHealth(), /GET \/health failed: 500/);
    });

    it("throws on non-OK POST responses", async () => {
      const { client } = makeClient({}, 404);
      await assert.rejects(() => client.broadcastTxSync("abc"), /POST .* failed: 404/);
    });

    it("includes the daemon's error body in GET failures", async () => {
      const detail = 'address "bc1q..." is not a taproot (P2TR) address — use a bc1p address';
      const client = new TachiClient({
        baseUrl: "https://example.com",
        fetch: async () => errorResponse(400, detail),
      });
      await assert.rejects(
        () => client.getAddressVtxos("bc1q..."),
        (e: Error) => {
          assert.match(e.message, /GET \/tachi_addressVtxos failed: 400 Bad Request/);
          assert.match(e.message, /is not a taproot \(P2TR\) address/);
          return true;
        },
      );
    });

    it("includes the daemon's error body in POST failures", async () => {
      const client = new TachiClient({
        baseUrl: "https://example.com",
        fetch: async () => errorResponse(400, "missing tx field"),
      });
      await assert.rejects(() => client.broadcastTxSync("abc"), /400 Bad Request — missing tx field/);
    });

    it("truncates a very long error body", async () => {
      const client = new TachiClient({
        baseUrl: "https://example.com",
        fetch: async () => errorResponse(500, "x".repeat(5000)),
      });
      await assert.rejects(() => client.getHealth(), (e: Error) => {
        assert.ok(e.message.length < 700, `message not truncated: ${e.message.length} chars`);
        assert.ok(e.message.endsWith("…"));
        return true;
      });
    });

    it("falls back to the status line when the body is unreadable", async () => {
      const client = new TachiClient({
        baseUrl: "https://example.com",
        fetch: async () =>
          ({
            ok: false,
            status: 502,
            statusText: "Bad Gateway",
            text: async () => {
              throw new Error("stream already consumed");
            },
          }) as unknown as Response,
      });
      await assert.rejects(() => client.getHealth(), /GET \/health failed: 502 Bad Gateway$/);
    });

    it("tags timeouts with the endpoint and host", async () => {
      const client = new TachiClient({
        baseUrl: "https://daemon.example.com",
        timeoutMs: 5,
        fetch: async () => {
          const err = new Error("The operation was aborted due to timeout");
          err.name = "TimeoutError";
          throw err;
        },
      });
      await assert.rejects(() => client.getHealth(), (e: Error) => {
        assert.match(e.message, /GET \/health timed out after 5ms \(daemon\.example\.com\)/);
        assert.equal((e.cause as Error).name, "TimeoutError");
        return true;
      });
    });

    it("tags non-timeout transport failures with the endpoint", async () => {
      const client = new TachiClient({
        baseUrl: "https://daemon.example.com",
        fetch: async () => {
          throw new TypeError("fetch failed");
        },
      });
      await assert.rejects(
        () => client.broadcastTxSync("ab"),
        /POST \/tachi_txBroadcastSync request failed: fetch failed \(daemon\.example\.com\)/,
      );
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
  describe("address endpoints", () => {
    it("passes address to getAddress/getBalance/getNonce", async () => {
      for (const [fn, path] of [
        ["getAddress", "/tachi_address"],
        ["getBalance", "/tachi_balance"],
        ["getNonce", "/tachi_nonce"],
      ] as const) {
        const { client, calls } = makeClient({});
        await (client as never as Record<string, (a: string) => Promise<unknown>>)[fn]("bcrt1p...");
        assert.ok(calls[0].input.includes(`${path}?address=bcrt1p`), `${fn} -> ${calls[0].input}`);
      }
    });

    it("maps cursor options to before_height/page_size", async () => {
      const { client, calls } = makeClient({ transactions: [] });
      await client.getAddressTransactions("bcrt1p...", { beforeHeight: 500, pageSize: 10 });
      assert.ok(calls[0].input.includes("before_height=500"));
      assert.ok(calls[0].input.includes("page_size=10"));
    });

    it("omits cursor params when not supplied", async () => {
      const { client, calls } = makeClient({ transactions: [] });
      await client.listTransactions();
      assert.ok(calls[0].input.endsWith("/tachi_listTransactions"));
    });
  });

  describe("transaction endpoints", () => {
    it("maps optional proof flags onto the query string", async () => {
      const { client, calls } = makeClient({});
      await client.getTransaction("abc", { hat: true, rip: true, vtxoId: "vv", originEpoch: 1, finalEpoch: 2 });
      const u = calls[0].input;
      assert.ok(u.includes("hash=abc"));
      assert.ok(u.includes("hat=true"));
      assert.ok(u.includes("rip=true"));
      assert.ok(u.includes("vtxo_id=vv"));
      assert.ok(u.includes("origin_epoch=1"));
      assert.ok(u.includes("final_epoch=2"));
    });

    it("omits proof flags when false or absent", async () => {
      const { client, calls } = makeClient({});
      await client.getTransaction("abc", { hat: false });
      assert.ok(!calls[0].input.includes("hat="));
      assert.ok(!calls[0].input.includes("rip="));
    });

    // The daemon takes `hex` here, not the `tx` field the broadcast endpoints
    // use. Getting this wrong yields a 400 that only shows up against a live
    // daemon, so pin it.
    it("sends decode/validate bodies as { hex }", async () => {
      for (const fn of ["decodeTransaction", "validateTransaction"] as const) {
        const { client, calls } = makeClient({});
        await client[fn]("deadbeef");
        const body = JSON.parse(calls[0].init?.body as string);
        assert.deepEqual(body, { hex: "deadbeef" }, `${fn} body`);
      }
    });
  });

  describe("block endpoints", () => {
    it("accepts height or hash", async () => {
      const { client, calls } = makeClient({});
      await client.getBlock({ height: 7 });
      assert.ok(calls[0].input.includes("height=7"));

      const b = makeClient({});
      await b.client.getBlockHeader({ hash: "ff" });
      assert.ok(b.calls[0].input.includes("hash=ff"));
    });

    it("rejects a selector with neither height nor hash, before any request", async () => {
      for (const fn of ["getBlock", "getBlockHeader"] as const) {
        const mock = createMockFetch({});
        const client = new TachiClient({ baseUrl: "https://example.com", fetch: mock.fn });
        await assert.rejects(() => client[fn]({}), /requires either a height or a hash/);
        assert.equal(mock.calls.length, 0, `${fn} must not hit the network`);
      }
    });
  });

  describe("getEpoch", () => {
    it("accepts exactly one of id or hash", async () => {
      const a = makeClient({});
      await a.client.getEpoch({ id: 3 });
      assert.ok(a.calls[0].input.includes("id=3"));

      const b = makeClient({});
      await b.client.getEpoch({ hash: "ab" });
      assert.ok(b.calls[0].input.includes("hash=ab"));
    });

    // The daemon rejects both the empty and the both-supplied forms; fail at
    // the call site rather than after a round trip.
    it("rejects neither-or-both without hitting the network", async () => {
      for (const sel of [{}, { id: 1, hash: "ab" }]) {
        const mock = createMockFetch({});
        const client = new TachiClient({ baseUrl: "https://example.com", fetch: mock.fn });
        await assert.rejects(() => client.getEpoch(sel), /exactly one of id or hash/);
        assert.equal(mock.calls.length, 0);
      }
    });
  });

  describe("watch", () => {
    /** Minimal scriptable WebSocket stand-in. */
    function fakeSocket(frames: unknown[], opts?: { closeAfter?: boolean; error?: boolean }) {
      const instances: Array<Record<string, unknown>> = [];
      class Fake {
        onmessage?: (ev: { data: string }) => void;
        onerror?: () => void;
        onclose?: () => void;
        closed = false;
        url: string;
        constructor(url: string) {
          this.url = url;
          instances.push(this as never as Record<string, unknown>);
          queueMicrotask(() => {
            for (const f of frames) this.onmessage?.({ data: JSON.stringify(f) });
            if (opts?.error) this.onerror?.();
            if (opts?.closeAfter) this.onclose?.();
          });
        }
        close() {
          this.closed = true;
        }
      }
      return { Fake: Fake as never as typeof globalThis.WebSocket, instances };
    }

    it("builds a ws:// or wss:// URL with the filters", async () => {
      const { Fake, instances } = fakeSocket([{ event: "block" }], { closeAfter: true });
      const client = new TachiClient({ baseUrl: "https://example.com" });
      const seen = [];
      for await (const ev of client.watch({ blocks: true, address: "bcrt1p" }, { WebSocket: Fake })) {
        seen.push(ev);
      }
      const url = String(instances[0].url);
      assert.ok(url.startsWith("wss://example.com/tachi_ws?"), url);
      assert.ok(url.includes("blocks=true"));
      assert.ok(url.includes("address=bcrt1p"));
      assert.equal(seen.length, 1);
    });

    it("uses ws:// for an http baseUrl", async () => {
      const { Fake, instances } = fakeSocket([], { closeAfter: true });
      const client = new TachiClient({ baseUrl: "http://127.0.0.1:8080" });
      const stream = client.watch({ blocks: true }, { WebSocket: Fake });
      await stream.next();
      await stream.return(undefined);
      assert.ok(String(instances[0].url).startsWith("ws://127.0.0.1:8080/"));
    });

    it("requires at least one filter", async () => {
      const client = new TachiClient({ baseUrl: "https://example.com" });
      const { Fake, instances } = fakeSocket([]);
      await assert.rejects(
        () => client.watch({}, { WebSocket: Fake }).next(),
        /requires at least one filter/,
      );
      assert.equal(instances.length, 0, "must not open a socket");
    });

    it("yields queued events in order and closes the socket on break", async () => {
      const { Fake, instances } = fakeSocket([
        { event: "block", n: 1 },
        { event: "block", n: 2 },
        { event: "block", n: 3 },
      ]);
      const client = new TachiClient({ baseUrl: "https://example.com" });
      const got: number[] = [];
      for await (const ev of client.watch({ blocks: true }, { WebSocket: Fake })) {
        got.push(ev.n as number);
        if (got.length === 2) break;
      }
      assert.deepEqual(got, [1, 2]);
      assert.equal(instances[0].closed, true, "socket must close when the loop exits");
    });

    it("ignores unparseable frames rather than killing the stream", async () => {
      // A malformed frame must be skipped, not abort the iteration: the good
      // frame after it still has to arrive.
      const { Fake, instances } = fakeSocket([]);
      const client = new TachiClient({ baseUrl: "https://example.com" });
      const it = client.watch({ blocks: true }, { WebSocket: Fake });
      const pending = it.next();
      await new Promise((r) => setTimeout(r, 0));
      const sock = instances[0] as unknown as {
        onmessage: (ev: { data: string }) => void;
      };
      sock.onmessage({ data: "{not json" });
      sock.onmessage({ data: JSON.stringify({ event: "block", n: 9 }) });
      const first = await pending;
      assert.equal((first.value as { n: number }).n, 9);
      await it.return(undefined);
    });

    it("bounds the queue when the consumer falls behind", async () => {
      // Sustained delivery against a consumer that never drains: the queue must
      // stop growing and fail loudly rather than expanding without limit.
      const { Fake, instances } = fakeSocket([]);
      const client = new TachiClient({ baseUrl: "https://example.com" });
      const it = client.watch({ blocks: true }, { WebSocket: Fake, maxQueuedEvents: 5 });
      const pending = it.next();
      await new Promise((r) => setTimeout(r, 0));
      const sock = instances[0] as unknown as { onmessage: (ev: { data: string }) => void };

      // First frame satisfies the pending next(); the rest pile up unconsumed.
      for (let i = 0; i < 50; i++) {
        sock.onmessage({ data: JSON.stringify({ event: "block", n: i }) });
      }
      await pending;

      // Events already buffered are still delivered — the bound stops growth,
      // it doesn't discard what was legitimately received. The error surfaces
      // once the buffer drains.
      let drained = 0;
      await assert.rejects(async () => {
        for (;;) {
          const r = await it.next();
          if (r.done) throw new Error("stream ended without reporting the overflow");
          drained++;
          if (drained > 20) throw new Error("queue grew past the bound");
        }
      }, /event queue exceeded 5 entries/);
      assert.ok(drained <= 5, `queue should have been capped, drained ${drained}`);
      assert.equal(instances[0].closed, true, "socket must close when the bound trips");
    });

    it("allows an unbounded queue when maxQueuedEvents is 0", async () => {
      const { Fake, instances } = fakeSocket([]);
      const client = new TachiClient({ baseUrl: "https://example.com" });
      const it = client.watch({ blocks: true }, { WebSocket: Fake, maxQueuedEvents: 0 });
      const pending = it.next();
      await new Promise((r) => setTimeout(r, 0));
      const sock = instances[0] as unknown as { onmessage: (ev: { data: string }) => void };
      for (let i = 0; i < 200; i++) {
        sock.onmessage({ data: JSON.stringify({ event: "block", n: i }) });
      }
      const first = await pending;
      assert.equal((first.value as { n: number }).n, 0);
      const second = await it.next();
      assert.equal((second.value as { n: number }).n, 1);
      await it.return(undefined);
    });

    it("surfaces a socket error", async () => {
      const { Fake } = fakeSocket([], { error: true });
      const client = new TachiClient({ baseUrl: "https://example.com" });
      await assert.rejects(async () => {
        const stream = client.watch({ blocks: true }, { WebSocket: Fake });
        while (!(await stream.next()).done) {
          // drain until the socket error surfaces
        }
      }, /websocket error/);
    });

    it("stops when the abort signal fires", async () => {
      const { Fake, instances } = fakeSocket([]);
      const ac = new AbortController();
      const client = new TachiClient({ baseUrl: "https://example.com" });
      const done = (async () => {
        const stream = client.watch({ blocks: true }, { WebSocket: Fake, signal: ac.signal });
        while (!(await stream.next()).done) {
          // never yields; ends when the abort closes the stream
        }
      })();
      queueMicrotask(() => ac.abort());
      await done;
      assert.equal(instances[0].closed, true);
    });
  });
});
