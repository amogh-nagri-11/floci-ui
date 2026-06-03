#!/bin/sh
set -eu

AZURE_ENDPOINT="${FLOCI_AZURE_ENDPOINT:-http://floci-az:4577}"
AZURE_ACCOUNT_NAME="${FLOCI_AZURE_ACCOUNT_NAME:-devstoreaccount1}"
GCP_ENDPOINT="${FLOCI_GCP_ENDPOINT:-http://floci-gcp:4588}"
GCP_PROJECT="${FLOCI_GCP_PROJECT:-floci-local}"
FILES_DIR="${FLOCI_SEED_FILES_DIR:-/etc/floci/init/files}"

wait_for() {
    name="$1"
    url="$2"
    attempts=30
    while [ "$attempts" -gt 0 ]; do
        if curl -sS -o /dev/null "$url"; then
            echo "=== $name reachable ==="
            return 0
        fi
        attempts=$((attempts - 1))
        sleep 1
    done
    echo "ERROR: $name is not reachable at $url" >&2
    return 1
}

accept_status() {
    status="$1"
    case "$status" in
        2*|409) return 0 ;;
        *) return 1 ;;
    esac
}

create_azure_container() {
    container="$1"
    status="$(curl -sS -o /dev/null -w '%{http_code}' -X PUT \
        "$AZURE_ENDPOINT/$AZURE_ACCOUNT_NAME/$container?restype=container" \
        -H 'x-ms-version: 2021-12-02')"
    if accept_status "$status"; then
        echo "Azure container ready: $container"
    else
        echo "ERROR: failed to create Azure container $container (HTTP $status)" >&2
        return 1
    fi
}

put_azure_blob() {
    container="$1"
    key="$2"
    file="$3"
    content_type="$4"
    status="$(curl -sS -o /dev/null -w '%{http_code}' -X PUT \
        "$AZURE_ENDPOINT/$AZURE_ACCOUNT_NAME/$container/$key" \
        -H 'x-ms-version: 2021-12-02' \
        -H 'x-ms-blob-type: BlockBlob' \
        -H "Content-Type: $content_type" \
        --data-binary "@$file")"
    if accept_status "$status"; then
        echo "Azure blob uploaded: $container/$key"
    else
        echo "ERROR: failed to upload Azure blob $container/$key (HTTP $status)" >&2
        return 1
    fi
}

create_gcp_bucket() {
    bucket="$1"
    status="$(curl -sS -o /dev/null -w '%{http_code}' -X POST \
        "$GCP_ENDPOINT/storage/v1/b?project=$GCP_PROJECT" \
        -H 'Content-Type: application/json' \
        -d "{\"name\":\"$bucket\"}")"
    if accept_status "$status"; then
        echo "GCP bucket ready: $bucket"
    else
        echo "ERROR: failed to create GCP bucket $bucket (HTTP $status)" >&2
        return 1
    fi
}

put_gcp_object() {
    bucket="$1"
    key="$2"
    file="$3"
    content_type="$4"
    status="$(curl -sS -o /dev/null -w '%{http_code}' -X POST \
        "$GCP_ENDPOINT/upload/storage/v1/b/$bucket/o?uploadType=media&name=$key" \
        -H "Content-Type: $content_type" \
        --data-binary "@$file")"
    if accept_status "$status"; then
        echo "GCP object uploaded: $bucket/$key"
    else
        echo "ERROR: failed to upload GCP object $bucket/$key (HTTP $status)" >&2
        return 1
    fi
}

wait_for "Floci-AZ" "$AZURE_ENDPOINT/$AZURE_ACCOUNT_NAME?comp=list"
wait_for "Floci-GCP" "$GCP_ENDPOINT/storage/v1/b?project=$GCP_PROJECT"

echo "=== Creating Azure containers ==="
create_azure_container azure-app-container
create_azure_container azure-logs-container
create_azure_container azure-static-assets

echo "=== Uploading Azure blobs ==="
put_azure_blob azure-app-container config.json "$FILES_DIR/config.json" application/json
put_azure_blob azure-static-assets index.html "$FILES_DIR/index.html" text/html

echo "=== Creating GCP buckets ==="
create_gcp_bucket gcp-app-bucket
create_gcp_bucket gcp-logs-bucket
create_gcp_bucket gcp-static-assets

echo "=== Uploading GCP objects ==="
put_gcp_object gcp-app-bucket config.json "$FILES_DIR/config.json" application/json
put_gcp_object gcp-static-assets index.html "$FILES_DIR/index.html" text/html

echo "=== Multi-cloud seed done ==="
