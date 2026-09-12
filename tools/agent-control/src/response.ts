import type { ErrorCode } from "./errors.js";

export type SuccessResponse<T extends object = Record<string, never>> = {
  ok: true;
} & T;

export type FailureResponse = {
  ok: false;
  error: {
    code: ErrorCode;
    message: string;
  };
};

export type AgentControlResponse<T extends object = Record<string, never>> =
  SuccessResponse<T> | FailureResponse;

export const success = <T extends object>(data: T): SuccessResponse<T> => ({
  ok: true,
  ...data,
});

export const failure = (code: ErrorCode, message: string): FailureResponse => ({
  ok: false,
  error: { code, message },
});
