#!/usr/bin/env sh

set -eu

for bucket in video-tmp video-prod; do
  if ! aws --endpoint-url "$S3_ENDPOINT_URL" s3api head-bucket --bucket "$bucket" >/dev/null 2>&1; then
    aws --endpoint-url "$S3_ENDPOINT_URL" s3api create-bucket --bucket "$bucket"
  fi
done

# Keep abandoned browser uploads bounded in the development object store too.
aws --endpoint-url "$S3_ENDPOINT_URL" s3api put-bucket-lifecycle-configuration \
  --bucket video-tmp \
  --lifecycle-configuration '{"Rules":[{"ID":"expire-temporary-uploads","Status":"Enabled","Filter":{"Prefix":""},"Expiration":{"Days":7}}]}'

# Only the browser upload bucket needs cross-origin PUT access. Never apply
# upload permissions or wildcard origins to the production output bucket.
cors_origin=${CORS_ORIGIN:-http://localhost:3000}
aws --endpoint-url "$S3_ENDPOINT_URL" s3api put-bucket-cors \
  --bucket video-tmp \
  --cors-configuration "CORSRules=[{AllowedOrigins=[$cors_origin],AllowedMethods=[GET,PUT,HEAD],AllowedHeaders=[Content-Type],ExposeHeaders=[ETag],MaxAgeSeconds=3600}]"

echo "S3 buckets video-tmp and video-prod are ready"
