import { describe, expect, it, vi } from "vitest";

import { createSeedPaymentCreate } from "./seed.js";

describe("payment create seed", () => {
  it("stderrをloggerに保持し、公開errorをSEED_FAILEDへ正規化する", async () => {
    const error = vi.fn(async () => undefined);
    const info = vi.fn(async () => undefined);
    const seed = createSeedPaymentCreate(
      "/repo",
      { error, info },
      async () => ({
        code: 1,
        signal: null,
        stderr: "database-secret-detail",
        stdout: "seed output",
      }),
    );

    const caught = await seed().catch((error_) => error_);
    expect(caught).toMatchObject({
      code: "SEED_FAILED",
      message:
        "検証データを準備できませんでした。daemonログを確認してください。",
    });
    expect(error).toHaveBeenCalledWith("payment-create-seed-failed", {
      code: 1,
      signal: null,
      stderr: "database-secret-detail",
      stdout: "seed output",
    });
    expect(JSON.stringify(caught)).not.toContain("database-secret-detail");
  });
});
