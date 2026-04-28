import { isAdaptiveFormData } from "@adaptivejs/common";
export async function callServerAction(moduleId, actionName, args) {
	const request = createActionRequest(moduleId, actionName, args);
	const response = await fetch("/_action", request);
	const payload = await response.json();
	if (!response.ok || !payload.success) {
		throw new Error(payload.error || `Server action '${actionName}' failed.`);
	}
	return payload.data;
}
function createActionRequest(moduleId, actionName, args) {
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
		};
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
		};
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
	};
}
function containsBinary(value) {
	if (value == null) return false;
	if (typeof File !== "undefined" && value instanceof File) return true;
	if (typeof Blob !== "undefined" && value instanceof Blob) return true;
	if (isAdaptiveFormData(value)) return true;
	if (Array.isArray(value)) return value.some((item) => containsBinary(item));
	if (typeof value === "object") return Object.values(value).some((item) => containsBinary(item));
	return false;
}
function appendFormValue(formData, key, value) {
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
		for (const [nestedKey, nestedValue] of Object.entries(value)) {
			appendFormValue(formData, `${key}[${nestedKey}]`, nestedValue);
		}
		return;
	}
	formData.append(key, String(value));
}

//# sourceMappingURL=server-actions.js.map
