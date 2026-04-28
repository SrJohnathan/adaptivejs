import { Ref } from "../interface/Ref.js";
import { TSX5Node } from "../global";



/**
 * ComponetRef - Função para criar componentes que suportam ref (similar ao forwardRef do React).
 *
 * @param renderFn - Função que recebe props e uma ref, e retorna um elemento (HTMLElement ou Text)
 * @returns Um componente que aceita props e uma ref opcional.
 */
export function ComponentRef<P, R>(renderFn: (props: P, ref: Ref<R>) => TSX5Node) {
    return (props: P & { ref?: Ref<R> }): TSX5Node => {
        // Se uma ref for passada via props, usa-a; caso contrário, cria uma ref padrão com current null
        const ref = props.ref || { current: null };
        return renderFn(props, ref);
    };
}


/**
 * onFunction - Define o valor exposto pela ref, similar ao useImperativeHandle do React.
 *
 * @param ref - A referência que receberá o objeto exposto.
 * @param createValue - Uma função que retorna o objeto a ser atribuído a ref.current.
 */
export function onFunction<T>(ref: Ref<T>, createValue: () => T): void {
    if (ref) {
        ref.current = createValue();
    }
}
