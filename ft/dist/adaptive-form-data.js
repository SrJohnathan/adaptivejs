export class AdaptiveFormData {
	#entries = [];
	constructor(initial) {
		if (!initial) {
			return;
		}
		if (initial instanceof AdaptiveFormData) {
			this.#entries = [...initial.entries()];
			return;
		}
		if (Symbol.iterator in Object(initial)) {
			for (const [key, value] of initial) {
				this.append(key, value);
			}
			return;
		}
		for (const [key, value] of Object.entries(initial)) {
			if (Array.isArray(value)) {
				for (const item of value) {
					if (item != null) {
						this.append(key, item);
					}
				}
				continue;
			}
			if (value != null) {
				this.append(key, value);
			}
		}
	}
	static from(input) {
		return isAdaptiveFormData(input) ? input : new AdaptiveFormData(input ?? undefined);
	}
	static fromNative(formData) {
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
	append(name, value, fileName) {
		this.#entries.push([name, normalizeEntryValue(value, fileName)]);
	}
	set(name, value, fileName) {
		this.delete(name);
		this.append(name, value, fileName);
	}
	get(name) {
		const entry = this.#entries.find(([key]) => key === name);
		return entry ? entry[1] : null;
	}
	getAll(name) {
		return this.#entries.filter(([key]) => key === name).map(([, value]) => value);
	}
	has(name) {
		return this.#entries.some(([key]) => key === name);
	}
	delete(name) {
		this.#entries = this.#entries.filter(([key]) => key !== name);
	}
	entries() {
		return this.#entries[Symbol.iterator]();
	}
	keys() {
		return this.#entries.map(([key]) => key)[Symbol.iterator]();
	}
	values() {
		return this.#entries.map(([, value]) => value)[Symbol.iterator]();
	}
	forEach(callback, thisArg) {
		for (const [key, value] of this.#entries) {
			callback.call(thisArg, value, key, this);
		}
	}
	toNative() {
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
	toJSON() {
		const output = {};
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
	[Symbol.iterator]() {
		return this.entries();
	}
}
export function isAdaptiveFormData(value) {
	if (!value || typeof value !== "object") {
		return false;
	}
	return typeof value.append === "function" && typeof value.get === "function" && typeof value.entries === "function";
}
function normalizeEntryValue(value, fileName) {
	if (typeof value === "string") {
		return value;
	}
	if (value instanceof File) {
		return fileName ? new File([value], fileName, {
			type: value.type,
			lastModified: value.lastModified
		}) : value;
	}
	return new File([value], fileName ?? "blob", { type: value.type || "application/octet-stream" });
}

//# sourceMappingURL=adaptive-form-data.js.map
