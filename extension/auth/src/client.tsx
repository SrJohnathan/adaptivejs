import { createContext, useContext, signal } from "@adaptive-js/web";
import type { AuthClientState, AuthUser } from "./types.js";

export interface AuthProviderProps<TUser extends AuthUser = AuthUser> {
  initialState?: AuthClientState<TUser>;
  autoClearOnExpired?: boolean;
  onExpired?: () => void;
  children?: any;
}

export interface AuthClientApi<TUser extends AuthUser = AuthUser> {
  state: () => AuthClientState<TUser>;
  user: () => TUser | null;
  authenticated: () => boolean;
  isExpired: () => boolean;
  expiresInMs: () => number | null;
  setState: (state: AuthClientState<TUser>) => void;
  clear: () => void;
}

export interface CreateAuthClientOptions {
  autoClearOnExpired?: boolean;
  onExpired?: () => void;
}

const EMPTY_AUTH_STATE: AuthClientState = {
  authenticated: false,
  user: null,
  expiresAt: null
};

export function createAuthClient<TUser extends AuthUser = AuthUser>(
  clientOptions: CreateAuthClientOptions = {}
) {
  const AuthContext = createContext<AuthClientApi<TUser> | null>(null);

  function AuthProvider(props: AuthProviderProps<TUser>) {
    const [state, setState] = signal<AuthClientState<TUser>>(
      props.initialState ?? (EMPTY_AUTH_STATE as AuthClientState<TUser>)
    );

    const autoClear = props.autoClearOnExpired ?? clientOptions.autoClearOnExpired ?? false;
    const onExpiredCallback = props.onExpired ?? clientOptions.onExpired;

    let timerId: any = null;

    function scheduleExpiryCheck(currentState: AuthClientState<TUser>) {
      if (typeof setTimeout === "undefined") return;
      if (timerId) {
        clearTimeout(timerId);
        timerId = null;
      }

      if (!currentState.authenticated || !currentState.expiresAt) {
        return;
      }

      const remaining = getAuthStateExpiresInMs(currentState);
      if (remaining === null) return;

      if (remaining <= 0) {
        if (autoClear) {
          setState(EMPTY_AUTH_STATE as AuthClientState<TUser>);
        }
        onExpiredCallback?.();
        return;
      }

      // Schedule callback slightly after expiration
      timerId = setTimeout(() => {
        if (autoClear) {
          setState(EMPTY_AUTH_STATE as AuthClientState<TUser>);
        }
        onExpiredCallback?.();
      }, remaining + 50);
    }

    // Schedule on initial state
    scheduleExpiryCheck(state());

    function updateState(next: AuthClientState<TUser>) {
      setState(next);
      scheduleExpiryCheck(next);
    }

    function clear() {
      if (timerId) {
        clearTimeout(timerId);
        timerId = null;
      }
      setState(EMPTY_AUTH_STATE as AuthClientState<TUser>);
    }

    const api: AuthClientApi<TUser> = {
      state,
      user: () => state().user,
      authenticated: () => {
        const s = state();
        if (!s.authenticated) return false;
        if (isAuthStateExpired(s)) {
          if (autoClear) {
            clear();
          }
          return false;
        }
        return true;
      },
      isExpired: () => isAuthStateExpired(state()),
      expiresInMs: () => getAuthStateExpiresInMs(state()),
      setState: updateState,
      clear
    };

    return AuthContext.Provider({
      value: api,
      children: props.children
    });
  }

  function useAuth() {
    const auth = useContext(AuthContext);

    if (!auth) {
      throw new Error("useAuth must be used inside an AuthProvider.");
    }

    return auth;
  }

  return {
    AuthProvider,
    useAuth
  };
}

export function toAuthClientState<TUser extends AuthUser>(session: {
  user: TUser;
  expiresAt: Date;
} | null): AuthClientState<AuthUser>;
export function toAuthClientState<TUser extends AuthUser, TClientUser extends AuthUser>(
  session: {
    user: TUser;
    expiresAt: Date;
  } | null,
  selectUser: (user: TUser) => TClientUser
): AuthClientState<TClientUser>;
export function toAuthClientState<TUser extends AuthUser, TClientUser extends AuthUser>(
  session: {
    user: TUser;
    expiresAt: Date;
  } | null,
  selectUser?: (user: TUser) => TClientUser
): AuthClientState<TClientUser | AuthUser> {
  if (!session) {
    return EMPTY_AUTH_STATE;
  }

  // Never expose arbitrary adapter fields (for example passwordHash) by default.
  const user = selectUser
    ? selectUser(session.user)
    : {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        roles: session.user.roles ? [...session.user.roles] : undefined
      };

  return {
    authenticated: true,
    user,
    expiresAt: session.expiresAt.toISOString()
  };
}

export function isAuthStateExpired(state: AuthClientState): boolean {
  if (!state.expiresAt) {
    return false;
  }

  const expiresAt = Date.parse(state.expiresAt);
  return Number.isFinite(expiresAt) && expiresAt <= Date.now();
}

export function getAuthStateExpiresInMs(state: AuthClientState): number | null {
  if (!state.expiresAt) {
    return null;
  }

  const expiresAt = Date.parse(state.expiresAt);
  if (!Number.isFinite(expiresAt)) {
    return null;
  }

  return Math.max(0, expiresAt - Date.now());
}
