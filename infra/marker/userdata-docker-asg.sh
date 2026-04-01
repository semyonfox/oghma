#!/usr/bin/env bash
# EC2 user-data for g5.xlarge ASG instances (NVIDIA A10G GPU) using Docker
# Builds marker-ocr Docker image on-instance (better network access) and runs it
set -euo pipefail

exec > /var/log/marker-docker-setup.log 2>&1
echo "[$(date)] Starting marker Docker ASG instance setup (GPU mode - on-instance build)"

# Get AWS account ID and region
AWS_ACCOUNT_ID=$(ec2-metadata --account-id | cut -d " " -f 2)
AWS_REGION=$(ec2-metadata --availability-zone | sed 's/[a-z]$//')

# Docker image details
DOCKER_IMAGE="marker-ocr:latest"

echo "Docker Image: $DOCKER_IMAGE"

# Install Docker (if not already installed by AMI)
if ! command -v docker &> /dev/null; then
  echo "Installing Docker..."
  yum update -y
  yum install -y docker git
  systemctl start docker
  systemctl enable docker
else
  echo "Docker already installed"
  docker --version
fi

# Install nvidia-container-runtime for GPU support
echo "Installing NVIDIA container runtime..."
yum install -y nvidia-container-runtime || echo "NVIDIA runtime installation may have issues (continue anyway)"

# Configure Docker daemon to use NVIDIA runtime by default
mkdir -p /etc/docker
cat > /etc/docker/daemon.json <<EOF
{
  "runtimes": {
    "nvidia": {
      "path": "nvidia-container-runtime",
      "runtimeArgs": []
    }
  },
  "default-runtime": "nvidia"
}
EOF

systemctl daemon-reload
systemctl restart docker

# Clone repo to get Dockerfile
echo "Cloning oghmanotes repo to build Docker image..."
cd /tmp
rm -rf oghmanotes || true
git clone --depth 1 https://github.com/semyonfox/oghmanotes.git || {
  echo "ERROR: Failed to clone repo"
  exit 1
}

cd oghmanotes

# Build marker image locally
echo "Building marker Docker image on instance..."
docker build -f Dockerfile.marker -t "${DOCKER_IMAGE}" . || {
  echo "ERROR: Docker build failed"
  exit 1
}

echo "✓ Docker image built successfully"

# Stop any existing marker container
echo "Stopping existing marker container (if any)..."
docker stop marker-server || true
docker rm marker-server || true

# Run marker container with GPU support
echo "Starting marker container with GPU support..."
docker run \
  --name marker-server \
  --restart always \
  --gpus all \
  -p 8000:8000 \
  -e TORCH_DEVICE=cuda \
  -e CUDA_VISIBLE_DEVICES=0 \
  -v /tmp:/tmp \
  "${DOCKER_IMAGE}"

# Wait for container to be ready
echo "Waiting for marker service to be ready..."
for i in {1..60}; do
  if curl -s -f http://localhost:8000/ > /dev/null; then
    echo "✓ Marker service is healthy!"
    break
  fi
  echo "Attempt $i/60: Service not ready yet, waiting..."
  sleep 2
done

# Verify GPU is available in container
echo "Verifying GPU availability in container..."
docker exec marker-server python3 -c "
import torch
print(f'CUDA available: {torch.cuda.is_available()}')
if torch.cuda.is_available():
    print(f'Device: {torch.cuda.get_device_name(0)}')
    print(f'VRAM: {torch.cuda.get_device_properties(0).total_memory / 1024**3:.1f} GB')
" || echo "GPU verification failed (may be expected if still initializing)"

echo "[$(date)] Marker Docker ASG instance setup complete (GPU mode)"
echo "Container status:"
docker ps -f name=marker-server
