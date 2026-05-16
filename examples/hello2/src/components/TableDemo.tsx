'hydrate'

import { TableCanvas, TableVirtual, type TableColumn } from "@adaptive-js/components";

type UserRow = {
    id: number;
    name: string;
    email: string;
    plan: string;
};
const rows: UserRow[] = Array.from({ length: 5000 }, (_, index) => ({
    id: index + 1,
    name: `User ${index + 1}`,
    email: `user${index + 1}@adaptive.dev`,
    plan: index % 3 === 0 ? "Enterprise" : index % 2 === 0 ? "Pro" : "Starter"
}));

const columns: TableColumn<UserRow>[] = [
    { key: "id", header: "ID", width: 90, align: "right" },
    { key: "name", header: "Nome", width: 220 },
    { key: "email", header: "Email" },
    { key: "plan", header: "Plano", width: 140, align: "center" }
];

export const TableDemo = () => {
    return (
        <div className="grid gap-5 rounded-2xl border border-white/10 bg-slate-900/60 p-5">
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-white">Adaptive Tables</h2>
                <span className="rounded-full bg-fuchsia-400/10 px-3 py-1 text-xs font-medium text-fuchsia-300">
                    canvas + virtual
                </span>
            </div>

            <p className="max-w-2xl text-sm leading-7 text-slate-300">
                O pacote agora separa tabela canvas para escala mais agressiva e tabela virtualizada DOM para casos que pedem ergonomia HTML.
            </p>

            <div className="grid gap-4 xl:grid-cols-2">
                <div className="grid gap-3">
                    <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">
                        TableCanvas
                    </h3>
                    <TableCanvas
                        rows={rows}
                        columns={columns}
                        height={280}
                        rowHeight={42}
                        className="border border-white/10 bg-white"
                    />
                </div>

                <div className="grid gap-3">
                    <h3 className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">
                        TableVirtual
                    </h3>
                    <TableVirtual
                        rows={rows}
                        columns={columns}
                        height={280}
                        rowHeight={42}
                        className="border border-white/10 bg-white"
                    />
                </div>
            </div>
        </div>
    );
};