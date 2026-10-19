import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ImageWithFallback } from "../src/components/ImageWithFallback/ImageWithFallback";

describe("ImageWithFallback", () => {
  afterEach(cleanup);

  it("defaults to lazy, asynchronous image loading", () => {
    render(<ImageWithFallback src="/poster.jpg" alt="Poster" />);

    const image = screen.getByRole("img", { name: "Poster" });
    expect(image.getAttribute("loading")).toBe("lazy");
    expect(image.getAttribute("decoding")).toBe("async");
  });

  it("keeps the fallback image after it loads", () => {
    render(
      <ImageWithFallback
        src="/missing.jpg"
        fallbackSrc="/fallback.jpg"
        alt="Poster"
      />,
    );

    const image = screen.getByRole("img", { name: "Poster" });
    fireEvent.error(image);
    expect(image.getAttribute("src")).toBe("/fallback.jpg");

    fireEvent.load(image);
    expect(
      screen.getByRole("img", { name: "Poster" }).getAttribute("src"),
    ).toBe("/fallback.jpg");
  });

  it("loads explicitly eager images and resets on source changes", () => {
    const { rerender } = render(
      <ImageWithFallback src="/first.jpg" alt="Poster" loading="eager" />,
    );
    expect(
      screen.getByRole("img", { name: "Poster" }).getAttribute("loading"),
    ).toBe("eager");

    rerender(<ImageWithFallback src="/second.jpg" alt="Poster" />);
    const image = screen.getByRole("img", { name: "Poster" });
    expect(image.getAttribute("src")).toBe("/second.jpg");
    expect(image.getAttribute("loading")).toBe("lazy");
  });
});
