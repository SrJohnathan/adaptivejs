'hydrate'

import {MoonIcon, SunIcon ,AArrowDownIcon} from "@adaptive-js/extension-lucide-animation-icons";

import { useLayoutEffect, useReactive } from "@adaptive-js/web";

type ThemeMode = "light" | "dark";

const STORAGE_KEY = "adaptive-theme";

export  const ThemeController = ()=> {


  const [theme, setTheme] = useReactive<ThemeMode>("dark");

  useLayoutEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const nextTheme = resolveInitialTheme(media);

    setTheme(nextTheme);
    applyTheme(nextTheme);

    const onMediaChange = () => {
      const storedTheme = readStoredTheme();
      if (storedTheme) {
        return;
      }

      const systemTheme: ThemeMode = media.matches ? "dark" : "light";
      setTheme(systemTheme);
      applyTheme(systemTheme);
    };

    media.addEventListener?.("change", onMediaChange);

    return () => {
      media.removeEventListener?.("change", onMediaChange);
      };
  }, []);

  const isDark = () => theme() === "dark";

  const toggleWithRipple = async (event: MouseEvent) => {



    const nextTheme: ThemeMode = isDark() ? "light" : "dark";
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const docWithTransition = document as Document & {
      startViewTransition?: (cb: () => void) => { ready: Promise<void> };
    };

    if (!docWithTransition.startViewTransition || reduceMotion) {
      setTheme(nextTheme);
      applyTheme(nextTheme);
      return;
    }

    const target = event.currentTarget as HTMLElement | null;
    if (!target) {
      setTheme(nextTheme);
      applyTheme(nextTheme);
      return;
    }

    const rect = target.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const maxX = Math.max(x, window.innerWidth - x);
    const maxY = Math.max(y, window.innerHeight - y);
    const endRadius = Math.hypot(maxX, maxY);

    const transition = docWithTransition.startViewTransition(() => {
      setTheme(nextTheme);
      applyTheme(nextTheme);
    });

    await transition.ready;

    document.documentElement.animate(
      {
        clipPath: [
          `circle(0px at ${x}px ${y}px)`,
          `circle(${endRadius}px at ${x}px ${y}px)`,
        ],
      },
      {
        duration: 520,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        pseudoElement: "::view-transition-new(root)",
      },
    );
  };

  // site-theme-button
  return (
      <>
        <button

            onClick={toggleWithRipple}
            aria-label={ () => isDark() ? "Ativar modo claro" : "Ativar modo escuro"}
            className=" site-theme-button  inline-flex h-11 w-11 items-center justify-center rounded-full border transition"
        >


          { () =>  isDark() ?    <MoonIcon />  : <SunIcon animateOnHover={true} />}



        </button>
      </>

  );
}

function A() {
  return (

      <div
          aria-label="sun"
          role="img"
      >
        <svg width="24" height="24"
             xmlns="http://www.w3.org/2000/svg"

             viewBox="0 0 24 24"
           

             strokeWidth={"1"}
             strokeLinecap="round"
             strokeLinejoin="round"

        >
          <circle cx="12" cy="12" r="5" />
        </svg>
      </div>

  );
}

export function MoonIco() {
  return <div>Moon</div>;
}

function resolveInitialTheme(media: MediaQueryList): ThemeMode {
  const storedTheme = readStoredTheme();
  if (storedTheme) {
    return storedTheme;
  }

  return media.matches ? "dark" : "light";
}

function readStoredTheme(): ThemeMode | null {
  const storedTheme = window.localStorage.getItem(STORAGE_KEY);
  if (storedTheme === "light" || storedTheme === "dark") {
    return storedTheme;
  }

  return null;
}

function applyTheme(theme: ThemeMode) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
  window.localStorage.setItem(STORAGE_KEY, theme);
}
