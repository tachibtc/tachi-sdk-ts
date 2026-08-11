export type JsonSchema = {
  type?: string;
  format?: string;
  description?: string;
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  $ref?: string;
  enum?: unknown[];
  required?: string[];
};

export type Parameter = {
  name: string;
  in: "query" | "path" | "header" | "body" | "formData";
  type?: string;
  required?: boolean;
  description?: string;
  schema?: JsonSchema;
};

export type Response = {
  description?: string;
  schema?: JsonSchema;
};

export type Operation = {
  id: string;
  slug: string;
  method: string;
  path: string;
  tags: string[];
  summary?: string;
  description?: string;
  parameters: Parameter[];
  responses: Record<string, Response>;
};

export function operationSlug(method: string, path: string): string {
  return `${method}-${path}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export type Spec = {
  info: { title: string; version: string; description?: string };
  basePath?: string;
  definitions: Record<string, JsonSchema>;
  operations: Operation[];
  tags: string[];
};

export function loadSpec(raw: {
  info: Spec["info"];
  basePath?: string;
  definitions?: Record<string, JsonSchema>;
  paths: Record<string, Record<string, Omit<Operation, "id" | "method" | "path">>>;
}): Spec {
  const operations: Operation[] = [];
  for (const [path, methods] of Object.entries(raw.paths)) {
    for (const [method, op] of Object.entries(methods)) {
      operations.push({
        id: `${method}-${path}`,
        slug: operationSlug(method, path),
        method: method.toUpperCase(),
        path,
        tags: op.tags?.length ? op.tags : ["Other"],
        summary: op.summary,
        description: op.description,
        parameters: op.parameters ?? [],
        responses: op.responses ?? {},
      });
    }
  }
  const tags = Array.from(new Set(operations.flatMap((o) => o.tags))).sort();
  return { info: raw.info, basePath: raw.basePath, definitions: raw.definitions ?? {}, operations, tags };
}

export function refName(ref: string): string {
  return ref.split("/").pop() ?? ref;
}

export function resolveRef(ref: string, definitions: Record<string, JsonSchema>): JsonSchema | undefined {
  return definitions[refName(ref)];
}

export function schemaTypeLabel(schema: JsonSchema | undefined): string {
  if (!schema) return "—";
  if (schema.$ref) return refName(schema.$ref);
  if (schema.type === "array") return `${schemaTypeLabel(schema.items)}[]`;
  return schema.format ? `${schema.type} (${schema.format})` : (schema.type ?? "—");
}

export function exampleValue(schema: JsonSchema | undefined, definitions: Record<string, JsonSchema>, seen = new Set<string>()): unknown {
  if (!schema) return null;
  if (schema.$ref) {
    const name = refName(schema.$ref);
    if (seen.has(name)) return {};
    return exampleValue(resolveRef(schema.$ref, definitions), definitions, new Set(seen).add(name));
  }
  if (schema.type === "array") return [exampleValue(schema.items, definitions, seen)];
  if (schema.type === "object" || schema.properties) {
    const obj: Record<string, unknown> = {};
    for (const [key, prop] of Object.entries(schema.properties ?? {})) {
      obj[key] = exampleValue(prop, definitions, seen);
    }
    return obj;
  }
  if (schema.type === "integer" || schema.type === "number") return 0;
  if (schema.type === "boolean") return false;
  return schema.enum?.[0] ?? "";
}
