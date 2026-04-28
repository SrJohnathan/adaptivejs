import { useEffect, useReactive } from "@adaptivejs/ft";
import type { PublicAuthSession } from "./types.js";

export type AuthFetchResult<User = Record<string, unknown>> = {
  authenticated: boolean;
  session: PublicAuthSession<User> | null;
};

export type AuthStatus = "loading" | "authenticated" | "unauthenticated" | "error";

export type UseAuthOptions<User = Record<string, unknown>> = {
  basePath?: string;
  initialData?: PublicAuthSession<User> | null;
  immediate?: boolean;
};

export async function fetchAuthSession<User = Record<string, unknown>>(basePath = "/auth") {
  const response = await fetch(`${basePath}/session`, {
    credentials: "include",
    headers: {
      Accept: "application/json"
    }
  });

  const payload = (await response.json()) as AuthFetchResult<User>;
  if (!response.ok && response.status !== 401) {
    throw new Error("Failed to fetch auth session.");
  }
  return payload;
}

export function useAuth<User = Record<string, unknown>>(options: UseAuthOptions<User> = {}) {
  const basePath = options.basePath ?? "/auth";
  const [data, setData] = useReactive<PublicAuthSession<User> | null>(options.initialData ?? null);
  const [status, setStatus] = useReactive<AuthStatus>(options.initialData ? "authenticated" : "loading");
  const [error, setError] = useReactive<string | null>(null);

  const refresh = async () => {
    try {
      setError(null);
      if (status() !== "authenticated") {
        setStatus("loading");
      }
      const result = await fetchAuthSession<User>(basePath);
      setData(result.session);
      setStatus(result.authenticated ? "authenticated" : "unauthenticated");
      return result;
    } catch (caught: any) {
      setStatus("error");
      setError(caught?.message ?? "Failed to load auth session.");
      return {
        authenticated: false,
        session: null
      } satisfies AuthFetchResult<User>;
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
