import { createContext, useContext, useEffect, useReactive } from "@adaptive-js/web";

export const DEFAULT_I18N_LANGUAGE = "en";

export type I18nPrimitive = string | number | boolean | null | undefined;
export type I18nParams = Record<string, I18nPrimitive>;
export type I18nMessageValue =
  | string
  | ((params?: I18nParams) => string)
  | I18nMessageTree;

export type I18nMessageTree = {
  [key: string]: I18nMessageValue;
};

export type I18nMessages<TLocale extends string = string> = Record<TLocale, I18nMessageTree>;

export type I18nConfig<TLocale extends string = string> = {
  locale?: TLocale;
  fallbackLocale?: TLocale;
  messages: I18nMessages<TLocale>;
};

export type I18nProviderProps<TLocale extends string = string> = {
  locale?: TLocale;
  fallbackLocale?: TLocale;
  messages?: I18nMessages<TLocale>;
  children?: any;
};

export type I18nApi<TLocale extends string = string> = {
  locale: () => TLocale;
  fallbackLocale: () => TLocale;
  setLocale: (next: TLocale | ((prev: TLocale) => TLocale)) => void;
  t: (key: string, params?: I18nParams) => string;
  has: (key: string, locale?: TLocale) => boolean;
  messages: () => I18nMessages<TLocale>;
};

export type HtmlLanguageOptions = {
  defaultValue?: string;
};

export function normalizeLocale(locale: string | null | undefined, fallback = DEFAULT_I18N_LANGUAGE) {
  if (typeof locale !== "string") {
    return fallback;
  }

  const normalized = locale.trim().replace(/_/g, "-").toLowerCase();
  return normalized || fallback;
}

function interpolateMessage(template: string, params?: I18nParams) {
  if (!params) {
    return template;
  }

  return template.replace(/\{([^}]+)\}/g, (_, token: string) => {
    const value = params[token.trim()];
    return value == null ? "" : String(value);
  });
}

function resolvePathValue(tree: I18nMessageTree | undefined, key: string): I18nMessageValue | undefined {
  if (!tree) {
    return undefined;
  }

  const segments = key.split(".");
  let current: I18nMessageValue | undefined = tree;

  for (const segment of segments) {
    if (!current || typeof current === "string" || typeof current === "function") {
      return undefined;
    }

    current = current[segment];
  }

  return current;
}

function resolveMessage<TLocale extends string>(
  messages: I18nMessages<TLocale>,
  locale: TLocale,
  fallbackLocale: TLocale,
  key: string,
  params?: I18nParams
) {
  const direct = resolvePathValue(messages[locale], key);
  const fallback = locale === fallbackLocale ? undefined : resolvePathValue(messages[fallbackLocale], key);
  const message = direct ?? fallback;

  if (typeof message === "function") {
    return message(params);
  }

  if (typeof message === "string") {
    return interpolateMessage(message, params);
  }

  return key;
}

function hasMessage<TLocale extends string>(
  messages: I18nMessages<TLocale>,
  locale: TLocale,
  fallbackLocale: TLocale,
  key: string
) {
  return (
    resolvePathValue(messages[locale], key) !== undefined ||
    resolvePathValue(messages[fallbackLocale], key) !== undefined
  );
}

export function getHtmlLanguage(options: HtmlLanguageOptions = {}) {
  const defaultValue = options.defaultValue ?? DEFAULT_I18N_LANGUAGE;

  if (typeof document === "undefined") {
    return defaultValue;
  }

  return document.documentElement.lang || defaultValue;
}

export function setHtmlLanguage(locale: string) {
  if (typeof document === "undefined") {
    return;
  }

  document.documentElement.lang = normalizeLocale(locale);
}

export function syncHtmlLanguage(locale: string) {
  const normalized = normalizeLocale(locale);
  setHtmlLanguage(normalized);
  return normalized;
}

export function getBrowserLanguage(options: HtmlLanguageOptions = {}) {
  const defaultValue = options.defaultValue ?? DEFAULT_I18N_LANGUAGE;

  if (typeof navigator === "undefined") {
    return defaultValue;
  }

  return normalizeLocale(navigator.language, defaultValue);
}

export function useHtmlLanguage(locale: string | (() => string)) {
  useEffect(() => {
    const nextLocale = typeof locale === "function" ? locale() : locale;
    setHtmlLanguage(nextLocale);
  }, [locale]);
}

export function createI18n<TLocale extends string>(config: I18nConfig<TLocale>) {
  const I18nContext = createContext<I18nApi<TLocale> | null>(null);

  function I18nProvider(props: I18nProviderProps<TLocale>) {
    const mergedMessages = props.messages ?? config.messages;
    const initialLocale = normalizeLocale(
      props.locale ?? config.locale ?? DEFAULT_I18N_LANGUAGE,
      DEFAULT_I18N_LANGUAGE
    ) as TLocale;
    const initialFallbackLocale = (
      normalizeLocale(
        props.fallbackLocale ??
        config.fallbackLocale ??
        DEFAULT_I18N_LANGUAGE,
        DEFAULT_I18N_LANGUAGE
      )
    ) as TLocale;

    const [locale, setLocale] = useReactive<TLocale>(initialLocale);
    const [fallbackLocale] = useReactive<TLocale>(initialFallbackLocale);

    useHtmlLanguage(locale);

    const api: I18nApi<TLocale> = {
      locale,
      fallbackLocale,
      setLocale: (next) => {
        if (typeof next === "function") {
          setLocale((prev) => {
            return normalizeLocale((next as (prev: TLocale) => TLocale)(prev)) as TLocale;
          });
          return;
        }

        setLocale(normalizeLocale(next) as TLocale);
      },
      messages: () => mergedMessages,
      has: (key: string, overrideLocale?: TLocale) =>
        hasMessage(mergedMessages, overrideLocale ?? locale(), fallbackLocale(), key),
      t: (key: string, params?: I18nParams) =>
        resolveMessage(mergedMessages, locale(), fallbackLocale(), key, params)
    };

    return I18nContext.Provider({
      value: api,
      children: props.children
    });
  }

  const missingProviderApi: I18nApi<any> = {
    locale: () => DEFAULT_I18N_LANGUAGE,
    fallbackLocale: () => DEFAULT_I18N_LANGUAGE,

    setLocale: () => {
      console.warn("[AdaptiveJS i18n] Cannot change locale because no I18nProvider was found.");
    },

    has: () => false,

    messages: () => ({}),

    t: (key) => `[Missing I18nProvider] ${key}`,
  };

  function useI18n() {
    const api = useContext(I18nContext);

    if (!api) {
      console.warn(
          "[AdaptiveJS i18n] useI18n() was called outside an I18nProvider."
      );

      return missingProviderApi;
    }

    return api;
  }

  return {
    I18nProvider,
    useI18n
  };
}

export function defineMessages<TLocale extends string>(messages: I18nMessages<TLocale>) {
  return messages;
}
