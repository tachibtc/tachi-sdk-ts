import { useState } from "react";
import type { Operation } from "./lib/spec";
import { generateCurl, generateGo, generateJs, generatePhp, generatePython, generateRuby } from "./lib/codeSamples";

const GENERATORS = {
  curl: generateCurl,
  javascript: generateJs,
  python: generatePython,
  go: generateGo,
  php: generatePhp,
  ruby: generateRuby,
} as const;

type Lang = keyof typeof GENERATORS;
const LANGS = Object.keys(GENERATORS) as Lang[];

export default function CodeSamples({
  op,
  server,
  values,
  body,
}: {
  op: Operation;
  server: string;
  values: Record<string, string>;
  body?: string;
}) {
  const [lang, setLang] = useState<Lang>("curl");
  const [copied, setCopied] = useState(false);
  const sample = GENERATORS[lang](server, op, values, body);

  async function copy() {
    await navigator.clipboard.writeText(sample);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="code-samples">
      <div className="code-samples-tabs">
        {LANGS.map((l) => (
          <button key={l} className={`code-tab ${l === lang ? "active" : ""}`} onClick={() => setLang(l)}>
            {l}
          </button>
        ))}
        <button className="code-copy" onClick={copy}>
          {copied ? "copied" : "copy"}
        </button>
      </div>
      <pre className="code-samples-body">{sample}</pre>
    </div>
  );
}
