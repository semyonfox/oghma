#!/usr/bin/env bash
# EC2 user-data for g5.xlarge ASG instances (NVIDIA A10G GPU)
# Minimal server that passes ALB health checks (for infrastructure testing)
set -euo pipefail

exec > /var/log/marker-setup.log 2>&1
echo "[$(date)] Starting marker ASG instance setup (health-check mode)"

# Create minimal health-check server directly
cat > /tmp/marker_server.py <<'PYEOF'
#!/usr/bin/env python3
import http.server
import socketserver
import json

class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"status": "healthy", "service": "marker-ocr-health-check"}).encode())
        else:
            self.send_error(404)

PORT = 8000
with socketserver.TCPServer(("", PORT), Handler) as httpd:
    print(f"[Health Check] Marker server listening on port {PORT}")
    httpd.serve_forever()
PYEOF

# Make executable
chmod +x /tmp/marker_server.py

# Create systemd service
cat > /etc/systemd/system/marker.service <<'SVCEOF'
[Unit]
Description=Marker OCR API Server (Health Check Mode)
After=network.target

[Service]
Type=simple
User=root
ExecStart=/usr/bin/python3 /tmp/marker_server.py
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=marker

[Install]
WantedBy=multi-user.target
SVCEOF

echo "[$(date)] Starting marker service (health-check mode)..."
systemctl daemon-reload
systemctl enable marker
systemctl start marker

# Wait for service
sleep 2

echo "[$(date)] Service started - checking health..."
if curl -s http://localhost:8000/ > /dev/null 2>&1; then
  echo "✓ Marker health-check server responding on port 8000"
else
  echo "✗ Health-check server not responding yet"
fi

echo "[$(date)] Marker ASG instance setup complete (health-check mode)"
echo "Instance status:"
systemctl status marker --no-pager || true
