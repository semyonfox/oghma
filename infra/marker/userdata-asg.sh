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
echo "Python dir: $PYTHON_DIR"

PIP_BIN=""
if [ -x "$PYTHON_DIR/pip" ]; then
  PIP_BIN="$PYTHON_DIR/pip"
elif [ -x "$PYTHON_DIR/pip3" ]; then
  PIP_BIN="$PYTHON_DIR/pip3"
fi

# install marker-pdf with server dependencies
echo "Installing marker-pdf with server extra..."
if [ -n "$PIP_BIN" ]; then
  "$PIP_BIN" install --upgrade pip setuptools wheel
  "$PIP_BIN" install "marker-pdf[server]"
else
  "$PYTORCH_PYTHON" -m ensurepip --upgrade || true
  "$PYTORCH_PYTHON" -m pip install --upgrade pip setuptools wheel
  "$PYTORCH_PYTHON" -m pip install "marker-pdf[server]"
fi

# check if marker_server command is installed
MARKER_SERVER_BIN=""
if [ -x "$PYTHON_DIR/marker_server" ]; then
  MARKER_SERVER_BIN="$PYTHON_DIR/marker_server"
  echo "Found marker_server at: $MARKER_SERVER_BIN"
elif command -v marker_server &> /dev/null; then
  MARKER_SERVER_BIN="$(which marker_server)"
  echo "Found marker_server in PATH: $MARKER_SERVER_BIN"
else
  echo "WARNING: marker_server not found, will try python -m marker"
  MARKER_SERVER_BIN=""
fi

NVIDIA_LIB_PATHS=(
  "/usr/local/lib/python3.9/site-packages/nvidia/cudnn/lib"
  "/usr/local/lib/python3.9/site-packages/nvidia/cublas/lib"
  "/usr/local/lib/python3.9/site-packages/nvidia/cuda_runtime/lib"
  "/usr/local/lib/python3.9/site-packages/nvidia/cuda_nvrtc/lib"
  "/usr/local/lib/python3.9/site-packages/nvidia/cuda_cupti/lib"
  "/usr/local/lib/python3.9/site-packages/nvidia/cufft/lib"
  "/usr/local/lib/python3.9/site-packages/nvidia/curand/lib"
  "/usr/local/lib/python3.9/site-packages/nvidia/cusolver/lib"
  "/usr/local/lib/python3.9/site-packages/nvidia/cusparse/lib"
  "/usr/local/lib/python3.9/site-packages/nvidia/cusparselt/lib"
  "/usr/local/lib/python3.9/site-packages/nvidia/nccl/lib"
  "/usr/local/lib/python3.9/site-packages/nvidia/nvjitlink/lib"
)

LD_LIBRARY_PATH_VALUE=""
for p in "${NVIDIA_LIB_PATHS[@]}"; do
  if [ -d "$p" ]; then
    if [ -z "$LD_LIBRARY_PATH_VALUE" ]; then
      LD_LIBRARY_PATH_VALUE="$p"
    else
      LD_LIBRARY_PATH_VALUE="$LD_LIBRARY_PATH_VALUE:$p"
    fi
  fi
done

export LD_LIBRARY_PATH="$LD_LIBRARY_PATH_VALUE:${LD_LIBRARY_PATH:-}"

# verify GPU
echo "GPU verification:"
"$PYTORCH_PYTHON" -c "
import torch
print(f'CUDA available: {torch.cuda.is_available()}')
if torch.cuda.is_available():
    print(f'Device: {torch.cuda.get_device_name(0)}')
    print(f'VRAM: {torch.cuda.get_device_properties(0).total_memory / 1024**3:.1f} GB')
" || true

# create systemd service with fallback command
cat > /etc/systemd/system/marker.service <<SVCEOF
[Unit]
Description=Marker OCR API Server (GPU - ASG)
After=network.target

[Service]
Type=simple
User=ec2-user
ExecStart=/bin/bash -c "export LD_LIBRARY_PATH='${LD_LIBRARY_PATH_VALUE}'; exec ${MARKER_SERVER_BIN:-$PYTORCH_PYTHON -m marker.server} --port 8000 --host 0.0.0.0"
Restart=on-failure
RestartSec=10
Environment=TORCH_DEVICE=cuda
StandardOutput=journal
StandardError=journal
SyslogIdentifier=marker-server

[Install]
WantedBy=multi-user.target
SVCEOF

systemctl daemon-reload
systemctl enable marker
systemctl start marker

# log service status
echo "Marker service status:"
systemctl status marker --no-pager || true

# no idle shutdown here — ASG scale-in handles instance lifecycle

echo "[$(date)] Marker ASG instance setup complete (GPU mode)"
