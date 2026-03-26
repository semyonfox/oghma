#!/usr/bin/env bash
# EC2 user-data for g4dn.xlarge with NVIDIA DLAMI
# DLAMI already has NVIDIA drivers, CUDA, and PyTorch pre-installed
# just need to install marker-pdf and run the server
set -euo pipefail

exec > /var/log/marker-setup.log 2>&1
echo "[$(date)] Starting marker setup (GPU mode)"

# DLAMI uses conda — activate pytorch env and install marker
source /home/ec2-user/anaconda3/etc/profile.d/conda.sh
conda activate pytorch

pip install --upgrade pip
pip install "marker-pdf[server]"

# verify GPU is available
python -c "import torch; print(f'CUDA available: {torch.cuda.is_available()}, device: {torch.cuda.get_device_name(0) if torch.cuda.is_available() else \"none\"}')"

# create systemd service (runs as ec2-user for conda access)
cat > /etc/systemd/system/marker.service <<'EOF'
[Unit]
Description=Marker OCR API Server (GPU)
After=network.target

[Service]
Type=simple
User=ec2-user
ExecStart=/bin/bash -lc 'source /home/ec2-user/anaconda3/etc/profile.d/conda.sh && conda activate pytorch && marker_server --port 8000 --host 0.0.0.0'
Restart=on-failure
RestartSec=5
Environment=TORCH_DEVICE=cuda

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable marker
systemctl start marker

# idle auto-shutdown: if no requests for 15 min, stop the instance
cat > /usr/local/bin/marker-idle-check.sh <<'IDLE'
#!/usr/bin/env bash
LAST_ACTIVITY=$(journalctl -u marker --since "15 min ago" --no-pager -q 2>/dev/null | grep -cE "POST|GET" || echo "0")
if [ "$LAST_ACTIVITY" -eq 0 ]; then
    echo "[$(date)] Marker idle for 15 min, shutting down instance"
    systemctl stop marker
    shutdown -h now
fi
IDLE
chmod +x /usr/local/bin/marker-idle-check.sh

# run idle check every 5 minutes, starting 15 min after boot
cat > /etc/systemd/system/marker-idle.timer <<'EOF'
[Unit]
Description=Check if Marker is idle and shutdown

[Timer]
OnBootSec=15min
OnUnitActiveSec=5min
Persistent=true

[Install]
WantedBy=timers.target
EOF

cat > /etc/systemd/system/marker-idle.service <<'EOF'
[Unit]
Description=Marker idle shutdown check

[Service]
Type=oneshot
ExecStart=/usr/local/bin/marker-idle-check.sh
EOF

systemctl daemon-reload
systemctl enable marker-idle.timer
systemctl start marker-idle.timer

echo "[$(date)] Marker setup complete (GPU mode)"
