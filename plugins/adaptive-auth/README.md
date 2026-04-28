# adaptive-auth

Plugin server-first de autenticacao para o ecossistema `Adaptive`.

## Direcao

- tokens ficam somente no servidor
- o navegador recebe apenas um cookie opaco `HttpOnly`
- o cliente pode consultar sessao publica, mas nunca ler `accessToken` ou `refreshToken`

## O que ja entrega

- criacao de sessao server-side
- store em memoria para desenvolvimento
- cookie `HttpOnly` com `SameSite`
- wrapper para provedores externos via login/callback
- provider generico para login com credenciais contra API externa
- endpoint `GET /auth/session`
- endpoint `POST /auth/logout`
- endpoint `GET /auth/login/:provider`
- endpoint `POST /auth/login/:provider`
- endpoint `GET /auth/callback/:provider`
- helper server para exigir sessao
- helper client para buscar sessao publica
- `useAuth()` para componentes cliente

## Exemplo

```ts
import { init_server } from "@adaptivejs/ssr";
import { createAdaptiveAuth } from "@adaptivejs/auth";

const auth = createAdaptiveAuth({
  cookieName: "adaptive_session",
  secureCookies: process.env.NODE_ENV === "production"
});

await init_server({
  plugins: auth.createPlugins()
});
```

Criando sessao depois de trocar um code OAuth por tokens:

```ts
const session = await auth.createSession({
  user: { id: "u_123", email: "hello@adaptive.dev" },
  tokens: {
    accessToken: "server-only-token",
    refreshToken: "server-only-refresh-token"
  }
});

auth.applySession(res, session);
```

No cliente:

```ts
import { fetchAuthSession, useAuth } from "@adaptivejs/auth/client";

const result = await fetchAuthSession();
console.log(result.session?.user);

const auth = useAuth();
console.log(auth.status());
console.log(auth.data()?.user);
```

O `useAuth()` expõe:

- `data()`
- `status()`
- `authenticated()`
- `error()`
- `refresh()`
- `signOut()`

Ele trabalha apenas com a sessao publica. Tokens continuam invisiveis para o browser.

## Providers externos

O objetivo do `adaptive-auth` nao e virar um provedor fechado, e sim um wrapper server-first para APIs externas.

### Credentials provider generico

Para um backend externo que recebe email/senha e devolve JWT:

```ts
import { createAdaptiveAuth, createCredentialsProvider } from "@adaptivejs/auth";

const credentials = createCredentialsProvider({
  name: "credentials",
  async authenticateCredentials({ credentials }) {
    const response = await fetch("https://api.example.com/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({
        email: credentials.email,
        password: credentials.password
      })
    }).then((result) => result.json());

    return {
      user: response.user,
      tokens: {
        accessToken: response.access_token,
        refreshToken: response.refresh_token ?? null,
        expiresAt: response.expires_at ?? null
      },
      redirectTo: "/dashboard"
    };
  }
});

const auth = createAdaptiveAuth({
  providers: [credentials]
});
```

Login pelo cliente:

```ts
await fetch("/auth/login/credentials", {
  method: "POST",
  headers: {
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    email: "hello@adaptive.dev",
    password: "super-secret"
  })
});
```

O Adaptive recebe as credenciais no servidor, chama a API externa, guarda o token no store server-side e responde com cookie `HttpOnly`.

Exemplo de provider OAuth:

```ts
import { createAdaptiveAuth, createOAuthProvider } from "@adaptivejs/auth";

const github = createOAuthProvider({
  name: "github",
  getAuthorizationUrl({ state, callbackUrl }) {
    const url = new URL("https://github.com/login/oauth/authorize");
    url.searchParams.set("client_id", process.env.GITHUB_CLIENT_ID!);
    url.searchParams.set("redirect_uri", callbackUrl);
    url.searchParams.set("scope", "read:user user:email");
    url.searchParams.set("state", state);
    return url.toString();
  },
  async exchangeCode({ code, callbackUrl }) {
    const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: callbackUrl
      })
    }).then((response) => response.json());

    const profile = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${tokenResponse.access_token}`,
        Accept: "application/json"
      }
    }).then((response) => response.json());

    return {
      user: { id: profile.id, login: profile.login, name: profile.name },
      tokens: {
        accessToken: tokenResponse.access_token,
        refreshToken: tokenResponse.refresh_token ?? null,
        tokenType: tokenResponse.token_type ?? "bearer"
      },
      redirectTo: "/dashboard"
    };
  }
});

const auth = createAdaptiveAuth({
  providers: [github]
});
```

Nesse fluxo:

- o cliente manda o usuario para `/auth/login/github`
- o provider externo faz a autenticacao
- o callback troca `code` por token no servidor
- os tokens ficam no store server-side
- o browser recebe apenas o cookie opaco da sessao

## Proximo passo natural

- adicionar callback OAuth
- refresh token automatico
- persistencia em banco/redis
- middleware de protecao por rota
