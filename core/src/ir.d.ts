import type { AdaptiveChild, AdaptiveType } from "@adaptivejs/ft";
export type IRScalar = string | number | boolean | null;
export type IRValue = IRScalar | IRScalar[] | {
    [key: string]: IRValue;
} | IRDynamicValue | IREventValue;
export type IRDynamicValue = {
    kind: "dynamic";
    hint?: string;
};
export type IREventValue = {
    kind: "event";
    name: string;
    actionId?: string;
};
export type IRTextNode = {
    kind: "text";
    value: string;
};
export type IRDynamicNode = {
    kind: "dynamic";
    hint?: string;
};
export type IRFragmentNode = {
    kind: "fragment";
    children: IRNode[];
};
export type IRElementNode = {
    kind: "element";
    tag: string;
    props: Record<string, IRValue>;
    children: IRNode[];
};
export type IRNode = IRTextNode | IRDynamicNode | IRFragmentNode | IRElementNode;
export type IRStateDefinition = {
    id: string;
    setter?: string;
    kind: "reactive";
    source: "useReactive";
    initial: IRValue;
};
export type IRStateBinding = {
    stateId: string;
    access: "value" | "call";
    scope: "render" | "event" | "other";
};
export type IRStateAction = {
    id: string;
    stateId: string;
    setter: string;
    operation: "set" | "update" | "add";
    scope: "render" | "event" | "other";
    argument?: IRValue;
};
export type IRLifecycleEffect = {
    id: string;
    hook: "useEffect" | "useLayoutEffect";
    runOn: "resume";
    cleanupOn: "pause";
    actions: IRStateAction[];
    cleanupActions?: IRStateAction[];
    unsupported?: string[];
};
export type IRComponentBinding = {
    component: string;
    index: number;
    target: string;
    stateId: string;
    prefix?: string;
    suffix?: string;
};
export type IRComponentAction = {
    component: string;
    index: number;
    target: string;
    eventName: string;
    actionId: string;
    stateId: string;
};
export type IRPageDocument = {
    kind: "page";
    route: string;
    source: string;
    state?: IRStateDefinition[];
    bindings?: IRStateBinding[];
    actions?: IRStateAction[];
    effects?: IRLifecycleEffect[];
    tree: IRNode | null;
};
export type IRDesktopDocument = {
    kind: "desktop-entry";
    entry: string;
    initialRoute?: string;
    state?: IRStateDefinition[];
    bindings?: IRStateBinding[];
    actions?: IRStateAction[];
    effects?: IRLifecycleEffect[];
    componentBindings?: IRComponentBinding[];
    componentActions?: IRComponentAction[];
    pages?: IRDesktopPageDocument[];
    tree: IRNode | null;
};
export type IRDesktopPageDocument = {
    route: string;
    source: string;
    state?: IRStateDefinition[];
    bindings?: IRStateBinding[];
    actions?: IRStateAction[];
    effects?: IRLifecycleEffect[];
    componentBindings?: IRComponentBinding[];
    componentActions?: IRComponentAction[];
    tree: IRNode | null;
};
export type IRPageManifestEntry = {
    route: string;
    source: string;
    file: string;
};
export type NormalizeToIROptions = {
    resolveComponents?: boolean;
    evaluateDynamicChildren?: boolean;
    evaluateDynamicProps?: boolean;
    includeNulls?: boolean;
};
export declare function createIRText(value: string): IRTextNode;
export declare function createIRDynamic(hint?: string): IRDynamicNode;
export declare function createIRFragment(children?: IRNode[]): IRFragmentNode;
export declare function createIRElement(tag: string, props?: Record<string, IRValue>, children?: IRNode[]): IRElementNode;
export declare function serializeIR(node: IRNode): string;
export declare function createIRPageDocument(route: string, source: string, tree: IRNode | null): IRPageDocument;
export declare function createIRDesktopDocument(entry: string, tree: IRNode | null, state?: IRStateDefinition[], bindings?: IRStateBinding[], actions?: IRStateAction[], effects?: IRLifecycleEffect[], componentBindings?: IRComponentBinding[], componentActions?: IRComponentAction[], initialRoute?: string, pages?: IRDesktopPageDocument[]): IRDesktopDocument;
export declare function serializeIRPageDocument(document: IRPageDocument): string;
export declare function serializeIRDesktopDocument(document: IRDesktopDocument): string;
export declare function normalizeToIR(input: AdaptiveChild | AdaptiveType, options?: NormalizeToIROptions): IRNode | null;
