#!/usr/bin/env bash
set -euo pipefail

DEADLINE_UTC=${1:?usage: benchmark-userdata.sh DEADLINE_UTC}
if (( EUID != 0 )); then
  echo "deadline setup must run as root" >&2
  exit 2
fi
deadline_epoch=$(date -u -d "$DEADLINE_UTC" +%s)
(( deadline_epoch > $(date -u +%s) + 900 )) || { echo "deadline must be at least 15 minutes ahead" >&2; exit 3; }
on_calendar=$(date -u -d "@$deadline_epoch" '+%Y-%m-%d %H:%M:%S UTC')
install -m 0644 /dev/stdin /etc/systemd/system/oghma-marker-deadline.service <<'UNIT'
[Unit]
Description=Terminate the temporary Oghma Marker benchmark instance
[Service]
Type=oneshot
ExecStart=/usr/sbin/shutdown -h now
UNIT
install -m 0644 /dev/stdin /etc/systemd/system/oghma-marker-deadline.timer <<UNIT
[Unit]
Description=Absolute Oghma Marker benchmark deadline
[Timer]
OnCalendar=$on_calendar
Persistent=true
AccuracySec=1s
Unit=oghma-marker-deadline.service
[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload
systemctl enable --now oghma-marker-deadline.timer
systemctl show oghma-marker-deadline.timer --property=ActiveState,NextElapseUSecRealtime --no-pager
