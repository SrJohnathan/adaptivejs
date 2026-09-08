export type SecurityErrorCode =
  | "SECURITY_CONFIGURATION_INVALID"
  | "RATE_LIMIT_EXCEEDED"
  | "ACTION_GUARD_REJECTED";

export class SecurityError extends Error {
  readonly code: SecurityErrorCode;
  readonly status: number;

  constructor(code: SecurityErrorCode, message: string, status = 500) {
    super(message);
    this.name = "SecurityError";
    this.code = code;
    this.status = status;
  }
}

export function toSecurityResponseBody(error: SecurityError) {
  return {
    ok: false as const,
    error: error.code,
    message: error.message,
  };
}
