import { useState } from "react";
import type { JsonSchema } from "./lib/spec";
import { refName, resolveRef, schemaTypeLabel } from "./lib/spec";

export default function SchemaExplorer({
  schema,
  definitions,
  seen = [],
}: {
  schema: JsonSchema | undefined;
  definitions: Record<string, JsonSchema>;
  seen?: string[];
}) {
  if (!schema) return null;

  if (schema.$ref) {
    const name = refName(schema.$ref);
    if (seen.includes(name)) return <span className="schema-type">{name} (circular)</span>;
    return <SchemaExplorer schema={resolveRef(schema.$ref, definitions)} definitions={definitions} seen={[...seen, name]} />;
  }

  if (schema.type === "array") {
    return (
      <div className="schema-array">
        <span className="schema-type">array of</span>
        <SchemaExplorer schema={schema.items} definitions={definitions} seen={seen} />
      </div>
    );
  }

  const props = schema.properties;
  if (!props || Object.keys(props).length === 0) {
    return <span className="schema-type">{schemaTypeLabel(schema)}</span>;
  }

  return (
    <div className="schema-fields">
      {Object.entries(props).map(([name, prop]) => (
        <SchemaField key={name} name={name} schema={prop} definitions={definitions} seen={seen} required={schema.required?.includes(name)} />
      ))}
    </div>
  );
}

function SchemaField({
  name,
  schema,
  definitions,
  seen,
  required,
}: {
  name: string;
  schema: JsonSchema;
  definitions: Record<string, JsonSchema>;
  seen: string[];
  required?: boolean;
}) {
  const resolved = schema.$ref ? resolveRef(schema.$ref, definitions) : schema;
  const nested = resolved?.properties && Object.keys(resolved.properties).length > 0;
  const arrayOfObject = resolved?.type === "array" && resolved.items?.$ref;
  const [open, setOpen] = useState(false);
  const expandable = nested || arrayOfObject;

  return (
    <div className="schema-field">
      <div
        className={`schema-field-row ${expandable ? "expandable" : ""}`}
        onClick={() => expandable && setOpen(!open)}
        role={expandable ? "button" : undefined}
        tabIndex={expandable ? 0 : undefined}
        aria-expanded={expandable ? open : undefined}
        onKeyDown={(e) => {
          if (!expandable) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen(!open);
          }
        }}
      >
        {expandable && <span className="schema-toggle">{open ? "▾" : "▸"}</span>}
        <span className="schema-field-name">{name}</span>
        {required && <span className="schema-required">required</span>}
        <span className="schema-type">{schemaTypeLabel(schema)}</span>
      </div>
      {schema.description && <div className="schema-field-desc">{schema.description}</div>}
      {expandable && open && (
        <div className="schema-nested">
          <SchemaExplorer schema={schema} definitions={definitions} seen={seen} />
        </div>
      )}
    </div>
  );
}
