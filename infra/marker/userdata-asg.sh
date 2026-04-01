#!/usr/bin/env bash
# EC2 user-data for g5.xlarge ASG instances (NVIDIA A10G GPU)
# Simplified: use system Python, avoid conda complexity
set -euo pipefail

exec > /var/log/marker-setup.log 2>&1
echo "[$(date)] Starting marker ASG instance setup"

# Use system Python 3
PYTHON3=$(which python3)
echo "Using Python: $PYTHON3"
$PYTHON3 --version

# Ensure pip is available
$PYTHON3 -m ensurepip --upgrade

# Install marker-pdf + server dependencies
echo "Installing marker-pdf and server dependencies..."
$PYTHON3 -m pip install --upgrade pip setuptools wheel
$PYTHON3 -m pip install -q "marker-pdf>=0.6.0"
$PYTHON3 -m pip install -q fastapi uvicorn python-multipart pydantic pydantic-settings

# Verify marker_server is in PATH
echo "Looking for marker_server..."
if ! command -v marker_server &> /dev/null; then
  echo "ERROR: marker_server not found in PATH"
  echo "Attempting to find it..."
  find / -name marker_server -type f 2>/dev/null | head -5 || true
  exit 1
fi

echo "✓ marker_server found: $(which marker_server)"
marker_server --help 2>&1 | head -3

# Verify GPU
echo "GPU verification:"
$PYTHON3 -c "
import torch
print(f'CUDA available: {torch.cuda.is_available()}')
if torch.cuda.is_available():
    print(f'GPU: {torch.cuda.get_device_name(0)}')
    print(f'Memory: {torch.cuda.get_device_properties(0).total_memory / 1024**3:.1f} GB')
" || echo "GPU check failed (may be expected)"

# Create systemd service
cat > /etc/systemd/system/marker.service <<'SVCEOF'
[Unit]
Description=Marker OCR API Server (GPU)
After=network.target

[Service]
Type=simple
User=root
ExecStart=/usr/bin/python3 -m marker.scripts.server:server_cli --port 8000 --host 0.0.0.0
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=marker

[Install]
WantedBy=multi-user.target
SVCEOF

systemctl daemon-reload
systemctl enable marker
systemctl start marker

echo "[$(date)] Service started"
echo "Marker service status:"
systemctl status marker --no-pager || true

# Wait a bit for service to stabilize
sleep 5

# Quick health check
echo "Quick health check:"
if curl -s http://localhost:8000/ > /dev/null; then
  echo "✓ Marker responding on port 8000"
else
  echo "✗ Marker not responding yet (this is OK, may still be initializing)"
fi

echo "[$(date)] Marker ASG instance setup complete"
