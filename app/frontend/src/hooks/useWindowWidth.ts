import { useCallback, useRef, useState } from "react";

export const useWindowWidth = () => {
  const [containerWidth, setContainerWidth] = useState(1920);
  const observer = useRef<ResizeObserver | null>(null);
  const ref = useCallback((element: HTMLElement | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!element) return;

    const updateWidth = () => setContainerWidth(element.clientWidth || 1920);
    updateWidth();
    observer.current = new ResizeObserver(updateWidth);
    observer.current.observe(element);
  }, []);

  return { containerWidth, ref };
};
