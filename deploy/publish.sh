#!/usr/bin/env bash
set -euo pipefail
: "${PROD_HOST:?Set prod environment secret PROD_HOST}"
: "${PROD_USER:?Set prod environment secret PROD_USER}"
: "${PROD_SSH_KEY:?Set prod environment secret PROD_SSH_KEY}"
: "${PROD_KNOWN_HOSTS:?Set prod environment secret PROD_KNOWN_HOSTS from a verified host key}"
: "${GITHUB_SHA:?Missing deployment commit}"
[[ "$GITHUB_SHA" =~ ^[0-9a-f]{40}$ ]]
[[ "$PROD_HOST" =~ ^[a-zA-Z0-9][a-zA-Z0-9.-]*$ ]]
[[ "$PROD_USER" =~ ^[a-zA-Z_][a-zA-Z0-9_-]*$ ]]
(cd dist && sha256sum -c SHA256SUMS)
ssh_dir=$(mktemp -d)
trap 'rm -rf "$ssh_dir"' EXIT
chmod 700 "$ssh_dir"
printf '%s\n' "$PROD_SSH_KEY" > "$ssh_dir/key"
printf '%s\n' "$PROD_KNOWN_HOSTS" > "$ssh_dir/known_hosts"
chmod 600 "$ssh_dir/key" "$ssh_dir/known_hosts"
ssh_options=(-i "$ssh_dir/key" -o BatchMode=yes -o StrictHostKeyChecking=yes -o "UserKnownHostsFile=$ssh_dir/known_hosts" -o ConnectTimeout=15)
remote="$PROD_USER@$PROD_HOST"
ssh "${ssh_options[@]}" "$remote" "mkdir -p /opt/quakescope/releases/$GITHUB_SHA"
scp "${ssh_options[@]}" dist/quakescope-linux-amd64.tar.gz dist/SHA256SUMS "$remote:/opt/quakescope/releases/$GITHUB_SHA/"
ssh "${ssh_options[@]}" "$remote" "bash -s -- $GITHUB_SHA" < deploy/activate.sh
