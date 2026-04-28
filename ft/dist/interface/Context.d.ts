import { TSX5Node } from "../global";
export interface Context<T> {
    Provider: (props: ProviderProps<T>) => TSX5Node;
    useContext: () => {
        current: T;
    };
    displayName?: string;
}
export interface ProviderProps<T> {
    value: T;
    children?: TSX5Node | TSX5Node[];
}
export interface Box<T> {
    children?: TSX5Node | TSX5Node[];
}
