import { TSX5Node } from "./global";
import { Context, ProviderProps } from "./interface/Context.js";
import { useState } from "./state.js";

export function createContext<T>(defaultValue: T): Context<T> {
  const [current, setCurrent] = useState<T>(defaultValue);

  const Provider = ({ value, children }: ProviderProps<T>): TSX5Node => {
    setCurrent(value);
    return {
      tag: "Fragment",
      props: {},
      children: (Array.isArray(children) ? children : children ? [children] : []) as any
    };
  };

  return {
    Provider,
    useContext: () => ({
      current: current()
    })
  };
}

export function useContext<T>(context: { useContext: () => T }): T {
  return context.useContext();
}
