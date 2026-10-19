import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Provider } from "jotai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToggleTheme } from "../src/components/App/Header/Theme/Theme";

describe("theme preference", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.dataset.theme = "auto";
    document.documentElement.classList.add("dark");
    document.documentElement.style.colorScheme = "dark";
    vi.stubGlobal(
      "matchMedia",
      vi.fn(
        (media: string) =>
          ({
            matches: media === "(prefers-color-scheme: dark)",
            media,
            onchange: null,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            addListener: vi.fn(),
            removeListener: vi.fn(),
            dispatchEvent: vi.fn(),
          }) as unknown as MediaQueryList,
      ),
    );
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
    document.documentElement.classList.remove("dark");
    delete document.documentElement.dataset.theme;
    document.documentElement.style.colorScheme = "";
    vi.unstubAllGlobals();
  });

  it("follows the system preference and cycles through all three choices", () => {
    render(
      <Provider>
        <ToggleTheme />
      </Provider>,
    );

    const button = screen.getByRole("button", { name: "ライトテーマに変更" });
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    fireEvent.click(button);
    expect(localStorage.getItem("theme")).toBe('"light"');
    expect(
      screen.getByRole("button", { name: "ダークテーマに変更" }),
    ).toBeTruthy();
    expect(document.documentElement.classList.contains("dark")).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "ダークテーマに変更" }));
    expect(localStorage.getItem("theme")).toBe('"dark"');

    fireEvent.click(
      screen.getByRole("button", { name: "システム設定に合わせる" }),
    );
    expect(localStorage.getItem("theme")).toBe('"auto"');
  });
});
