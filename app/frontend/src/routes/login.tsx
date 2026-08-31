import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { AuthForm, AuthLayout, FormField } from "@/components/Auth";
import { SiteName } from "@/contexts/env";
import { getSafeCallback, useAuth } from "@/hooks/useAuth";
import { postAuth } from "@/service/postAuth";

type LoginSearch = {
  callback?: string;
};

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): LoginSearch => {
    const callback =
      typeof search.callback === "string"
        ? getSafeCallback(search.callback)
        : null;
    return callback ? { callback } : {};
  },
  head: () => ({ meta: [{ title: `ログイン - ${SiteName}` }] }),
  component: LoginRoute,
});

function LoginRoute() {
  const navigate = useNavigate();
  const { callback: callbackSearch } = Route.useSearch();
  const callback = getSafeCallback(callbackSearch ?? null);
  const { loading, error, startAuth, handleAuthSuccess, handleAuthError } =
    useAuth();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [initialLoading, setInitialLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token && token !== "null" && token.trim() !== "") {
      void navigate({ to: callback ?? "/" });
      return;
    }
    setInitialLoading(false);
  }, [callback, navigate]);

  const handleSignIn = async (event: React.FormEvent) => {
    event.preventDefault();
    startAuth();

    try {
      const body = await postAuth(username, password);
      if (body.status === "ok") {
        handleAuthSuccess(body.data);
      } else {
        handleAuthError("ログインに失敗しました");
      }
    } catch {
      handleAuthError("ネットワークエラーが発生しました");
    }
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
    <AuthLayout title="ログイン" description="アカウントにログインしてください">
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
    </AuthLayout>
  );
}
