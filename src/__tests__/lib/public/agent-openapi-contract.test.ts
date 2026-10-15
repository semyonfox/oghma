import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildAgentOpenApiJson } from "@/lib/public/agent-openapi";
import {
  agentRegistrationClaimSchema,
  agentRegistrationCompleteSchema,
  agentRegistrationSchema,
  assignmentCreateSchema,
  chatRequestSchema,
  loginSchema,
  noteCreateSchema,
  noteUpdateSchema,
  registerSchema,
} from "@/lib/validations/schemas";

// agents act on this document, so a stale path, method or field name is a
// real failure for them rather than a cosmetic doc bug
const document = buildAgentOpenApiJson("https://oghmanotes.test");
const APP_DIR = join(process.cwd(), "src/app");
const METHODS = ["get", "post", "put", "patch", "delete"];

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function operations() {
  return Object.entries(document.paths).flatMap(([path, item]) =>
    Object.entries(item)
      .filter(([method]) => METHODS.includes(method))
      .map(([method, operation]) => ({ path, method, operation })),
  );
}

function requestProperties(path: string, method: string): JsonObject {
  const operation = document.paths[path]?.[method];
  const body = operation?.requestBody;
  if (!isObject(body) || !isObject(body.content)) throw new Error(`${method} ${path} has no body`);
  const json = body.content["application/json"];
  if (!isObject(json) || !isObject(json.schema) || !isObject(json.schema.properties)) {
    throw new Error(`${method} ${path} has no JSON object schema`);
  }
  return json.schema.properties;
}

function documentedFields(path: string, method: string): string[] {
  return Object.keys(requestProperties(path, method)).sort();
}

function schemaFields(schema: { shape: JsonObject }): string[] {
  return Object.keys(schema.shape).sort();
}

describe("agent OpenAPI contract", () => {
  it("documents only routes and methods that exist", () => {
    for (const { path, method } of operations()) {
      const directory = join(APP_DIR, path.replace(/\{(\w+)\}/g, "[$1]"));
      const route = join(directory, "route.ts");
      if (existsSync(route)) {
        expect(
          readFileSync(route, "utf8"),
          `${method} ${path}`,
        ).toMatch(new RegExp(`export (const|async function|function) ${method.toUpperCase()}\\b`));
        continue;
      }
      expect(method, path).toBe("get");
      expect(existsSync(join(directory, "page.tsx")), `${path} has no page or route`).toBe(true);
    }
  });

  it("names the same request fields as the route validators", () => {
    expect(documentedFields("/api/chat", "post")).toEqual(schemaFields(chatRequestSchema));
    expect(documentedFields("/api/notes", "post")).toEqual(schemaFields(noteCreateSchema));
    expect(documentedFields("/api/notes/{id}", "patch")).toEqual(schemaFields(noteUpdateSchema));
    expect(documentedFields("/api/notes/{id}", "put")).toEqual(schemaFields(noteUpdateSchema));
    expect(documentedFields("/api/assignments", "post")).toEqual(schemaFields(assignmentCreateSchema));
    expect(documentedFields("/api/auth/login", "post")).toEqual(schemaFields(loginSchema));
    expect(documentedFields("/api/auth/register", "post")).toEqual(schemaFields(registerSchema));
    expect(documentedFields("/agent/identity", "post")).toEqual(schemaFields(agentRegistrationSchema));
    expect(documentedFields("/agent/identity/claim", "post")).toEqual(schemaFields(agentRegistrationClaimSchema));
    expect(documentedFields("/agent/identity/claim/complete", "post")).toEqual(
      schemaFields(agentRegistrationCompleteSchema),
    );
  });

  it("only offers chat history roles the validator accepts", () => {
    const history = requestProperties("/api/chat", "post").history;
    const role = isObject(history) && isObject(history.items) && isObject(history.items.properties)
      ? history.items.properties.role
      : null;
    const accepted = chatRequestSchema.shape.history.unwrap().element.shape.role.options;
    expect(isObject(role) ? role.enum : null).toEqual([...accepted]);
  });

  it("flags every private and state-changing session operation", () => {
    for (const { path, method, operation } of operations()) {
      if (!path.startsWith("/api/") || path.startsWith("/api/auth/")) continue;
      expect(operation["x-private-data"], `${method} ${path}`).toBe(true);
      if (method !== "get" && path !== "/api/mcp/canvas") {
        expect(operation["x-human-confirmation-required"], `${method} ${path}`).toBe(true);
      }
    }
  });
});
