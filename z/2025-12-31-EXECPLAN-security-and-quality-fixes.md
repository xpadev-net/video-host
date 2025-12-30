# video-host セキュリティおよびコード品質改善

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document must be maintained in accordance with `.agent/PLANS.md`.


## Purpose / Big Picture

このExecPlanは、video-hostリポジトリのコードレビューで発見されたセキュリティ脆弱性とコード品質の問題を修正します。修正後、以下が実現されます：

1. **本番環境の安全性向上**: デフォルトシークレットが使用されている場合、サーバーが起動を拒否するようになり、本番環境での設定ミスを防止します
2. **認証の堅牢化**: Authorizationヘッダーの解析が厳格になり、不正なトークン形式を拒否します
3. **パス・トラバーサル攻撃の防止**: VODマッピングエンドポイントでS3キーの検証が行われ、不正なパスアクセスを防ぎます
4. **テストによる品質保証**: 認証とセキュリティロジックのユニットテストが追加され、リグレッションを防止します

修正の確認方法：
- 環境変数未設定でサーバーを起動すると、エラーメッセージと共に終了する
- `pnpm test` でテストが全てパスする
- 不正なS3キー（`../`を含む）でVODマッピングにアクセスすると400エラーが返る


## Progress

- [x] (2025-12-31 04:40 JST) Milestone 1: 必須環境変数のバリデーション追加
  - Added `requireEnv` helper function to `app/backend/src/env.ts`
  - Applied to JWT_SECRET, CALLBACK_SECRET, VOD_INTERNAL_SECRET
  - Verified: production mode throws error; development mode uses defaults with warnings
- [x] (2025-12-31 05:15 JST) Milestone 2: Authorizationヘッダー解析の修正
  - Changed `c.req.header().authorization?.replace("Bearer ", "")` to regex-based parsing
  - Final code: `c.req.header("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1]`
  - Uses `\S+` to exclude trailing whitespace (code review feedback)
  - PR #8 merged into master
- [x] (2025-12-31 05:20 JST) Milestone 3: S3キーのパス・トラバーサル対策
  - Added `isValidS3Key` validation function to `app/backend/src/routes/api/v4/vod.ts`
  - Rejects: empty keys, absolute paths (`/`), parent directory references (`..`), null bytes (`\0`)
  - Function exported for unit testing
  - TypeScript compilation passed
- [x] (2025-12-31 05:38 JST) Milestone 4: ユニットテスト基盤の構築
  - Added vitest ^4.0.16 and @vitest/coverage-v8 ^4.0.16 as dev dependencies
  - Created `app/backend/vitest.config.ts` with Node environment and paths alias
  - Added `test`, `test:watch`, `test:coverage` scripts to package.json
  - Created `app/backend/src/__tests__/setup.ts` for test environment setup
- [x] (2025-12-31 05:39 JST) Milestone 5: 認証・セキュリティロジックのテスト追加
  - Exported `requireEnv` function from `app/backend/src/env.ts` for testability
  - Created `app/backend/src/__tests__/env.test.ts` with 5 test cases
  - Created `app/backend/src/__tests__/vod.test.ts` with 7 test cases
  - All 12 tests passing


## Surprises & Discoveries

(実装中に発見した事項をここに記録)


## Decision Log

- Decision: Vitestをテストフレームワークとして採用
  Rationale: pnpmワークスペース対応、TypeScriptネイティブサポート、高速な実行
  Date/Author: 2025-12-31 / Claude


## Outcomes & Retrospective

### 2025-12-31: All Milestones Complete

**成果**:
- 全5マイルストーンが完了
- 12のユニットテストが全てパス
- セキュリティ脆弱性（環境変数デフォルト、Authorization解析、パストラバーサル）が修正済み
- Vitestベースのテスト基盤が整備され、今後のテスト追加が容易に

**追加ファイル**:
- `app/backend/vitest.config.ts`
- `app/backend/src/__tests__/setup.ts`
- `app/backend/src/__tests__/env.test.ts`
- `app/backend/src/__tests__/vod.test.ts`

**学び**:
- Vitestのモジュールキャッシュは`vi.resetModules()`だけでは完全にクリアされない場合がある
- テスト対象の関数はexportしてdirect testingを可能にすることでテストが簡潔になる
- process.envの操作はスプレッド演算子ではなく直接プロパティを設定/削除する必要がある


## Context and Orientation

### リポジトリ構造

video-hostは3つのアプリケーションで構成されるモノレポです：

    video-host/
    ├── app/
    │   ├── frontend/     # Next.js フロントエンド
    │   ├── backend/      # Hono APIサーバー
    │   └── ffmpeg-worker/ # 動画エンコードワーカー
    ├── package.json      # ルートワークスペース設定
    └── pnpm-workspace.yaml

### 用語定義

- **Hono**: 軽量なWebフレームワーク。Expressに似たAPIを持つが、より高速でEdge環境に対応
- **Prisma**: TypeScript向けORMツール。データベーススキーマからTypeScript型を自動生成
- **VODマッピング**: nginx-vod-moduleがS3から動画を取得するためのエンドポイント。S3キーを受け取り、presigned URLを返す
- **presigned URL**: 一時的にS3オブジェクトへのアクセスを許可する署名付きURL

### 対象ファイル

修正対象のファイルは以下の通りです：

1. `app/backend/src/env.ts` - 環境変数の読み込みとバリデーション
2. `app/backend/src/middleware/auth.ts` - JWT認証ミドルウェア
3. `app/backend/src/routes/api/v4/vod.ts` - VODマッピングエンドポイント
4. `app/backend/package.json` - テスト依存関係の追加
5. `app/backend/src/__tests__/` - 新規テストディレクトリ（作成）


## Plan of Work

### Milestone 1: 必須環境変数のバリデーション追加

現在、`app/backend/src/env.ts`ではJWT_SECRET等の重要なシークレットにデフォルト値が設定されています。これにより、本番環境で環境変数が未設定の場合でもサーバーが起動してしまい、セキュリティリスクとなります。

修正内容：
- 必須環境変数が未設定の場合にエラーをスローする`requireEnv`ヘルパー関数を追加
- JWT_SECRET、CALLBACK_SECRET、VOD_INTERNAL_SECRETを必須化
- 開発環境用のデフォルト値は`NODE_ENV=development`の場合のみ許可

`app/backend/src/env.ts`の先頭に以下を追加：

    const requireEnv = (name: string, defaultForDev?: string): string => {
      const value = process.env[name];
      if (value) return value;

      if (process.env.NODE_ENV === "development" && defaultForDev !== undefined) {
        console.warn(`Warning: ${name} not set, using development default`);
        return defaultForDev;
      }

      throw new Error(
        `Required environment variable ${name} is not set. ` +
        `Set it in your environment or use NODE_ENV=development for defaults.`
      );
    };

そして、以下の変数定義を変更：

    // 変更前
    export const JWT_SECRET = process.env.JWT_SECRET || "secret";

    // 変更後
    export const JWT_SECRET = requireEnv("JWT_SECRET", "dev-jwt-secret");

同様にCALLBACK_SECRET、VOD_INTERNAL_SECRETも変更します。


### Milestone 2: Authorizationヘッダー解析の修正

現在の実装では`replace("Bearer ", "")`を使用しており、ヘッダー内のどこにでも"Bearer "があれば置換されてしまいます。

`app/backend/src/middleware/auth.ts`の21行目を修正：

    // 変更前
    const token = c.req.header().authorization?.replace("Bearer ", "");

    // 変更後
    const authHeader = c.req.header("authorization");
    const token = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1];

この正規表現は以下を保証します：
- ヘッダーが"Bearer "で始まること（大文字小文字を区別しない）
- Bearerの後に1つ以上の空白があること
- トークン部分のみを抽出すること


### Milestone 3: S3キーのパス・トラバーサル対策

VODマッピングエンドポイントでは、URLパスからS3キーを抽出していますが、検証が不十分です。攻撃者が`../`を含むパスを送信すると、意図しないS3オブジェクトにアクセスできる可能性があります。

`app/backend/src/routes/api/v4/vod.ts`に検証ロジックを追加：

    // s3Keyの抽出後、以下の検証を追加

    // パス・トラバーサル攻撃の検出
    const isValidS3Key = (key: string): boolean => {
      // 空のキー、絶対パス、親ディレクトリ参照を拒否
      if (!key || key.startsWith("/") || key.includes("..")) {
        return false;
      }
      // NULLバイトインジェクションを拒否
      if (key.includes("\0")) {
        return false;
      }
      return true;
    };

    if (!isValidS3Key(s3Key)) {
      return c.json({ error: "Invalid s3Key" }, 400);
    }


### Milestone 4: ユニットテスト基盤の構築

backendアプリケーションにVitestを導入し、テスト実行環境を整備します。

`app/backend/package.json`に以下を追加：

    "devDependencies": {
      "vitest": "^3.2.0",
      "@vitest/coverage-v8": "^3.2.0"
    },
    "scripts": {
      "test": "vitest run",
      "test:watch": "vitest",
      "test:coverage": "vitest run --coverage"
    }

`app/backend/vitest.config.ts`を作成：

    import { defineConfig } from "vitest/config";
    import { resolve } from "path";

    export default defineConfig({
      test: {
        globals: true,
        environment: "node",
        include: ["src/**/*.test.ts"],
        coverage: {
          provider: "v8",
          reporter: ["text", "json", "html"],
        },
      },
      resolve: {
        alias: {
          "@": resolve(__dirname, "./src"),
        },
      },
    });


### Milestone 5: 認証・セキュリティロジックのテスト追加

`app/backend/src/__tests__/env.test.ts`を作成し、環境変数バリデーションをテスト：

    import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

    describe("requireEnv", () => {
      const originalEnv = process.env;

      beforeEach(() => {
        vi.resetModules();
        process.env = { ...originalEnv };
      });

      afterEach(() => {
        process.env = originalEnv;
      });

      it("should return value when env var is set", async () => {
        process.env.JWT_SECRET = "my-secret";
        const { JWT_SECRET } = await import("../env");
        expect(JWT_SECRET).toBe("my-secret");
      });

      it("should throw when required env var is missing in production", async () => {
        process.env.NODE_ENV = "production";
        delete process.env.JWT_SECRET;
        await expect(import("../env")).rejects.toThrow(/JWT_SECRET/);
      });

      it("should use default in development when env var is missing", async () => {
        process.env.NODE_ENV = "development";
        delete process.env.JWT_SECRET;
        const { JWT_SECRET } = await import("../env");
        expect(JWT_SECRET).toBe("dev-jwt-secret");
      });
    });

`app/backend/src/__tests__/vod.test.ts`を作成し、S3キー検証をテスト：

    import { describe, it, expect } from "vitest";

    // isValidS3Keyをエクスポートする必要あり
    import { isValidS3Key } from "../routes/api/v4/vod";

    describe("isValidS3Key", () => {
      it("should accept valid s3 keys", () => {
        expect(isValidS3Key("uploads/user123/video.mp4")).toBe(true);
        expect(isValidS3Key("videos/2024/01/file.mp4")).toBe(true);
      });

      it("should reject path traversal attempts", () => {
        expect(isValidS3Key("../secret/file")).toBe(false);
        expect(isValidS3Key("uploads/../../../etc/passwd")).toBe(false);
        expect(isValidS3Key("uploads/..%2F..%2Fetc/passwd")).toBe(false);
      });

      it("should reject absolute paths", () => {
        expect(isValidS3Key("/etc/passwd")).toBe(false);
      });

      it("should reject null bytes", () => {
        expect(isValidS3Key("file.mp4\0.txt")).toBe(false);
      });

      it("should reject empty keys", () => {
        expect(isValidS3Key("")).toBe(false);
      });
    });


## Concrete Steps

以下のコマンドは全て `video-host` リポジトリのルートディレクトリから実行します。

### Step 1: 依存関係のインストール

    cd app/backend
    pnpm add -D vitest @vitest/coverage-v8

### Step 2: env.tsの修正

`app/backend/src/env.ts`を編集し、requireEnv関数を追加してシークレット変数に適用します。

### Step 3: auth.tsの修正

`app/backend/src/middleware/auth.ts`の21行目を正規表現ベースの解析に変更します。

### Step 4: vod.tsの修正

`app/backend/src/routes/api/v4/vod.ts`にisValidS3Key関数を追加し、s3Key検証を実装します。

### Step 5: vitest.config.tsの作成

`app/backend/vitest.config.ts`を作成します。

### Step 6: テストファイルの作成

    mkdir -p app/backend/src/__tests__

`app/backend/src/__tests__/env.test.ts`と`app/backend/src/__tests__/vod.test.ts`を作成します。

### Step 7: テストの実行

    cd app/backend
    pnpm test

期待される出力：

    ✓ src/__tests__/env.test.ts (3 tests)
    ✓ src/__tests__/vod.test.ts (5 tests)

    Test Files  2 passed (2)
    Tests       8 passed (8)

### Step 8: 本番モードでの起動テスト

    cd app/backend
    NODE_ENV=production pnpm dev

期待される出力（環境変数未設定の場合）：

    Error: Required environment variable JWT_SECRET is not set. Set it in your environment or use NODE_ENV=development for defaults.

### Step 9: 開発モードでの起動テスト

    cd app/backend
    NODE_ENV=development pnpm dev

期待される出力：

    Warning: JWT_SECRET not set, using development default
    Warning: CALLBACK_SECRET not set, using development default
    Warning: VOD_INTERNAL_SECRET not set, using development default
    Server is running on port 3000


## Validation and Acceptance

### 環境変数バリデーションの検証

1. 本番モード（NODE_ENV=production）で環境変数未設定の場合：
   - サーバーが起動せず、どの環境変数が不足しているか明示するエラーメッセージが表示される

2. 開発モード（NODE_ENV=development）で環境変数未設定の場合：
   - 警告メッセージを出力しつつ、デフォルト値で起動する

### Authorizationヘッダー解析の検証

以下のcurlコマンドで正常系と異常系をテスト：

    # 正常系: Bearer トークン
    curl -H "Authorization: Bearer valid-token" http://localhost:3000/api/v4/movies

    # 異常系: Bearer なし
    curl -H "Authorization: invalid-token" http://localhost:3000/api/v4/movies
    # 期待: 401 Unauthorized

### S3キー検証の検証

    # 正常系
    curl -H "X-Vod-Internal-Secret: $VOD_INTERNAL_SECRET" \
      http://localhost:3000/api/v4/vod/mapping/uploads/user/video.mp4
    # 期待: 200 OK with mapping JSON

    # 異常系: パス・トラバーサル
    curl -H "X-Vod-Internal-Secret: $VOD_INTERNAL_SECRET" \
      http://localhost:3000/api/v4/vod/mapping/../../../etc/passwd
    # 期待: 400 Bad Request with {"error": "Invalid s3Key"}

### テストの検証

    cd app/backend
    pnpm test

全テストがパスすること。


## Idempotence and Recovery

- 全ての変更は既存のコードを置き換えるものであり、何度実行しても同じ結果になります
- テストは何度実行しても同じ結果を返します
- 環境変数の検証は起動時に行われるため、問題があれば即座にフィードバックされます

ロールバック手順：
1. 変更をgit revertまたはgit checkoutで元に戻す
2. `pnpm install`で依存関係を再同期
3. サーバーを再起動


## Artifacts and Notes

（実装中に生成されたログや出力をここに記録）


## Interfaces and Dependencies

### 追加される依存関係

    vitest: ^3.2.0
    @vitest/coverage-v8: ^3.2.0

### 追加される関数・型

`app/backend/src/env.ts`:

    const requireEnv: (name: string, defaultForDev?: string) => string

`app/backend/src/routes/api/v4/vod.ts`:

    export const isValidS3Key: (key: string) => boolean

### 追加されるファイル

    app/backend/vitest.config.ts
    app/backend/src/__tests__/env.test.ts
    app/backend/src/__tests__/vod.test.ts


---
Revision Notes:
- 2025-12-31: 初版作成。コードレビューで発見された5つの主要な問題（デフォルトシークレット、Authorization解析、S3キー検証、テスト欠如）に対する修正計画を策定。
