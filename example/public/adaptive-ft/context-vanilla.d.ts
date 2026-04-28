import { Context } from "./interface/Context.js";
export declare function createContext<T>(defaultValue: T): Context<T>;
export declare function useContext<T>(context: {
    useContext: () => T;
}): T;
