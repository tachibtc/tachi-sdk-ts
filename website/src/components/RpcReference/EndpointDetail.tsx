import { useState } from "react";
import type { Operation, Spec } from "./lib/spec";
import { exampleValue, schemaTypeLabel } from "./lib/spec";
import SchemaExplorer from "./SchemaExplorer";
import TryIt from "./TryIt";
import CodeSamples from "./CodeSamples";

export default function EndpointDetail({
  op,
  spec,
  server,
  apiKey,
  onApiKeyChange,
}: {
  op: Operation;
  spec: Spec;
  server: string;
  apiKey: string;
  onApiKeyChange: (key: string) => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const nonBodyParams = op.parameters.filter((p) => p.in !== "body" && !(p.in === "header" && p.name.toLowerCase() === "x-api-key"));
  const bodyParam = op.parameters.find((p) => p.in === "body");
  const bodyPreview = bodyParam ? JSON.stringify(exampleValue(bodyParam.schema, spec.definitions), null, 2) : undefined;

  const effectiveValues = { ...values };
  if (apiKey) {
    for (const p of op.parameters) {
      if (p.in === "header" && p.name.toLowerCase() === "x-api-key" && !effectiveValues[p.name]) {
        effectiveValues[p.name] = apiKey;
      }
    }
  }

  return (
    <div className="endpoint-detail">
      <div className="endpoint-header">
        <span className={`method-badge method-${op.method.toLowerCase()}`}>{op.method}</span>
        <code className="endpoint-path">{op.path}</code>
      </div>
      {op.summary && <h1>{op.summary}</h1>}
      {op.description && <p className="endpoint-description">{op.description}</p>}

      <div className="endpoint-columns">
        <div className="endpoint-main">
          {nonBodyParams.length > 0 && (
            <section>
              <h2>Parameters</h2>
              <table className="params-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>In</th>
                    <th>Type</th>
                    <th>Description</th>
                    <th>Value</th>
                  </tr>
                </thead>
                <tbody>
                  {nonBodyParams.map((p) => (
                    <tr key={p.name}>
                      <td>
                        {p.name}
                        {p.required && <span className="schema-required">required</span>}
                      </td>
                      <td>{p.in}</td>
                      <td>{p.type ?? schemaTypeLabel(p.schema)}</td>
                      <td>{p.description}</td>
                      <td>
                        <input
                          className="param-input"
                          aria-label={p.name}
                          value={values[p.name] ?? ""}
                          onChange={(e) => setValues({ ...values, [p.name]: e.target.value })}
                          placeholder={p.name}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {bodyParam && (
            <section>
              <h2>Request Body</h2>
              <SchemaExplorer schema={bodyParam.schema} definitions={spec.definitions} />
            </section>
          )}

          <section>
            <h2>Responses</h2>
            {Object.entries(op.responses).map(([code, resp]) => (
              <div key={code} className="response-block">
                <div className="response-head">
                  <span className={`status-pill status-${code[0]}xx`}>{code}</span>
                  <span>{resp.description}</span>
                </div>
                {resp.schema && <SchemaExplorer schema={resp.schema} definitions={spec.definitions} />}
              </div>
            ))}
          </section>
        </div>

        <div className="endpoint-side">
          <h2>API Key</h2>
          <input
            className="param-input api-key-input"
            type="password"
            autoComplete="off"
            aria-label="API key"
            value={apiKey}
            onChange={(e) => onApiKeyChange(e.target.value)}
            placeholder="Applied to X-Api-Key on every endpoint"
          />
          <h2>Code Sample</h2>
          <CodeSamples op={op} server={server} values={effectiveValues} body={bodyPreview} />
          <h2>Try It</h2>
          <TryIt op={op} spec={spec} server={server} values={effectiveValues} />
        </div>
      </div>
    </div>
  );
}
