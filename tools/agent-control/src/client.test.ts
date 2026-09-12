import { afterEach, describe, expect, it, vi } from "vitest";

import { requestDoctor } from "./client.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Agent Control client", () => {
  it("doctorのdaemon接続失敗をHEALTH_CHECK_FAILEDへ正規化する", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new Error("down"))),
    );

    await expect(requestDoctor()).resolves.toEqual({
      ok: false,
      checks: { daemon: { ok: false } },
      error: {
        code: "HEALTH_CHECK_FAILED",
        message: "One or more Agent Control dependencies are unavailable",
      },
    });
  });
});
