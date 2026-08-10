import { useState } from "react";
import type { Operation, Spec } from "./lib/spec";
import { exampleValue } from "./lib/spec";
import { SERVERS } from "./lib/servers";

export default function TryIt({
  op,
  spec,
  server,
  values,
}: {
  op: Operation;
  spec: Spec;
  server: string;
  values: Record<string, string>;
}) {
  const bodyParam = op.parameters.find((p) => p.in === "body");
  const [bodyText, setBodyText] = useState(() =>
    bodyParam ? JSON.stringify(exampleValue(bodyParam.schema, spec.definitions), null, 2) : "",
  );
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ status: number; body: string } | { error: string } | null>(null);
  const [copied, setCopied] = useState(false);

  async function copyResult() {
    if (!result || !("status" in result)) return;
    await navigator.clipboard.writeText(formatJson(result.body));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function send() {
    setLoading(true);
    setResult(null);
    let path = op.path;
    const query: string[] = [];
    const headers: Record<string, string> = {};
    for (const p of op.parameters) {
      const value = values[p.name];
      if (!value) continue;
      if (p.in === "path") path = path.replace(`{${p.name}}`, encodeURIComponent(value));
      if (p.in === "query") query.push(`${encodeURIComponent(p.name)}=${encodeURIComponent(value)}`);
      if (p.in === "header") headers[p.name] = value;
    }
    if (query.length) path += `?${query.join("&")}`;
    if (bodyParam) headers["Content-Type"] = "application/json";

    try {
      const res = await fetch(`${server}${path}`, {
        method: op.method,
        headers,
        body: bodyParam ? bodyText : undefined,
      });
      const text = await res.text();
      setResult({ status: res.status, body: text });
    } catch (err) {
      setResult({ error: err instanceof Error ? err.message : "Request failed (daemon may be unreachable or CORS-blocked)" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="tryit">
      <div className="tryit-row">
        <span className="tryit-server">{SERVERS.find((s) => s.url === server)?.label ?? server}</span>
        <button className="btn-primary" onClick={send} disabled={loading}>
          {loading ? "Sending…" : "Send"}
        </button>
      </div>
      {bodyParam && (
        <textarea
          className="tryit-body"
          value={bodyText}
          onChange={(e) => setBodyText(e.target.value)}
          spellCheck={false}
          rows={8}
        />
      )}
      {result && "error" in result && <div className="tryit-error">{result.error}</div>}
      {result && "status" in result && (
        <div className="tryit-result">
          <div className="tryit-result-head">
            <div className={`status-pill status-${Math.floor(result.status / 100)}xx`}>{result.status}</div>
            <button className="code-copy" onClick={copyResult}>
              {copied ? "copied" : "copy"}
            </button>
          </div>
          <pre>{formatJson(result.body)}</pre>
        </div>
      )}
    </div>
  );
}

function formatJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}
