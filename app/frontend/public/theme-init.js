try {
  const storedTheme = localStorage.getItem("theme");
  const preference = storedTheme ? JSON.parse(storedTheme) : "auto";
  const useDarkTheme =
    preference === "dark" ||
    (preference === "auto" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  const root = document.documentElement;

  root.dataset.theme = preference;
  root.classList.toggle("dark", useDarkTheme);
  root.style.colorScheme = useDarkTheme ? "dark" : "light";
} catch {
  const root = document.documentElement;
  const useDarkTheme = window.matchMedia(
    "(prefers-color-scheme: dark)",
  ).matches;
  root.dataset.theme = "auto";
  root.classList.toggle("dark", useDarkTheme);
  root.style.colorScheme = useDarkTheme ? "dark" : "light";
}
