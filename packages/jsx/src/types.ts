/*
 * Copyright (c) 2026 Antonio Johnathan
 *
 * Licensed under the MIT License.
 * See LICENSE file in the project root for full license information.
 */

export type AdaptiveChild =
  | string
  | number
  | boolean
  | null
  | undefined
  | AdaptiveType
  | AdaptiveChild[]
  | (() => AdaptiveChild);

export interface AdaptiveType {
  tag: string | symbol | ((props: any) => AdaptiveNode);
  props?: Record<string, any>;
  children?: AdaptiveChild[];
}

export type AdaptiveNode =
  | AdaptiveType
  | Promise<AdaptiveType>
  | AdaptiveChild;

export type ReactiveNode = AdaptiveNode;
export type ReactiveElement = AdaptiveType;

export interface Ref<T> {
  current: T | null;
}

export interface Context<T> {
  Provider: (props: ProviderProps<T>) => AdaptiveNode;
  useContext: () => { current: T };
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
