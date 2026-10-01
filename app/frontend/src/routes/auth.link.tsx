import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import { AuthLayout } from "@/components/Auth";
import { getSafeCallback } from "@/hooks/useAuth";
import { client } from "@/lib/client";

export const Route = createFileRoute("/auth/link")({
  component: AuthLinkRoute,
});

function AuthLinkRoute() {
  const router = useRouter();
  const confirmationStarted = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (confirmationStarted.current) return;
    confirmationStarted.current = true;
    const hash = window.location.hash.replace(/^#/, "");
    const params = hash
      ? new URLSearchParams(hash)
      : new URLSearchParams(window.location.search);
    const token = params.get("token");
    const callback = getSafeCallback(params.get("callback")) ?? "/dashboard";
    if (!token) {
      setError("SSO連携トークンが見つかりません");
      return;
    }
    void (async () => {
      try {
        const response = await client.api.v4.auth.sso.link.confirm.$post({
          json: { token },
        });
        if (response.ok) {
          router.history.replace(getSafeCallback(callback) ?? "/dashboard");
          return;
        }
      } catch {
        // Network and API errors share the same user-facing recovery message.
      }
      setError("SSO連携に失敗しました。もう一度やり直してください");
    })();
  }, [router]);

  return (
    <AuthLayout title="SSO連携" description="アカウントを連携しています...">
      {error ? (
        <p className="text-center text-sm text-red-500">{error}</p>
      ) : (
        <div className="flex justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      )}
    </AuthLayout>
  );
}
