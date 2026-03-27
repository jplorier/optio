#!/bin/bash
set -e

# Start the Docker daemon in the background.
# This runs inside a K8s user namespace (hostUsers: false) so SYS_ADMIN and
# NET_ADMIN capabilities are scoped to the user namespace — not the host.
echo "[optio-dind] Starting Docker daemon..."
dockerd \
  --host=unix:///var/run/docker.sock \
  --storage-driver=fuse-overlayfs \
  --iptables=true \
  >/var/log/dockerd.log 2>&1 &

# Wait for the Docker daemon to be ready
for i in $(seq 1 30); do
  if docker info >/dev/null 2>&1; then
    echo "[optio-dind] Docker daemon ready"
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "[optio-dind] WARNING: Docker daemon failed to start within 30s"
    echo "[optio-dind] Continuing without Docker — check /var/log/dockerd.log for details"
  fi
  sleep 1
done

# Hand off to the standard repo-init entrypoint
exec /opt/optio/repo-init.sh "$@"
