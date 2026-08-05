import {ButtonV} from "../components/Button";
import {ButtonR} from "../components/Button2";
import {CallbacksDemo} from "../components/CallbacksDemo";
import {ListDemo} from "../components/ListDemo";
import {TableDemo} from "../components/TableDemo";
import {ThemeController} from "../components/ThemeController";

export default async function HomePage() {
    return (
        <main className="min-h-screen bg-slate-950 px-6 py-16 text-slate-100">
            <section className="mx-auto flex max-w-4xl flex-col gap-8 rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl shadow-slate-950/40 backdrop-blur">
                <div className="flex flex-col gap-3">
                    <ThemeController/>
                    <span className="w-fit rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">
                        Tailwind ligado
                    </span>
                    <h1 className="text-4xl font-black tracking-tight text-white sm:text-5xl">
                        Adaptive Hello2
                    </h1>
                    <p className="max-w-2xl text-sm leading-7 text-slate-300 sm:text-base">
                        Este exemplo agora processa <code className="rounded bg-white/10 px-2 py-1 text-cyan-200">@import &quot;tailwindcss&quot;;</code> no CSS do app, sem colocar o Tailwind dentro do framework.
                    </p>
                </div>

                <div className="grid gap-4 rounded-2xl border border-white/10 bg-slate-900/60 p-5">
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-bold text-white">Teste de interacao</h2>
                        <span className="rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-medium text-emerald-300">
                            OK
                        </span>
                    </div>

                    <div className="flex flex-wrap gap-3">
                        <ButtonR/>
                        <ButtonV/>
                    </div>
                </div>
                <CallbacksDemo/>
                <ListDemo/>
                <TableDemo/>
            </section>
        </main>)
}
