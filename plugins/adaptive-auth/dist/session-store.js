import { randomUUID } from "node:crypto";
export class MemoryAuthSessionStore {
	sessions = new Map();
	async get(sessionId) {
		return this.sessions.get(sessionId) ?? null;
	}
	async set(sessionId, record) {
		this.sessions.set(sessionId, record);
	}
	async delete(sessionId) {
		this.sessions.delete(sessionId);
	}
}
export function createSessionId() {
	return randomUUID();
}

//# sourceMappingURL=session-store.js.map
