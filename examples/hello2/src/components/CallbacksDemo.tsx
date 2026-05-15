'hydrate'

import { useReactive } from "@adaptivejs/web";

export const CallbacksDemo = () => {
    const [inputValue, setInputValue] = useReactive("");
    const [clickCount, setClickCount] = useReactive(0);
    const [submitCount, setSubmitCount] = useReactive(0);
    const [scrollTop, setScrollTop] = useReactive(0);
    const [wheelDelta, setWheelDelta] = useReactive(0);
    const [status, setStatus] = useReactive("Aguardando evento");

    return (
        <div className="grid gap-4 rounded-2xl border border-white/10 bg-slate-900/60 p-5">
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-white">Teste de callbacks</h2>
                <span className="rounded-full bg-fuchsia-400/15 px-3 py-1 text-xs font-medium text-fuchsia-300">
                    runtime
                </span>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
                <form
                    className="grid gap-3"
                    onSubmit={(event) => {
                        event.preventDefault();
                        setSubmitCount((value) => value + 1);
                        setStatus(`submit ${submitCount() + 1}`);
                    }}
                >
                    <label className="grid gap-2 text-sm text-slate-300">
                        <span>Input reativo</span>
                        <textarea
                            className="min-h-28 rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-white outline-none"
                            placeholder="Digite para testar onInput"
                            onInput={(event) => {
                                const target = event.currentTarget as HTMLTextAreaElement;
                                setInputValue(target.value);
                                setStatus(`input ${target.value.length}`);
                            }}
                        />
                    </label>

                    <div className="flex flex-wrap gap-3">
                        <button
                            type="button"
                            className="rounded-xl bg-cyan-400/20 px-4 py-2 text-sm font-semibold text-cyan-200"
                            onClick={() => {
                                setClickCount((value) => value + 1);
                                setStatus(`click ${clickCount() + 1}`);
                            }}
                        >
                            onClick
                        </button>

                        <button
                            type="submit"
                            className="rounded-xl bg-emerald-400/20 px-4 py-2 text-sm font-semibold text-emerald-200"
                        >
                            onSubmit
                        </button>
                    </div>
                </form>

                <div className="grid gap-3">
                    <div
                        className="h-28 overflow-y-auto rounded-xl border border-white/10 bg-slate-950/70 p-3 text-sm text-slate-200"
                        onScroll={(event) => {
                            const target = event.currentTarget as HTMLDivElement;
                            setScrollTop(target.scrollTop);
                            setStatus(`scroll ${Math.round(target.scrollTop)}`);
                        }}
                        onWheel={(event) => {
                            setWheelDelta(Math.round(event.deltaY));
                        }}
                    >
                        <div className="space-y-2">
                            <p>Role esta caixa para testar onScroll e onWheel.</p>
                            <div className="h-48 rounded-lg bg-gradient-to-b from-cyan-400/10 to-transparent" />
                        </div>
                    </div>

                    <div className="grid gap-2 rounded-xl border border-white/10 bg-slate-950/50 p-3 text-sm text-slate-300">
                        <p>Texto atual: <strong className="text-white">{() => inputValue() || "vazio"}</strong></p>
                        <p>Clicks: <strong className="text-white">{() => String(clickCount())}</strong></p>
                        <p>Submits: <strong className="text-white">{() => String(submitCount())}</strong></p>
                        <p>ScrollTop: <strong className="text-white">{() => String(Math.round(scrollTop()))}</strong></p>
                        <p>Wheel delta: <strong className="text-white">{() => String(wheelDelta())}</strong></p>
                        <p>Status: <strong className="text-white">{() => status()}</strong></p>
                    </div>
                </div>
            </div>
        </div>
    );
};
