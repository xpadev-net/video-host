import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { AuthForm, AuthLayout, FormField } from "@/components/Auth";
import { Button } from "@/components/ui/button";
import { ApiEndpoint, SiteName } from "@/contexts/env";
import { getSafeCallback, useAuth } from "@/hooks/useAuth";
import { type AuthConfig, getAuthConfig } from "@/service/getAuthConfig";
import { postAuth } from "@/service/postAuth";

type LoginSearch = { callback?: string; error?: string };

const ssoErrorMessages: Record<string, string> = {
  sso_failed: "SSOログインに失敗しました",
  sso_unavailable: "SSOログインは現在利用できません",
  sso_user_not_found: "このアカウントは登録されていません",
  sso_identity_taken: "このSSOアカウントは既に別のアカウントに連携されています",
};

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): LoginSearch => {
    const callback =
      typeof search.callback === "string"
        ? getSafeCallback(search.callback)
        : null;
    return {
      ...(callback ? { callback } : {}),
      ...(typeof search.error === "string" ? { error: search.error } : {}),
    };
  },
  head: () => ({ meta: [{ title: `ログイン - ${SiteName}` }] }),
  component: LoginRoute,
});

function LoginRoute() {
  const navigate = useNavigate();
  const { callback: callbackSearch, error: ssoError } = Route.useSearch();
  const callback = getSafeCallback(callbackSearch ?? null);
  const {
    loading,
    error,
    setError,
    startAuth,
    handleAuthSuccess,
    handleAuthError,
  } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [initialLoading, setInitialLoading] = useState(true);
  const [authConfig, setAuthConfig] = useState<AuthConfig | null>(null);
  const passwordAuthEnabled = authConfig?.passwordAuthEnabled ?? true;
  const ssoEnabled = authConfig?.ssoEnabled ?? false;

  useEffect(() => {
    void (async () => {
      if (ssoError) {
        setError(ssoErrorMessages[ssoError] ?? "SSOログインに失敗しました");
      } else {
        const token = localStorage.getItem("token");
        if (token && token !== "null" && token.trim() !== "") {
          await navigate({ to: getSafeCallback(callback) ?? "/" });
          return;
        }
      }
      setAuthConfig(await getAuthConfig());
      setInitialLoading(false);
    })();
  }, [callback, navigate, setError, ssoError]);

  const handleSignIn = async (event: React.FormEvent) => {
    event.preventDefault();
    startAuth();
    try {
      const body = await postAuth(username, password);
      if (body.status === "ok") handleAuthSuccess(body.data);
      else handleAuthError("ログインに失敗しました");
    } catch {
      handleAuthError("ネットワークエラーが発生しました");
    }
  };

  const handleSsoLogin = () => {
    const safeCallback = getSafeCallback(callback);
    const query = new URLSearchParams();
    if (safeCallback) query.set("callback", safeCallback);
    const suffix = query.size > 0 ? `?${query.toString()}` : "";
    window.location.assign(`${ApiEndpoint}/api/v4/auth/sso/login${suffix}`);
  };

  if (initialLoading) {
    return (
      <AuthLayout title="ログイン" description="読み込み中...">
        <div className="flex justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="ログイン"
      description={
        passwordAuthEnabled
          ? "アカウントにログインしてください"
          : "SSOでログインしてください"
      }
    >
      {passwordAuthEnabled ? (
        <AuthForm
          onSubmit={handleSignIn}
          submitText="ログイン"
          submitTextLoading="ログイン中..."
          isLoading={loading}
          isDisabled={loading || !username || !password}
          linkText="アカウントをお持ちでない方は"
          linkHref="/register"
          linkLabel="新規登録"
          error={error}
        >
          <FormField
            type="text"
            placeholder="ユーザー名"
            value={username}
            onChange={setUsername}
            disabled={loading}
            required
          />
          <FormField
            type="password"
            placeholder="パスワード"
            value={password}
            onChange={setPassword}
            disabled={loading}
            required
          />
        </AuthForm>
      ) : error ? (
        <div className="p-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md">
          {error}
        </div>
      ) : null}
      {passwordAuthEnabled && ssoEnabled && (
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-card px-2 text-muted-foreground">または</span>
          </div>
        </div>
      )}
      {ssoEnabled && (
        <Button
          type="button"
          variant={passwordAuthEnabled ? "outline" : "default"}
          className="w-full"
          onClick={handleSsoLogin}
          disabled={loading}
        >
          {`${authConfig?.ssoDisplayName ?? "SSO"}でログイン`}
        </Button>
      )}
    </AuthLayout>
  );
}
