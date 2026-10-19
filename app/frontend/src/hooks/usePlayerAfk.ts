import { useCallback, useEffect, useRef, useState } from "react";

export function usePlayerAfk(timeoutMs = 3000) {
  const [isAfk, setIsAfk] = useState(false);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showControls = useCallback(() => {
    setIsAfk(false);
    if (timeout.current) clearTimeout(timeout.current);
    timeout.current = setTimeout(() => setIsAfk(true), timeoutMs);
  }, [timeoutMs]);

  const toggleControls = useCallback(() => {
    if (isAfk) {
      showControls();
      return;
    }
    if (timeout.current) clearTimeout(timeout.current);
    setIsAfk(true);
  }, [isAfk, showControls]);

  useEffect(() => {
    showControls();
    return () => {
      if (timeout.current) clearTimeout(timeout.current);
    };
  }, [showControls]);

  return { isAfk, showControls, toggleControls };
}
