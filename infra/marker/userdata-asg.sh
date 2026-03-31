#!/usr/bin/env bash
# EC2 user-data for g5.xlarge ASG instances (NVIDIA A10G GPU)
# uses Deep Learning OSS Nvidia Driver AMI GPU PyTorch (Amazon Linux 2023)
# PyTorch + CUDA are pre-installed, just need marker-pdf
set -euo pipefail

exec > /var/log/marker-setup.log 2>&1
echo "[$(date)] Starting marker ASG instance setup (GPU mode)"

# AL2023 PyTorch DLAMI — find the pytorch venv
PYTORCH_PYTHON=""
for candidate in \
    /opt/dlami/nvme/pytorch/bin/python3 \
    /opt/dlami/nvme/pytorch/bin/python \
    /home/ec2-user/anaconda3/envs/pytorch/bin/python3 \
    /home/ec2-user/anaconda3/envs/pytorch/bin/python; do
  if [ -x "$candidate" ]; then
    PYTORCH_PYTHON="$candidate"
    break
  fi
done

# fallback: find any python with torch
if [ -z "$PYTORCH_PYTHON" ]; then
  PYTORCH_PYTHON=$(find /opt /home -name python3 -path "*/pytorch/*" -type f 2>/dev/null | head -1)
fi

if [ -z "$PYTORCH_PYTHON" ]; then
  echo "ERROR: Could not find PyTorch python. Trying system python..."
  PYTORCH_PYTHON=$(which python3)
fi

PYTHON_DIR=$(dirname "$PYTORCH_PYTHON")
echo "Using Python: $PYTORCH_PYTHON"

# install marker-pdf with server dependencies
"$PYTHON_DIR/pip" install --upgrade pip
"$PYTHON_DIR/pip" install "marker-pdf[server]"

# verify GPU
"$PYTORCH_PYTHON" -c "
import torch
print(f'CUDA available: {torch.cuda.is_available()}')
if torch.cuda.is_available():
    print(f'Device: {torch.cuda.get_device_name(0)}')
    print(f'VRAM: {torch.cuda.get_device_properties(0).total_mem / 1024**3:.1f} GB')
"

# create systemd service
cat > /etc/systemd/system/marker.service <<SVCEOF
[Unit]
Description=Marker OCR API Server (GPU - ASG)
After=network.target

[Service]
Type=simple
User=ec2-user
ExecStart=${PYTHON_DIR}/marker_server --port 8000 --host 0.0.0.0
Restart=on-failure
RestartSec=5
Environment=TORCH_DEVICE=cuda

[Install]
WantedBy=multi-user.target
SVCEOF

systemctl daemon-reload
systemctl enable marker
systemctl start marker

# no idle shutdown here — ASG scale-in handles instance lifecycle

echo "[$(date)] Marker ASG instance setup complete (GPU mode)"
