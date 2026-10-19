#!/bin/sh

set -eu

: "${VOD_INTERNAL_SECRET:?VOD_INTERNAL_SECRET is required}"
: "${BACKEND_MAPPING_UPSTREAM:?BACKEND_MAPPING_UPSTREAM is required}"
: "${LISTEN_PORT:?LISTEN_PORT is required}"
: "${S3_PROD_BUCKET:?S3_PROD_BUCKET is required}"
case "$VOD_INTERNAL_SECRET" in
  *[!A-Za-z0-9_-]*)
    echo "VOD_INTERNAL_SECRET must use only letters, digits, hyphens, and underscores" >&2
    exit 1
    ;;
esac

DNS_RESOLVER="${DNS_RESOLVER:-$(awk '$1 == "nameserver" { print $2; exit }' /etc/resolv.conf)}"
if [ -z "$DNS_RESOLVER" ]; then
  echo "No DNS resolver found" >&2
  exit 1
fi
case "$DNS_RESOLVER" in
  *:*) DNS_RESOLVER="[$DNS_RESOLVER]" ;;
esac

if [ -z "${S3_PROXY_SCHEME:-}" ] || [ -z "${S3_PROXY_HOST:-}" ]; then
  if [ -n "${S3_ENDPOINT:-}" ]; then
    S3_PROXY_SCHEME="${S3_ENDPOINT%%://*}"
    S3_PROXY_HOST="${S3_ENDPOINT#*://}"
    S3_PROXY_HOST="${S3_PROXY_HOST%%/*}"
  else
    S3_PROXY_SCHEME=https
    S3_PROXY_HOST="s3.${S3_REGION:-us-east-1}.amazonaws.com"
  fi
fi

S3_USE_PATH_STYLE="${S3_FORCE_PATH_STYLE:-false}"
S3_BUCKET_HOSTABLE=true
case "$S3_PROD_BUCKET" in
  [a-z0-9]*[a-z0-9]) ;;
  *) S3_BUCKET_HOSTABLE=false ;;
esac
case "$S3_PROD_BUCKET" in
  *[!a-z0-9.-]*|*..*|.*|*.) S3_BUCKET_HOSTABLE=false ;;
esac
if [ "${#S3_PROD_BUCKET}" -gt 63 ]; then
  S3_BUCKET_HOSTABLE=false
fi
case "$S3_PROD_BUCKET" in
  *.*)
    if [ "$S3_PROXY_SCHEME" = https ]; then
      S3_USE_PATH_STYLE=true
    fi
    ;;
esac
if [ "$S3_BUCKET_HOSTABLE" != true ]; then
  S3_USE_PATH_STYLE=true
fi
if [ "$S3_USE_PATH_STYLE" != true ]; then
  S3_PROXY_HOST="${S3_PROD_BUCKET}.${S3_PROXY_HOST}"
fi
S3_SIGNED_HOST="${S3_SIGNED_HOST:-$S3_PROXY_HOST}"
S3_CA_BUNDLE="${S3_CA_BUNDLE:-/etc/nginx/ssl/ca-certificates.crt}"

mkdir -p /etc/nginx/rendered /etc/nginx/ssl
cp /etc/ssl/cert.pem /etc/nginx/ssl/ca-certificates.crt
envsubst '${VOD_INTERNAL_SECRET} ${BACKEND_MAPPING_UPSTREAM} ${LISTEN_PORT} ${DNS_RESOLVER} ${S3_PROXY_SCHEME} ${S3_PROXY_HOST} ${S3_SIGNED_HOST} ${S3_CA_BUNDLE}' \
  < /etc/nginx/template/nginx.conf \
  > /etc/nginx/rendered/nginx.conf
