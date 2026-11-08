#!/usr/bin/env bash
set -euo pipefail
revision=${1:?Missing deployment commit}
[[ "$revision" =~ ^[0-9a-f]{40}$ ]]
cd /opt/quakescope
# Also serialize activation across different runner sessions.
exec 9>deploy.lock
flock -w 300 9
release="/opt/quakescope/releases/$revision"
(cd "$release" && sha256sum -c SHA256SUMS && tar -xzf quakescope-linux-amd64.tar.gz)
chmod 755 "$release/quakescope"
previous=$(readlink -f current || true)
switch_to() {
  ln -sfn "$1" current.next
  mv -Tf current.next current
  sudo -n systemctl restart quakescope
}
healthy() {
  for attempt in {1..15}; do
    if curl --fail --silent --max-time 3 http://127.0.0.1:8081/api/v1/health > /dev/null; then return 0; fi
    sleep 2
  done
  return 1
}
if switch_to "$release" && healthy; then
  echo "Activated $revision"
else
  echo 'Deployment failed; restoring previous release' >&2
  if [[ -n "$previous" && -d "$previous" ]]; then
    switch_to "$previous"
    healthy || echo 'Previous release also failed health checks' >&2
  else
    rm -f current
    sudo -n systemctl stop quakescope
  fi
  exit 1
fi
