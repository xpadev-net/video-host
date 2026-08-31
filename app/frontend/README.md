# Video Host frontend

自宅メディアサーバー用のフロントエンドです。TanStack Start、React 19、Tailwind CSS で構築し、Hono バックエンドの型付き API クライアントを利用します。

## 開発

リポジトリルートで依存関係とバックエンドの型定義を準備してから起動します。

```shell
pnpm install
pnpm -F @video-host/backend build
pnpm -F @video-host/frontend dev
```

開発サーバーは `http://localhost:3000` で起動します。

## 検証とビルド

```shell
pnpm -F @video-host/frontend lint
pnpm -F @video-host/frontend typecheck
pnpm -F @video-host/frontend build
```

本番ビルドは Nitro のスタンドアロン成果物として `.output` に出力されます。サーバーエントリは `.output/server/index.mjs`、クライアントアセットは `.output/public` です。Node.js 22.12 以上を使用してください。

## 環境変数

公開設定には `VITE_` 接頭辞を使用します。

- `VITE_API_ENDPOINT`（必須）: バックエンド API URL
- `VITE_SITE_NAME`: サイト名
- `VITE_ENABLE_COMMENTS`: コメント表示の有効化
- `VITE_REQUIRE_SIGNUP_CODE`: 登録コード要求の有効化

コンテナではビルド時のプレースホルダーを起動時に `.output/public` 内で置換します。
