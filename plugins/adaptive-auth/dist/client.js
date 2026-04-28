import { useEffect, useReactive } from "@adaptivejs/ft";
export async function fetchAuthSession(basePath = "/auth") {
	const response = await fetch(`${basePath}/session`, {
		credentials: "include",
		headers: { Accept: "application/json" }
	});
	const payload = await response.json();
	if (!response.ok && response.status !== 401) {
		throw new Error("Failed to fetch auth session.");
	}
	return payload;
}
export function useAuth(options = {}) {
	const basePath = options.basePath ?? "/auth";
	const [data, setData] = useReactive(options.initialData ?? null);
	const [status, setStatus] = useReactive(options.initialData ? "authenticated" : "loading");
	const [error, setError] = useReactive(null);
	const refresh = async () => {
		try {
			setError(null);
			if (status() !== "authenticated") {
				setStatus("loading");
			}
			const result = await fetchAuthSession(basePath);
			setData(result.session);
			setStatus(result.authenticated ? "authenticated" : "unauthenticated");
			return result;
		} catch (caught) {
			setStatus("error");
			setError(caught?.message ?? "Failed to load auth session.");
			return {
				authenticated: false,
				session: null
			};
		}
	};
	const signOut = async () => {
		const response = await fetch(`${basePath}/logout`, {
			method: "POST",
			credentials: "include"
		});
		if (!response.ok) {
			throw new Error("Failed to sign out.");
		}
		setData(null);
		setStatus("unauthenticated");
		setError(null);
	};
	useEffect(() => {
		if (options.immediate === false) return;
		void refresh();
	}, [basePath, options.immediate ?? true]);
	return {
		data,
		status,
		authenticated: () => status() === "authenticated",
		error,
		refresh,
		signOut
	};
}

//# sourceMappingURL=client.js.map
