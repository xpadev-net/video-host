# ConfigMap/Secret サンプル

このディレクトリには、デプロイに必要な ConfigMap と Secret のサンプルファイルが含まれています。

## 使用方法

1. サンプルファイルをコピーして実際の値を設定:
   ```bash
   cp backend-config.sample.yaml backend-config.yaml
   cp backend-secrets.sample.yaml backend-secrets.yaml
   # 他のファイルも同様
   ```

2. 各ファイルを編集して環境に合わせた値を設定

3. Kubernetes に適用:
   ```bash
   kubectl apply -f backend-config.yaml -n video-host
   kubectl apply -f backend-secrets.yaml -n video-host
   # 他のファイルも同様
   ```

> **注意**: Secret の値は Base64 エンコードが必要です
> ```bash
> echo -n 'your-secret-value' | base64
> ```

## VOD 用 nginx 設定

- `nginx/nginx.conf` はローカルの `docker-compose.yml` が `./nginx` ディレクトリごとコンテナへマウントする HTTP 設定です。ローカル開発用で、Kubernetes には適用しません。
- `k8s/base/config/vod-nginx-config.sample.yaml` は、base マニフェストを独自に適用する場合の ConfigMap テンプレートです。環境の VOD 内部シークレットや S3 アドレスに合わせて編集してください。
- 通常の本番 Kustomize 経路では `k8s/overlays/prod/kustomization.yaml` が同じ `vod-nginx-config` を生成し、同じディレクトリの `nginx.conf` を読み込みます。この設定は HTTPS を listen し、`/etc/nginx/ssl/tls.crt` と `/etc/nginx/ssl/tls.key` を参照します。

現行の `k8s/base/vod/deployment.yaml` はinit containerで起動時に365日有効な自己署名証明書を生成し、共有 `emptyDir` に配置します。信頼された公開TLS証明書ではなく、Pod再作成後には新しい証明書になります。クライアントがVODへ直接HTTPS接続する本番環境では、証明書の信頼と更新要件に応じて外部管理の証明書へ置き換えてください。

本番 overlay を確認するには、リポジトリルートで `kubectl kustomize k8s/overlays/prod` を実行し、生成された `vod-nginx-config` と `vod` Deployment の設定・証明書マウントを一緒に確認してください。ローカル用 HTTP 設定を本番の HTTPS ConfigMap に置き換えたり、sample ConfigMap を overlay 生成物へ重ねて適用したりしないでください。
