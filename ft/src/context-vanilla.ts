import { Fragment } from "./jsx-runtime.js";
import { useState } from "./state.js";
import { Context, ProviderProps } from "./interface/Context.js";
import { TSX5Node } from "./global";

export function createContext<T>(defaultValue: T): Context<T> {
  const [stack, setStack] = useState<T[]>([defaultValue]);

  const Provider = ({ value, children }: ProviderProps<T>): TSX5Node => {
    setStack([value]);
    return Fragment({ children });
  };

  const useContextHook = () => ({
    get current() {
      const values = stack();
      return values[values.length - 1];
    }
  });

  return { Provider, useContext: useContextHook };
}

export function useContext<T>(context: { useContext: () => T }): T {
  return context.useContext();
}
