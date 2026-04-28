export type AdaptiveFormDataEntryValue = string | File;
type AdaptiveFormDataSource = AdaptiveFormData | Iterable<[string, AdaptiveFormDataEntryValue]> | Record<string, AdaptiveFormDataEntryValue | AdaptiveFormDataEntryValue[] | null | undefined>;
export declare class AdaptiveFormData {
    #private;
    constructor(initial?: AdaptiveFormDataSource | null);
    static from(input?: AdaptiveFormDataSource | null): AdaptiveFormData;
    static fromNative(formData?: FormData | null): AdaptiveFormData;
    append(name: string, value: string | Blob, fileName?: string): void;
    set(name: string, value: string | Blob, fileName?: string): void;
    get(name: string): AdaptiveFormDataEntryValue | null;
    getAll(name: string): AdaptiveFormDataEntryValue[];
    has(name: string): boolean;
    delete(name: string): void;
    entries(): IterableIterator<[string, AdaptiveFormDataEntryValue]>;
    keys(): IterableIterator<string>;
    values(): IterableIterator<AdaptiveFormDataEntryValue>;
    forEach(callback: (value: AdaptiveFormDataEntryValue, key: string, parent: AdaptiveFormData) => void, thisArg?: unknown): void;
    toNative(): FormData;
    toJSON(): Record<string, AdaptiveFormDataEntryValue | AdaptiveFormDataEntryValue[]>;
    [Symbol.iterator](): IterableIterator<[string, AdaptiveFormDataEntryValue]>;
}
export declare function isAdaptiveFormData(value: unknown): value is AdaptiveFormData;
export {};
