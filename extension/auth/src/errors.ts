export type AuthErrorCode =
  | "AUTHENTICATION_REQUIRED"
  | "AUTHORIZATION_FAILED"
  | "SESSION_USER_NOT_FOUND"
  | "CSRF_TOKEN_INVALID"
  | "CSRF_ORIGIN_INVALID"
  | "CSRF_CONFIGURATION_INVALID"
  | "AUTH_CONFIGURATION_INVALID"
  | "RATE_LIMIT_EXCEEDED"
  | "SESSION_BINDING_MISMATCH";

export class AuthError extends Error {
  readonly code: AuthErrorCode;
  readonly status: number;

  constructor(code: AuthErrorCode, message: string, status: number) {
    super(message);
    this.name = "AuthError";
    this.code = code;
    this.status = status;
  }
}
