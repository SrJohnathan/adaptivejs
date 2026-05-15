export const CONTEXT_PROVIDER_TAG = Symbol.for("adaptive.context.provider");

type ServerContextFrame = {
  id: symbol;
  value: unknown;
};

const serverContextStack: ServerContextFrame[] = [];

export function runWithServerContext<T>(id: symbol, value: unknown, fn: () => T): T {
  serverContextStack.push({ id, value });

  try {
    return fn();
  } finally {
    serverContextStack.pop();
  }
}

export function readServerContext<T>(id: symbol, defaultValue: T): T {
  for (let index = serverContextStack.length - 1; index >= 0; index -= 1) {
    const frame = serverContextStack[index];

    if (frame.id === id) {
      return frame.value as T;
    }
  }

  return defaultValue;
}
