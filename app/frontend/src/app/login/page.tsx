"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { AuthForm, AuthLayout, FormField } from "@/components/Auth";
import { SiteName } from "@/contexts/env";
import { getSafeCallback, useAuth } from "@/hooks/useAuth";
import { postAuth } from "@/service/postAuth";

const LoginPage = () => {
  const router = useRouter();
  const { loading, error, startAuth, handleAuthSuccess, handleAuthError } =
    useAuth();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [initialLoading, setInitialLoading] = useState(true);

  useEffect(() => {
    // Set page title
    document.title = `ログイン - ${SiteName}`;

    void (async () => {
      // Check if already authenticated
      const token = localStorage.getItem("token");
      if (token && token !== "null" && token.trim() !== "") {
        const callback = getSafeCallback(
          new URLSearchParams(window.location.search).get("callback"),
        );
        router.push(callback ?? "/");
        return;
      }
      setInitialLoading(false);
    })();
  }, [router]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
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
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
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
};

export default LoginPage;
