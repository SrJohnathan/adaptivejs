export type AdaptiveChild = string | number | boolean | null | undefined | Node | AdaptiveType | AdaptiveChild[] | (() => AdaptiveChild);
export interface AdaptiveType {
    tag: string | Function;
    props?: Record<string, any>;
    children?: AdaptiveChild[];
}
export type AdaptiveNode = AdaptiveType | Promise<AdaptiveType>;
export type ReactiveNode = AdaptiveNode;
export type ReactiveElement = AdaptiveType;
export interface Ref<T> {
    current: T | null;
}
export interface Context<T> {
    Provider: (props: ProviderProps<T>) => AdaptiveNode;
    useContext: () => {
        current: T;
    };
    displayName?: string;
}
export interface ProviderProps<T> {
    value: T;
    children?: AdaptiveNode | AdaptiveNode[];
}
export interface Box<T> {
    children?: AdaptiveNode | AdaptiveNode[];
}
export interface ChangeEvent<T extends EventTarget = HTMLInputElement> extends Event {
    target: T;
}
