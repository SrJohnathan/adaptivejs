import { AdaptiveFormData, isAdaptiveFormData } from "@adaptivejs/common";

type ServerActionResponse<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

export async function callServerAction<T = unknown>(moduleId: string, actionName: string, args: unknown[]): Promise<T> {
  const request = createActionRequest(moduleId, actionName, args);
  const response = await fetch("/_action", request);
  const payload = (await response.json()) as ServerActionResponse<T>;

  if (!response.ok || !payload.success) {
    throw new Error(payload.error || `Server action '${actionName}' failed.`);
  }

  return payload.data as T;
}

function createActionRequest(moduleId: string, actionName: string, args: unknown[]) {
  if (args.length === 1 && isAdaptiveFormData(args[0])) {
    const headers = new Headers({
      "X-Adaptive-Module": moduleId,
      "X-Adaptive-Action": actionName,
      "X-Adaptive-Args-Mode": "formdata-single"
    });
    return {
      method: "POST",
      headers,
      body: args[0].toNative()
    } satisfies RequestInit;
  }

  if (containsBinary(args)) {
    const formData = new FormData();
    appendFormValue(formData, "args", args);
    const headers = new Headers({
      "X-Adaptive-Module": moduleId,
      "X-Adaptive-Action": actionName,
      "X-Adaptive-Args-Mode": "structured"
    });
    return {
      method: "POST",
      headers,
      body: formData
    } satisfies RequestInit;
  }

  const headers = new Headers({
    "Content-Type": "application/json",
    "X-Adaptive-Module": moduleId,
    "X-Adaptive-Action": actionName,
    "X-Adaptive-Args-Mode": "json"
  });
  return {
    method: "POST",
    headers,
    body: JSON.stringify({
      module: moduleId,
      action: actionName,
      args
    })
  } satisfies RequestInit;
}

function containsBinary(value: unknown): boolean {
  if (value == null) return false;
  if (typeof File !== "undefined" && value instanceof File) return true;
  if (typeof Blob !== "undefined" && value instanceof Blob) return true;
  if (isAdaptiveFormData(value)) return true;
  if (Array.isArray(value)) return value.some((item) => containsBinary(item));
  if (typeof value === "object") return Object.values(value as Record<string, unknown>).some((item) => containsBinary(item));
  return false;
}

function appendFormValue(formData: FormData, key: string, value: unknown): void {
  if (value == null) {
    formData.append(key, "");
    return;
  }

  if (typeof File !== "undefined" && value instanceof File) {
    formData.append(key, value);
    return;
  }

  if (typeof Blob !== "undefined" && value instanceof Blob) {
    formData.append(key, value);
    return;
  }

  if (value instanceof Date) {
    formData.append(key, value.toISOString());
    return;
  }

  if (isAdaptiveFormData(value)) {
    for (const [entryKey, entryValue] of value.entries()) {
      appendFormValue(formData, `${key}[${entryKey}]`, entryValue);
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => appendFormValue(formData, `${key}[${index}]`, item));
    return;
  }

  if (typeof value === "object") {
    for (const [nestedKey, nestedValue] of Object.entries(value as Record<string, unknown>)) {
      appendFormValue(formData, `${key}[${nestedKey}]`, nestedValue);
    }
    return;
  }

  formData.append(key, String(value));
}
