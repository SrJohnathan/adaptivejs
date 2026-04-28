import { randomUUID } from "node:crypto";
import type { AuthSessionRecord, AuthSessionStore } from "./types.js";

export class MemoryAuthSessionStore<User = Record<string, unknown>> implements AuthSessionStore<User> {
  private readonly sessions = new Map<string, AuthSessionRecord<User>>();

  async get(sessionId: string) {
    return this.sessions.get(sessionId) ?? null;
  }

  async set(sessionId: string, record: AuthSessionRecord<User>) {
    this.sessions.set(sessionId, record);
  }

  async delete(sessionId: string) {
    this.sessions.delete(sessionId);
  }
}

export function createSessionId() {
  return randomUUID();
}
