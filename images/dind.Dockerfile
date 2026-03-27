ARG BASE_IMAGE=optio-base:latest
FROM ${BASE_IMAGE}

USER root

# Docker daemon + CLI + dependencies for rootless DinD
RUN apt-get update && apt-get install -y \
    docker.io \
    iptables \
    fuse-overlayfs \
    && rm -rf /var/lib/apt/lists/*

# Configure Docker for rootless storage with fuse-overlayfs
RUN mkdir -p /etc/docker \
    && echo '{"storage-driver": "fuse-overlayfs"}' > /etc/docker/daemon.json

# Create Docker daemon directories
RUN mkdir -p /var/lib/docker /var/run

# DinD entrypoint wrapper — starts dockerd then hands off to repo-init.sh
COPY images/dind-entrypoint.sh /opt/optio/dind-entrypoint.sh
RUN chmod +x /opt/optio/dind-entrypoint.sh

USER agent
ENV DOCKER_HOST=unix:///var/run/docker.sock

ENTRYPOINT ["/opt/optio/dind-entrypoint.sh"]
