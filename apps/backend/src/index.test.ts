import { describe, expect, it } from "vitest";

import app from ".";

const env = {
  DATABASE_URL: "postgresql://user:password@example.test/database",
  BETTER_AUTH_SECRET: "a-secret-with-at-least-thirty-two-characters",
  BETTER_AUTH_URL: "http://localhost:8787",
  WEB_ORIGIN: "http://localhost:5173",
  ENVIRONMENT: "development" as const,
};

describe("API documentation and authentication boundary", () => {
  it("serves the OpenAPI document for the implemented REST resources", async () => {
    const response = await app.request(
      "http://localhost/api/openapi.json",
      {},
      env,
    );

    expect(response.status).toBe(200);
    const document = (await response.json()) as {
      openapi: string;
      paths: Record<string, unknown>;
    };
    expect(document.openapi).toBe("3.0.3");
    expect(document.paths).toHaveProperty("/me");
    expect(document.paths).toHaveProperty("/groups/{groupId}/wallets");
    expect(document.paths).toHaveProperty("/groups/{groupId}/withdrawals");
  });

  it("serves Swagger UI and keeps business resources protected by the session", async () => {
    const docs = await app.request("http://localhost/api/docs", {}, env);
    const me = await app.request("http://localhost/api/me", {}, env);

    expect(docs.status).toBe(200);
    expect(await docs.text()).toContain("SwaggerUIBundle");
    expect(me.status).toBe(401);
    expect(me.headers.get("cache-control")).toBeNull();
    await expect(me.json()).resolves.toMatchObject({ code: "UNAUTHENTICATED" });
  });
});
