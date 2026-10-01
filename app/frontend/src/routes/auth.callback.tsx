import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useSetAtom } from "jotai";
import { useEffect } from "react";
import { selectedAccountIdAtom } from "@/atoms/SelectedAccount";
import { AuthLayout } from "@/components/Auth";
import { getSafeCallback } from "@/hooks/useAuth";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/auth/callback")({
  component: AuthCallbackRoute,
});

function AuthCallbackRoute() {
  const router = useRouter();
  const setSelectedAccount = useSetAtom(selectedAccountIdAtom);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams(window.location.search);
    const callback = getSafeCallback(params.get("callback")) ?? "/";
    void (async () => {
      try {
        const { data, error } = await authClient.getSession();
        if (cancelled) return;
        if (data && !error) {
          setSelectedAccount(null);
          router.history.replace(callback);
          return;
        }
      } catch {
        if (cancelled) return;
      }
      router.history.replace(
        `/login?error=sso_failed&callback=${encodeURIComponent(callback)}`,
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [router, setSelectedAccount]);

  return (
    <AuthLayout title="SSOログイン" description="ログイン処理中です...">
      <div className="flex justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    </AuthLayout>
  );
}
