export const errorCodes = [
  "DAEMON_NOT_RUNNING",
  "HEALTH_CHECK_FAILED",
  "INVALID_ARGUMENT",
  "SESSION_NOT_FOUND",
  "SEED_FAILED",
  "AUTH_FAILED",
  "NAVIGATION_FAILED",
  "ELEMENT_NOT_FOUND",
  "INTERACTION_FAILED",
  "SCREENSHOT_FAILED",
  "SETTLE_TIMEOUT",
  "INTERNAL_ERROR",
] as const;

export type ErrorCode = (typeof errorCodes)[number];

export class AgentControlError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly status = 500,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "AgentControlError";
  }
}

export function asAgentControlError(error: unknown): AgentControlError {
  if (error instanceof AgentControlError) return error;

  return new AgentControlError(
    "INTERNAL_ERROR",
    "Agent Controlで予期しないエラーが発生しました。",
    500,
    { cause: error },
  );
}
