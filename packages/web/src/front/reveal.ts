

export type RevealProps = {
    when: boolean | (() => boolean);
    fallback?: any;
    children?: any;
};

function createMarker(type: "if" | "else") {
    const Marker = (props: any): any => {
        return props.children ?? null;
    };
    (Marker as any)._revealType = type;
    return Marker;
}

export const If = createMarker("if") as any;
export const Else = createMarker("else") as any;

function extractBranches(children: any, fallback: any) {
    let ifBranch: any = null;
    let elseBranch: any = fallback ?? null;

    if (children == null) return { ifBranch, elseBranch };

    const list = Array.isArray(children) ? children.flat(Infinity) : [children];
    let hasMarker = false;

    for (const child of list) {
        if (child == null || child === false || child === true) continue;
        const tag = (child as any)?.tag;
        const t = (tag as any)?._revealType;
        if (t === "if") {
            hasMarker = true;
            ifBranch =
                (child as any).props?.children ??
                (child as any).children ??
                null;
        } else if (t === "else") {
            hasMarker = true;
            elseBranch =
                (child as any).props?.children ??
                (child as any).children ??
                null;
        }
    }

    if (!hasMarker) {
        // uso antigo: <Reveal><Test /></Reveal>
        ifBranch = children;
    }

    return { ifBranch, elseBranch };
}

function withBranchKey(node: any, key: "on" | "off"): any {
    if (node == null || node === false || node === true) return node;

    // lista: aplica no único filho relevante ou envolve
    if (Array.isArray(node)) {
        const list = node.flat(Infinity).filter(
            (v) => v != null && v !== false && v !== true,
        );
        if (list.length === 1) return withBranchKey(list[0], key);
        return list.map((v, i) => withBranchKey(v, `${key}-${i}` as any));
    }

    // vnode Adaptive { tag, props, children }
    if (typeof node === "object" && node.tag != null) {
        return {
            ...node,
            props: { ...(node.props ?? {}), key },
        };
    }

    // texto / número → envolve em fragment com key via props fake não ajuda;
    // para texto puro o keyed block pode usar a própria key string:
    return { tag: "Fragment", props: { key }, children: [node] };
}

function RevealFn(props: RevealProps): any {
    return (() => {
        const raw = props.when as any;
        const show = typeof raw === "function" ? raw() : !!raw;

        const { ifBranch, elseBranch } = extractBranches(
            props.children,
            props.fallback,
        );

        return show
            ? withBranchKey(ifBranch ?? null, "on")
            : withBranchKey(elseBranch ?? null, "off");
    }) as any;
}

export const Reveal = RevealFn as any as {
    (props: RevealProps): any;
    If: typeof If;
    Else: typeof Else;
};
Reveal.If = If;
Reveal.Else = Else;

export const When = Reveal;
export const Branch = Reveal;

export default Reveal;