#!/usr/bin/env sh

set -eu

for bucket in video-tmp video-prod; do
  if ! aws --endpoint-url "$S3_ENDPOINT_URL" s3api head-bucket --bucket "$bucket" >/dev/null 2>&1; then
    aws --endpoint-url "$S3_ENDPOINT_URL" s3api create-bucket --bucket "$bucket"
  fi
done

echo "S3 buckets video-tmp and video-prod are ready"
