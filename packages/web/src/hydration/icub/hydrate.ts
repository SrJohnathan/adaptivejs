/*
 * Copyright (c) 2026 Antonio Johnathan
 *
 * Licensed under the MIT License.
 * See LICENSE file in the project root for full license information.
 */



/*
function matchesCurrentHydratedProp(element: HTMLElement, key: string, nextValue: any) {
    const namespace = element.namespaceURI;

    if (key === "className" || key === "class") {
        return element.getAttribute("class") === String(nextValue ?? "");
    }
    if (key === "style" && typeof nextValue === "object" && nextValue !== null) {
        const expected = serializeStyleLike(nextValue);
        return normalizeInlineStyle(element.getAttribute("style")) === normalizeInlineStyle(expected);
    }
    if (key === "dataset" && typeof nextValue === "object" && nextValue !== null) {
        return Object.entries(nextValue).every(([entryKey, entryValue]) => element.dataset[entryKey] === String(entryValue ?? ""));
    }
    if (key === "value" && (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) {
        return element.value === String(nextValue ?? "");
    }
    if (key === "checked" && element instanceof HTMLInputElement) {
        return element.checked === Boolean(nextValue);
    }
    if (key === "disabled" || key === "hidden") {
        return element.hasAttribute(key) === Boolean(nextValue);
    }
    if (key === "title" || key === "id") {
        return element.getAttribute(key) === String(nextValue ?? "");
    }
    if (shouldAssignAsProperty(element, namespace, key)) {
        return String((element as any)[key] ?? "") === String(nextValue ?? "");
    }
    const attrName = resolveDomAttributeName(key, namespace);
    return element.getAttribute(attrName) === String(nextValue ?? "");
}

function describeCurrentHydratedProp(element: HTMLElement, key: string) {
    const namespace = element.namespaceURI;

    if (key === "className" || key === "class") {
        return element.getAttribute("class") ?? "";
    }
    if (key === "style") {
        return element.getAttribute("style") ?? "";
    }
    if (key === "dataset") {
        return JSON.stringify({ ...element.dataset });
    }
    if (key === "value" && (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) {
        return element.value;
    }
    if (key === "checked" && element instanceof HTMLInputElement) {
        return String(element.checked);
    }
    if (key === "disabled" || key === "hidden") {
        return String(element.hasAttribute(key));
    }
    if (key === "title" || key === "id") {
        return element.getAttribute(key) ?? "";
    }
    if (shouldAssignAsProperty(element, namespace, key)) {
        return String((element as any)[key] ?? "");
    }
    const attrName = resolveDomAttributeName(key, namespace);
    return element.getAttribute(attrName) ?? "";
}

function describeHydrationValue(value: any) {
    if (value == null) {
        return "";
    }
    if (typeof value === "object") {
        if (Array.isArray(value)) {
            return JSON.stringify(value);
        }
        return JSON.stringify(value);
    }
    return String(value);
}*/
