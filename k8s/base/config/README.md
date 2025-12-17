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
