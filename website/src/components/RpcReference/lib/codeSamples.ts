import type { Operation } from "./spec";

export function buildUrl(server: string, op: Operation, values: Record<string, string>): string {
  let path = op.path;
  const query: string[] = [];
  for (const p of op.parameters) {
    const value = values[p.name];
    if (!value) continue;
    if (p.in === "path") path = path.replace(`{${p.name}}`, encodeURIComponent(value));
    if (p.in === "query") query.push(`${encodeURIComponent(p.name)}=${encodeURIComponent(value)}`);
  }
  const qs = query.length ? `?${query.join("&")}` : "";
  return `${server}${path}${qs}`;
}

export function headerParams(op: Operation, values: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const p of op.parameters) {
    if (p.in !== "header" || !values[p.name]) continue;
    headers[p.name] = p.name.toLowerCase() === "x-api-key" ? "$TACHI_API_KEY" : values[p.name];
  }
  return headers;
}

export function generateCurl(server: string, op: Operation, values: Record<string, string>, body?: string): string {
  const url = buildUrl(server, op, values);
  const headers = headerParams(op, values);
  const parts = [`curl -X ${op.method} \\`, `  '${url}'`];
  for (const [k, v] of Object.entries(headers)) parts.push(` \\\n  -H '${k}: ${v}'`);
  if (body) parts.push(` \\\n  -H 'Content-Type: application/json' \\\n  -d '${body}'`);
  return parts.join("");
}

export function generateJs(server: string, op: Operation, values: Record<string, string>, body?: string): string {
  const url = buildUrl(server, op, values);
  const headers = { ...headerParams(op, values), ...(body ? { "Content-Type": "application/json" } : {}) };
  const hasHeaders = Object.keys(headers).length > 0;
  const opts = [`  method: "${op.method}"`];
  if (hasHeaders) opts.push(`  headers: ${JSON.stringify(headers)}`);
  if (body) opts.push(`  body: ${JSON.stringify(body)}`);
  return `const res = await fetch("${url}", {\n${opts.join(",\n")}\n});\nconst data = await res.json();`;
}

export function generatePython(server: string, op: Operation, values: Record<string, string>, body?: string): string {
  const url = buildUrl(server, op, values);
  const headers = headerParams(op, values);
  const args = [`"${url}"`];
  if (Object.keys(headers).length) args.push(`headers=${JSON.stringify(headers)}`);
  if (body) args.push(`json=${body}`);
  return `import requests\n\nresp = requests.${op.method.toLowerCase()}(${args.join(", ")})\nprint(resp.json())`;
}

export function generateGo(server: string, op: Operation, values: Record<string, string>, body?: string): string {
  const url = buildUrl(server, op, values);
  const headers = headerParams(op, values);
  const bodyArg = body ? `strings.NewReader(\`${body}\`)` : "nil";
  const lines = [
    `package main`,
    ``,
    `import (`,
    `\t"fmt"`,
    `\t"io"`,
    `\t"net/http"`,
    body ? `\t"strings"` : undefined,
    `)`,
    ``,
    `func main() {`,
    `\treq, _ := http.NewRequest("${op.method}", "${url}", ${bodyArg})`,
  ];
  for (const [k, v] of Object.entries(headers)) lines.push(`\treq.Header.Set("${k}", "${v}")`);
  if (body) lines.push(`\treq.Header.Set("Content-Type", "application/json")`);
  lines.push(
    `\tresp, err := http.DefaultClient.Do(req)`,
    `\tif err != nil {`,
    `\t\tpanic(err)`,
    `\t}`,
    `\tdefer resp.Body.Close()`,
    `\tdata, _ := io.ReadAll(resp.Body)`,
    `\tfmt.Println(string(data))`,
    `}`,
  );
  return lines.filter((l) => l !== undefined).join("\n");
}

export function generatePhp(server: string, op: Operation, values: Record<string, string>, body?: string): string {
  const url = buildUrl(server, op, values);
  const headers = { ...headerParams(op, values), ...(body ? { "Content-Type": "application/json" } : {}) };
  const headerLines = Object.entries(headers).map(([k, v]) => `    "${k}: ${v}",`);
  const lines = [
    `$ch = curl_init("${url}");`,
    `curl_setopt($ch, CURLOPT_CUSTOMREQUEST, "${op.method}");`,
    `curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);`,
  ];
  if (headerLines.length) lines.push(`curl_setopt($ch, CURLOPT_HTTPHEADER, [\n${headerLines.join("\n")}\n]);`);
  if (body) lines.push(`curl_setopt($ch, CURLOPT_POSTFIELDS, '${body}');`);
  lines.push(`$response = curl_exec($ch);`, `curl_close($ch);`, `echo $response;`);
  return lines.join("\n");
}

export function generateRuby(server: string, op: Operation, values: Record<string, string>, body?: string): string {
  const url = buildUrl(server, op, values);
  const headers = headerParams(op, values);
  const lines = [
    `require "net/http"`,
    `require "uri"`,
    ``,
    `uri = URI("${url}")`,
    `req = Net::HTTP::${op.method[0]}${op.method.slice(1).toLowerCase()}.new(uri)`,
  ];
  for (const [k, v] of Object.entries(headers)) lines.push(`req["${k}"] = "${v}"`);
  if (body) lines.push(`req["Content-Type"] = "application/json"`, `req.body = '${body}'`);
  lines.push(
    ``,
    `res = Net::HTTP.start(uri.host, uri.port, use_ssl: uri.scheme == "https") { |http| http.request(req) }`,
    `puts res.body`,
  );
  return lines.join("\n");
}
