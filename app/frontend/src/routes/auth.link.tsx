import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AuthLayout } from "@/components/Auth";
import { authClient } from "@/lib/auth-client";
import { getAuthConfig } from "@/service/getAuthConfig";

export const Route = createFileRoute("/auth/link")({
  component: AuthLinkRoute,
});

function AuthLinkRoute() {
  const [status, setStatus] = useState<"loading" | "success" | "error">(
    "loading",
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (new URLSearchParams(window.location.search).has("error")) {
        setStatus("error");
        return;
      }
      try {
        const [session, config] = await Promise.all([
          authClient.getSession(),
          getAuthConfig(),
        ]);
        if (
          !session.data ||
          !config?.accountLinkingEnabled ||
          !config.ssoProviderId
        ) {
          if (!cancelled) setStatus("error");
          return;
        }
        const accounts = await authClient.listAccounts();
        if (cancelled) return;
        setStatus(
          accounts.data?.some(
            (account) => account.providerId === config.ssoProviderId,
          )
            ? "success"
            : "error",
        );
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <AuthLayout
      title="SSO連携"
      description={
        status === "loading"
          ? "連携結果を確認しています..."
          : status === "success"
            ? "SSOアカウントを連携しました"
            : "SSO連携に失敗しました"
      }
    >
      {status === "error" && (
        <p role="alert">
          同じメールアドレスの認証済みSSOアカウントで、ダッシュボードからもう一度お試しください。
        </p>
      )}
      {status !== "loading" && (
        <Link
          to="/dashboard"
          className="text-center text-primary hover:underline"
        >
          ダッシュボードに戻る
        </Link>
      )}
    </AuthLayout>
  );
}
