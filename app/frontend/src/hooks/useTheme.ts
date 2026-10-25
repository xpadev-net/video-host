import { useAtom } from "jotai";
import { useEffect, useRef, useSyncExternalStore } from "react";

import { ThemeAtom } from "@/atoms/Theme";

export const useTheme = () => {
  const [preference, setPreference] = useAtom(ThemeAtom);
  const systemTheme = useSyncExternalStore(
    (onChange) => {
      const media = window.matchMedia("(prefers-color-scheme: dark)");
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    },
    () =>
      window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light",
    () => "light",
  );
  const theme = preference === "auto" ? systemTheme : preference;
  const skipInitialThemeSync = useRef(true);

  useEffect(() => {
    // The head bootstrap script has already applied the saved/system theme
    // before paint. Do not overwrite it with useSyncExternalStore's hydration
    // snapshot, which intentionally matches the server's light snapshot.
    if (skipInitialThemeSync.current) {
      skipInitialThemeSync.current = false;
      return;
    }

    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    root.dataset.theme = preference;
    root.style.colorScheme = theme;
  }, [preference, theme]);

  return { theme, preference, setTheme: setPreference };
};
