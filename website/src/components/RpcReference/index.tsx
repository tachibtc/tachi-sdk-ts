import { useEffect, useMemo, useState } from "react";
import { useLocation } from "@docusaurus/router";
import { loadSpec } from "./lib/spec";
import { SERVERS } from "./lib/servers";
import EndpointDetail from "./EndpointDetail";
import rawSpec from "./openapi.json";
import "./styles.css";

export default function RpcReference() {
  const spec = useMemo(() => loadSpec(rawSpec as never), []);
  const location = useLocation();
  const [server, setServer] = useState<string>(SERVERS[0].url);
  const [apiKey, setApiKey] = useState("");

  const selected = useMemo(() => {
    const slug = location.hash.slice(1).toLowerCase();
    return spec.operations.find((op) => op.slug === slug) ?? spec.operations[0] ?? null;
  }, [spec, location.hash]);

  useEffect(() => {
    if (location.hash) window.scrollTo({ top: 0 });
  }, [location.hash]);

  return (
    <div className="rpc-ref-scope reference-app">
      <header className="reference-header">
        <span className="reference-title">{spec.info.title}</span>
        <span className="reference-version">v{spec.info.version}</span>
        <select
          className="server-select"
          aria-label="API server"
          value={server}
          onChange={(e) => setServer(e.target.value)}
        >
          {SERVERS.map((s) => (
            <option key={s.url} value={s.url}>
              {s.label}
            </option>
          ))}
        </select>
      </header>
      <div className="reference-body">
        <main className="reference-main">
          {selected ? (
            <EndpointDetail
              key={selected.id}
              op={selected}
              spec={spec}
              server={server}
              apiKey={apiKey}
              onApiKeyChange={setApiKey}
            />
          ) : (
            <div className="reference-empty">Select an endpoint</div>
          )}
        </main>
      </div>
    </div>
  );
}
