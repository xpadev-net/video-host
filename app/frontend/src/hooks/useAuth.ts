import { useRouter } from "@tanstack/react-router";
import { useSetAtom } from "jotai";
import { useRef, useState } from "react";
import { selectedAccountIdAtom } from "@/atoms/SelectedAccount";
import { authClient } from "@/lib/auth-client";

import { getSafeCallback } from "@/utils/safeCallback";

export { getSafeCallback } from "@/utils/safeCallback";

export function useAuth() {
  const router = useRouter();
  const setSelectedAccount = useSetAtom(selectedAccountIdAtom);
  const pending = useRef(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleAuthSuccess = async () => {
    const { data, error } = await authClient.getSession();
    if (error || !data) {
      pending.current = false;
      setLoading(false);
      setError(
        "セッションを確認できませんでした。もう一度ログインしてください",
      );
      return;
    }
    setSelectedAccount(null);
    const callback = getSafeCallback(
      new URLSearchParams(window.location.search).get("callback"),
    );
    router.history.replace(callback ?? "/");
  };

  const handleAuthError = (message?: string) => {
    setError(message || "認証に失敗しました");
    pending.current = false;
    setLoading(false);
  };

  const startAuth = () => {
    if (pending.current) return false;
    pending.current = true;
    setLoading(true);
    setError("");
    return true;
  };

  return {
    loading,
    error,
    setError,
    startAuth,
    handleAuthSuccess,
    handleAuthError,
  };
}
