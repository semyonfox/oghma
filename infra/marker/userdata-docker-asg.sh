#!/usr/bin/env bash
# EC2 user-data for g5.xlarge ASG instances (NVIDIA A10G GPU) using Docker
# Uses pre-built marker-ocr Docker image from ECR for instant startup (no 15-min pip install)
set -euo pipefail

exec > /var/log/marker-docker-setup.log 2>&1
echo "[$(date)] Starting marker Docker ASG instance setup (GPU mode)"

# Get AWS account ID and region
AWS_ACCOUNT_ID=$(ec2-metadata --account-id | cut -d " " -f 2)
AWS_REGION=$(ec2-metadata --availability-zone | sed 's/[a-z]$//')

# ECR image details
ECR_REGISTRY="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
ECR_REPO="marker-ocr"
ECR_IMAGE_TAG="latest"
FULL_IMAGE="${ECR_REGISTRY}/${ECR_REPO}:${ECR_IMAGE_TAG}"

echo "ECR Image: $FULL_IMAGE"

# Install Docker (if not already installed by AMI)
if ! command -v docker &> /dev/null; then
  echo "Installing Docker..."
  yum update -y
  yum install -y docker
  systemctl start docker
  systemctl enable docker
else
  echo "Docker already installed"
  docker --version
fi

# Install nvidia-container-runtime for GPU support
echo "Installing NVIDIA container runtime..."
yum install -y nvidia-container-runtime

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

# Log in to ECR
echo "Logging in to ECR..."
aws ecr get-login-password --region "${AWS_REGION}" | \
  docker login --username AWS --password-stdin "${ECR_REGISTRY}"

# Pull marker image from ECR
echo "Pulling marker image from ECR..."
docker pull "${FULL_IMAGE}" || {
  echo "ERROR: Failed to pull image from ECR. Image may not exist yet."
  exit 1
}

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
  --log-driver awslogs \
  --log-opt awslogs-group=/aws/ec2/marker-server \
  --log-opt awslogs-region="${AWS_REGION}" \
  --log-opt awslogs-stream="instance-$(ec2-metadata --instance-id | cut -d' ' -f2)" \
  "${FULL_IMAGE}"

# Wait for container to be ready
echo "Waiting for marker service to be ready..."
for i in {1..30}; do
  if curl -s -f http://localhost:8000/ > /dev/null; then
    echo "✓ Marker service is healthy!"
    break
  fi
  echo "Attempt $i/30: Service not ready yet, waiting..."
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

# Create CloudWatch log group for container logs (if it doesn't exist)
aws logs create-log-group --log-group-name /aws/ec2/marker-server --region "${AWS_REGION}" || true

echo "[$(date)] Marker Docker ASG instance setup complete (GPU mode)"
echo "Container status:"
docker ps -f name=marker-server
