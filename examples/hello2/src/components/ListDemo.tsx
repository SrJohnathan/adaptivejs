'hydrate'




import {convertItemNode, ItemList, ListCanvas} from "@adaptivejs/components";

const rows = Array.from({ length: 1_000_000 }, (_, index) => ({
    id: index + 1,
    label: `Row ${index + 1}`,
    value: `Item ${index + 1}`
}));

type Row = (typeof rows)[number];

const Item: ItemList<{ item: Row; index: number }> = ({ item, index }) => {
    return (
        <>
            <h6>{item.label}</h6>
            <p>{item.value}</p>
            <span>{index % 2 === 0 ? "even" : "odd"}</span>
        </>
    );
};

export const ListDemo = () => {
    return (
        <div className="grid gap-4 rounded-2xl border border-white/10 bg-slate-900/60 p-5">
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-white">Adaptive List Canvas</h2>
                <span className="rounded-full bg-cyan-400/10 px-3 py-1 text-xs font-medium text-cyan-300">
                    1.000.000 itens
                </span>
            </div>

            <p className="max-w-2xl text-sm leading-7 text-slate-300">
                Esta lista usa o pacote <code className="rounded bg-white/10 px-2 py-1 text-cyan-200">@adaptivejs/components</code> e desenha os itens em canvas, sem criar DOM por linha.
            </p>

            <ListCanvas
                items={rows}
                height={320}
                itemHeight={72}
                className="rounded-2xl border border-white/10 bg-white overflow"
                background="#ffffff"
                item={(item, index) => convertItemNode(Item, { item, index })}
                onItemClick={(item, index) => {
                    console.log("clicked list item", index, item);
                }}
            />
        </div>
    );
};
