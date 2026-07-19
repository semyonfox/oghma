#!/usr/bin/env python3
import json
import os
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

output = Path(sys.argv[1] if len(sys.argv) > 1 else "marker-telemetry.jsonl")
interval = float(os.environ.get("MARKER_TELEMETRY_INTERVAL_SECONDS", "1"))
cpu_only = os.environ.get("MARKER_TELEMETRY_MODE", "gpu") == "cpu"
worker_pids = [
    int(value)
    for value in os.environ.get("MARKER_BENCH_WORKER_PIDS", "").split(",")
    if value.isdigit()
]
output.parent.mkdir(parents=True, exist_ok=True)
output.touch(mode=0o600)


def cpu_times():
    rows = {}
    for line in Path("/proc/stat").read_text().splitlines():
        parts = line.split()
        if not parts or not parts[0].startswith("cpu"):
            continue
        values = [int(x) for x in parts[1:]]
        idle = values[3] + (values[4] if len(values) > 4 else 0)
        rows[parts[0]] = (sum(values), idle)
    return rows


def counters(path):
    if path == "/proc/net/dev":
        rows = Path(path).read_text().splitlines()[2:]
        values = [line.replace(":", " ").split() for line in rows]
        values = [x for x in values if x[0] != "lo"]
        return (sum(int(x[1]) for x in values), sum(int(x[9]) for x in values))
    total_read = total_write = 0
    for line in Path(path).read_text().splitlines():
        values = line.split()
        if len(values) < 14 or values[2].startswith(("loop", "ram")):
            continue
        total_read += int(values[5]) * 512
        total_write += int(values[9]) * 512
    return total_read, total_write


def oom_kill_count():
    for line in Path("/proc/vmstat").read_text().splitlines():
        key, value = line.split()
        if key == "oom_kill":
            return int(value)
    return 0


def gpu_sample():
    if cpu_only:
        return None
    try:
        raw = subprocess.check_output(
            [
                "nvidia-smi",
                "--query-gpu=name,utilization.gpu,utilization.memory,memory.used,memory.total,power.draw,temperature.gpu,clocks.current.sm",
                "--format=csv,noheader,nounits",
            ],
            text=True,
            stderr=subprocess.DEVNULL,
            timeout=max(2, interval),
        ).splitlines()[0]
        return [value.strip() for value in raw.split(",")]
    except (FileNotFoundError, IndexError, subprocess.SubprocessError):
        return None


def marker_process_sample(pids):
    ticks = rss_kib = voluntary = involuntary = 0
    live = 0
    for pid in pids:
        root = Path(f"/proc/{pid}")
        try:
            stat = (root / "stat").read_text().split()
            status = {
                line.split(":", 1)[0]: line.split()[1]
                for line in (root / "status").read_text().splitlines()
                if ":" in line and len(line.split()) > 1
            }
        except (FileNotFoundError, ProcessLookupError, PermissionError):
            continue
        live += 1
        ticks += int(stat[13]) + int(stat[14])
        rss_kib += int(status.get("VmRSS", 0))
        voluntary += int(status.get("voluntary_ctxt_switches", 0))
        involuntary += int(status.get("nonvoluntary_ctxt_switches", 0))
    return {
        "live": live,
        "ticks": ticks,
        "rss_kib": rss_kib,
        "voluntary": voluntary,
        "involuntary": involuntary,
    }


previous_cpu = cpu_times()
previous_net = counters("/proc/net/dev")
previous_disk = counters("/proc/diskstats")
previous_at = time.monotonic()
started_at = previous_at
clock_ticks = os.sysconf("SC_CLK_TCK")
previous_marker = marker_process_sample(worker_pids)
while True:
    time.sleep(interval)
    now = time.monotonic()
    elapsed = now - previous_at
    current_cpu = cpu_times()
    usages = {}
    for name, (total, idle) in current_cpu.items():
        old_total, old_idle = previous_cpu.get(name, (total, idle))
        delta = total - old_total
        usages[name] = 0.0 if delta <= 0 else 100 * (1 - (idle - old_idle) / delta)
    net = counters("/proc/net/dev")
    disk = counters("/proc/diskstats")
    mem = {
        line.split(":", 1)[0]: int(line.split()[1])
        for line in Path("/proc/meminfo").read_text().splitlines()
    }
    gpu = gpu_sample()
    marker = marker_process_sample(worker_pids)
    record = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "elapsed_seconds": round(now - started_at, 3),
        "sample_elapsed_seconds": round(elapsed, 3),
        "cpu_util_percent": round(usages.get("cpu", 0), 2),
        "cpu_core_max_percent": round(max((value for name, value in usages.items() if name != "cpu"), default=0), 2),
        "cpu_cores_over_90_percent": sum(value >= 90 for name, value in usages.items() if name != "cpu"),
        "load1": float(os.getloadavg()[0]),
        "logical_cpus": os.cpu_count(),
        "mem_used_mib": round((mem["MemTotal"] - mem["MemAvailable"]) / 1024, 2),
        "mem_available_mib": round(mem["MemAvailable"] / 1024, 2),
        "mem_total_mib": round(mem["MemTotal"] / 1024, 2),
        "oom_kill_count": oom_kill_count(),
        "network_rx_mib_s": round((net[0] - previous_net[0]) / elapsed / 1048576, 3),
        "network_tx_mib_s": round((net[1] - previous_net[1]) / elapsed / 1048576, 3),
        "disk_read_mib_s": round((disk[0] - previous_disk[0]) / elapsed / 1048576, 3),
        "disk_write_mib_s": round((disk[1] - previous_disk[1]) / elapsed / 1048576, 3),
        "gpu_name": gpu[0] if gpu else None,
        "gpu_util_percent": float(gpu[1]) if gpu else None,
        "gpu_memory_util_percent": float(gpu[2]) if gpu else None,
        "vram_used_mib": float(gpu[3]) if gpu else None,
        "vram_total_mib": float(gpu[4]) if gpu else None,
        "power_watts": None if not gpu or "N/A" in gpu[5] else float(gpu[5]),
        "temperature_c": float(gpu[6]) if gpu else None,
        "gpu_sm_clock_mhz": None if not gpu or "N/A" in gpu[7] else float(gpu[7]),
        "marker_processes": marker["live"],
        "marker_cpu_percent": round(
            max(0, marker["ticks"] - previous_marker["ticks"]) / clock_ticks / elapsed * 100,
            2,
        ),
        "marker_rss_mib": round(marker["rss_kib"] / 1024, 2),
        "marker_voluntary_context_switches_delta": max(
            0, marker["voluntary"] - previous_marker["voluntary"]
        ),
        "marker_involuntary_context_switches_delta": max(
            0, marker["involuntary"] - previous_marker["involuntary"]
        ),
    }
    with output.open("a", encoding="utf-8") as stream:
        stream.write(json.dumps(record, separators=(",", ":")) + "\n")
    previous_cpu = current_cpu
    previous_net = net
    previous_disk = disk
    previous_at = now
    previous_marker = marker
