import "@/styles/global.css";
import "@/styles/nprogress.css";

import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import { SiteName } from "@/contexts/env";
import { Providers } from "@/providers";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: SiteName },
      {
        name: "description",
        content: "自分だけの動画ライブラリを楽しめるメディアサーバー",
      },
    ],
    links: [{ rel: "icon", href: "/favicon.ico" }],
  }),
  notFoundComponent: NotFoundPage,
  errorComponent: ErrorPage,
  pendingComponent: PendingPage,
  component: RootComponent,
  shellComponent: RootDocument,
});

function RootComponent() {
  return <Outlet />;
}

function NotFoundPage() {
  return (
    <main className="mx-auto max-w-2xl p-8 text-center">
      <h1 className="text-2xl font-bold">ページが見つかりません</h1>
      <p className="mt-2">URLをご確認ください。</p>
      <a className="mt-4 inline-block text-primary underline" href="/">
        ホームへ戻る
      </a>
    </main>
  );
}

function ErrorPage() {
  return (
    <main className="mx-auto max-w-2xl p-8 text-center" role="alert">
      <h1 className="text-2xl font-bold">エラーが発生しました</h1>
      <p className="mt-2">ページを再読み込みしてください。</p>
    </main>
  );
}

function PendingPage() {
  return (
    <main className="mx-auto max-w-2xl p-8 text-center" aria-live="polite">
      読み込み中...
    </main>
  );
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <head>
        <script src="/theme-init.js" />
        <HeadContent />
      </head>
      <body>
        <Providers>{children}</Providers>
        <Scripts />
      </body>
    </html>
  );
}
