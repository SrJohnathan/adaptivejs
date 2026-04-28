export type AdaptiveFormDataEntryValue = string | File;

type AdaptiveFormDataSource =
  | AdaptiveFormData
  | Iterable<[string, AdaptiveFormDataEntryValue]>
  | Record<string, AdaptiveFormDataEntryValue | AdaptiveFormDataEntryValue[] | null | undefined>;

export class AdaptiveFormData {
  #entries: Array<[string, AdaptiveFormDataEntryValue]> = [];

  constructor(initial?: AdaptiveFormDataSource | null) {
    if (!initial) {
      return;
    }

    if (isAdaptiveFormData(initial)) {
      this.#entries = [...initial.entries()];
      return;
    }

    if (Symbol.iterator in Object(initial)) {
      for (const [key, value] of initial as Iterable<[string, AdaptiveFormDataEntryValue]>) {
        this.append(key, value);
      }
      return;
    }

    for (const [key, value] of Object.entries(initial)) {
      if (Array.isArray(value)) {
        for (const item of value) {
          if (item != null) this.append(key, item);
        }
        continue;
      }

      if (value != null) {
        this.append(key, value);
      }
    }
  }

  static from(input?: AdaptiveFormDataSource | null): AdaptiveFormData {
    return isAdaptiveFormData(input) ? input : new AdaptiveFormData(input ?? undefined);
  }

  static fromNative(formData?: FormData | null): AdaptiveFormData {
    const output = new AdaptiveFormData();
    if (!formData) {
      return output;
    }

    for (const [key, value] of formData.entries()) {
      if (typeof value === "string" || value instanceof File) {
        output.append(key, value);
      }
    }

    return output;
  }

  append(name: string, value: string | Blob, fileName?: string): void {
    this.#entries.push([name, normalizeEntryValue(value, fileName)]);
  }

  set(name: string, value: string | Blob, fileName?: string): void {
    this.delete(name);
    this.append(name, value, fileName);
  }

  get(name: string): AdaptiveFormDataEntryValue | null {
    const entry = this.#entries.find(([key]) => key === name);
    return entry ? entry[1] : null;
  }

  getAll(name: string): AdaptiveFormDataEntryValue[] {
    return this.#entries.filter(([key]) => key === name).map(([, value]) => value);
  }

  has(name: string): boolean {
    return this.#entries.some(([key]) => key === name);
  }

  delete(name: string): void {
    this.#entries = this.#entries.filter(([key]) => key !== name);
  }

  entries(): IterableIterator<[string, AdaptiveFormDataEntryValue]> {
    return this.#entries[Symbol.iterator]();
  }

  keys(): IterableIterator<string> {
    return this.#entries.map(([key]) => key)[Symbol.iterator]();
  }

  values(): IterableIterator<AdaptiveFormDataEntryValue> {
    return this.#entries.map(([, value]) => value)[Symbol.iterator]();
  }

  forEach(
    callback: (value: AdaptiveFormDataEntryValue, key: string, parent: AdaptiveFormData) => void,
    thisArg?: unknown
  ): void {
    for (const [key, value] of this.#entries) {
      callback.call(thisArg, value, key, this);
    }
  }

  toNative(): FormData {
    const formData = new FormData();
    for (const [key, value] of this.#entries) {
      if (typeof value === "string") {
        formData.append(key, value);
      } else {
        formData.append(key, value, value.name);
      }
    }
    return formData;
  }

  toJSON(): Record<string, AdaptiveFormDataEntryValue | AdaptiveFormDataEntryValue[]> {
    const output: Record<string, AdaptiveFormDataEntryValue | AdaptiveFormDataEntryValue[]> = {};
    for (const [key, value] of this.#entries) {
      const current = output[key];
      if (current === undefined) {
        output[key] = value;
        continue;
      }
      output[key] = Array.isArray(current) ? [...current, value] : [current, value];
    }
    return output;
  }

  [Symbol.iterator](): IterableIterator<[string, AdaptiveFormDataEntryValue]> {
    return this.entries();
  }
}

export function isAdaptiveFormData(value: unknown): value is AdaptiveFormData {
  if (!value || typeof value !== "object") {
    return false;
  }

  return typeof (value as AdaptiveFormData).append === "function" &&
    typeof (value as AdaptiveFormData).get === "function" &&
    typeof (value as AdaptiveFormData).entries === "function";
}

function normalizeEntryValue(value: string | Blob, fileName?: string): AdaptiveFormDataEntryValue {
  if (typeof value === "string") {
    return value;
  }

  if (value instanceof File) {
    return fileName ? new File([value], fileName, { type: value.type, lastModified: value.lastModified }) : value;
  }

  return new File([value], fileName ?? "blob", {
    type: value.type || "application/octet-stream"
  });
}
