import { fileURLToPath } from "node:url";
import path from "node:path";

import { config as loadEnv } from "dotenv";

export type AgentControlConfig = {
  apiOrigin: string;
  artifactRoot: string;
  daemonHost: string;
  daemonLogPath: string;
  daemonPort: number;
  environment: string | undefined;
  repoRoot: string;
  verificationPassword: string;
  verificationUserEmail: string;
  webOrigin: string;
};

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));

export function loadAgentControlConfig(): AgentControlConfig {
  loadEnv({ path: path.join(repoRoot, "apps/backend/.dev.vars"), quiet: true });

  const artifactRoot = path.join(repoRoot, "artifacts/agent");

  return {
    apiOrigin: "http://localhost:8787",
    artifactRoot,
    daemonHost: "127.0.0.1",
    daemonLogPath: path.join(artifactRoot, "logs/agent-control-daemon.log"),
    daemonPort: 4317,
    environment: process.env.ENVIRONMENT,
    repoRoot,
    verificationPassword:
      process.env.VERIFY_USER_PASSWORD ?? "verify-records-delete-password",
    verificationUserEmail:
      process.env.VERIFY_USER_EMAIL ?? "verification@example.test",
    webOrigin: "http://localhost:5173",
  };
}
