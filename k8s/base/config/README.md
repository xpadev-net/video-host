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
- `k8s/base/config/vod-nginx-config.sample.yaml` は、base のVOD Deploymentに使うConfigMapテンプレートです。HTTPS/443でlistenし、`nginx` init containerが生成する `/etc/nginx/ssl/tls.crt` と `/etc/nginx/ssl/tls.key` を参照します。base standaloneでは、`minio:9000`を利用できるS3サービスとbackend Serviceを用意してください。
- 通常の本番 Kustomize 経路では `k8s/overlays/prod/kustomization.yaml` が同じ `vod-nginx-config` を生成し、同じディレクトリの `nginx.conf` を読み込みます。設定はKubernetes Service `backend:3000`へマッピングを転送し、VOD init containerが`backend-config`の`S3_ENDPOINT`と`S3_REGION`からpresigned URLのupstreamを設定します。backendはVOD mappingでpresigned URLのpathとqueryを返すため、`S3_FORCE_PATH_STYLE=true`を維持してbucketをURI pathに含めてください。path-styleを無効にする場合はinit containerがbucketをhostnameへ加えます。S3リージョンやendpointを変更するときはbackendとworkerの設定を揃えてください。
- production overlay の`vod-base-url`は`https://your-vod-domain.com`を公開Ingressのoriginへ置き換えます。末尾に`/vod`を付けず、Ingressは`/vod/*`をVOD Serviceの443番portへ転送してください。これはworkerが保存するURLをブラウザーから到達可能にする設定です。

現行の `k8s/base/vod/deployment.yaml` はinit containerで起動時に365日有効な自己署名証明書を生成し、共有 `emptyDir` に配置します。信頼された公開TLS証明書ではなく、Pod再作成後には新しい証明書になります。クライアントがVODへ直接HTTPS接続する本番環境では、証明書の信頼と更新要件に応じて外部管理の証明書へ置き換えてください。nginxの設定も別のinit container処理でConfigMapテンプレートから生成し、`vod-secrets`の`vod-internal-secret`をマッピング用headerへ埋め込みます。

本番 overlay を確認するには、リポジトリルートで `kubectl kustomize k8s/overlays/prod` を実行し、生成された `vod-nginx-config` と `vod` Deployment の設定・証明書マウントを一緒に確認してください。ローカル用 HTTP 設定を本番の HTTPS ConfigMap に置き換えたり、sample ConfigMap を overlay 生成物へ重ねて適用したりしないでください。

本番では`backend-secrets`と`vod-secrets`の`vod-internal-secret`へ同じランダム値を設定してください（例: `openssl rand -hex 32`で生成）。init containerは`vod-secrets`から読み込み、nginx設定へ値を埋め込みます。サンプル値や`CHANGE_ME`のまま本番へ適用しないでください。
