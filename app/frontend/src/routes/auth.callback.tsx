import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useSetAtom } from "jotai";
import { useEffect } from "react";

import { AuthTokenAtom } from "@/atoms/Auth";
import { AuthLayout } from "@/components/Auth";
import { getSafeCallback } from "@/hooks/useAuth";

export const Route = createFileRoute("/auth/callback")({
  component: AuthCallbackRoute,
});

function AuthCallbackRoute() {
  const router = useRouter();
  const setAuthToken = useSetAtom(AuthTokenAtom);

  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, "");
    const params = hash
      ? new URLSearchParams(hash)
      : new URLSearchParams(window.location.search);
    const token = params.get("token");
    if (!token) {
      const error = params.get("error") ?? "sso_failed";
      router.history.replace(`/login?error=${encodeURIComponent(error)}`);
      return;
    }
    setAuthToken(token);
    router.history.replace(getSafeCallback(params.get("callback")) ?? "/");
  }, [router, setAuthToken]);

  return (
    <AuthLayout title="SSOログイン" description="ログイン処理中です...">
      <div className="flex justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    </AuthLayout>
  );
}
