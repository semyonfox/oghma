import importlib.util
import json
import os
import subprocess
import tempfile
import threading
import time
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = Path(__file__).resolve().parents[2]


def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


aws = load_module("marker_aws_session", ROOT / "scripts/marker-aws-session.py")


class MissingSchedule(Exception):
    pass


class Scheduler:
    class exceptions:
        ResourceNotFoundException = MissingSchedule

    def __init__(self):
        self.value = None

    def create_schedule(self, **value):
        self.value = value

    def get_schedule(self, **_kwargs):
        if self.value is None:
            raise MissingSchedule()
        return self.value

    def delete_schedule(self, **_kwargs):
        self.value = None


class Ec2:
    def __init__(self):
        self.terminated = False
        self.launch_request = None

    def describe_instances(self, InstanceIds=None, Filters=None):
        if not InstanceIds:
            return {"Reservations": []}
        return {"Reservations": [{"Instances": [{"InstanceId": InstanceIds[0], "InstanceType": "g4dn.xlarge", "State": {"Name": "running"}, "Tags": [{"Key": "Project", "Value": aws.PROJECT}, {"Key": "BenchmarkRun", "Value": "run-001"}], "MetadataOptions": {"HttpTokens": "required"}, "BlockDeviceMappings": [{"Ebs": {"DeleteOnTermination": True}}], "SecurityGroups": []}]}]}

    def describe_instance_attribute(self, **_kwargs):
        return {"InstanceInitiatedShutdownBehavior": {"Value": "terminate"}}

    def describe_instance_type_offerings(self, **_kwargs):
        return {"InstanceTypeOfferings": [{"InstanceType": "g4dn.xlarge"}]}

    def describe_volumes(self, **_kwargs):
        return {"Volumes": [{"Encrypted": True, "Size": 75}]}

    def run_instances(self, **kwargs):
        self.launch_request = kwargs
        return {"Instances": [{"InstanceId": "i-launched"}]}

    def terminate_instances(self, **_kwargs):
        self.terminated = True

    def get_waiter(self, _name):
        return type("Waiter", (), {"wait": lambda self, **kwargs: None})()


class Session:
    def __init__(self):
        self.ec2 = Ec2()
        self.scheduler = Scheduler()

    def client(self, name, **_kwargs):
        quota = type("Quota", (), {"get_service_quota": lambda self, **kwargs: {"Quota": {"Value": 4}}})()
        return {"ec2": self.ec2, "scheduler": self.scheduler, "service-quotas": quota}[name]


class Args:
    region = "eu-west-1"
    instance_id = "i-test"
    execute = True
    run_label = "run-001"
    receipt = []
    instance_type = "g4dn.xlarge"


class AwsSessionTests(unittest.TestCase):
    def setUp(self):
        self.artifacts = tempfile.TemporaryDirectory()

    def tearDown(self):
        self.artifacts.cleanup()

    def config(self):
        root = Path(self.artifacts.name)
        values = {
            "runTag": "run-001", "schedulerRoleArn": "arn:aws:iam::123456789012:role/deadline",
            "deadlineUtc": (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat(),
            "approvedHourlyRateUsd": 0.5, "maximumHourlyRateUsd": 1.0,
            "approvedHarnessSha256": "a" * 64, "approvedCleanBuildSha256": "b" * 64,
            "approvedDiagnosticBuildSha256": "c" * 64, "amiId": "ami-test",
            "subnetId": "subnet-test", "securityGroupId": "sg-test",
            "instanceProfileArn": "arn:aws:iam::123456789012:instance-profile/test",
            "rootDeviceName": "/dev/sda1", "volumeGiB": 75,
        }
        for name, key, digest in (("harness", "harnessSha256", "a" * 64), ("clean", "archiveSha256", "b" * 64), ("diagnostic", "archiveSha256", "c" * 64)):
            (root / f"{name}.json").write_text(json.dumps({key: digest}))
        values.update({"harnessManifestPath": str(root / "harness.json"), "cleanBuildManifestPath": str(root / "clean.json"), "diagnosticBuildManifestPath": str(root / "diagnostic.json")})
        return values

    def test_private_config_requires_0600(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "operator.json"
            path.write_text(json.dumps({"awsProfile": "test", "expectedAccount": "123456789012", **self.config()}))
            os.chmod(path, 0o644)
            with self.assertRaises(SystemExit):
                aws.load_config(path)
            os.chmod(path, 0o600)
            self.assertEqual(aws.load_config(path)["runTag"], "run-001")

    def test_deadline_is_dry_run_by_default_and_verifiable_when_executed(self):
        session = Session()
        args = Args()
        args.execute = False
        aws.cmd_arm_deadline(args, self.config(), session)
        self.assertIsNone(session.scheduler.value)
        args.execute = True
        aws.cmd_arm_deadline(args, self.config(), session)
        self.assertIn("terminateInstances", session.scheduler.value["Target"]["Arn"])

    def test_launch_is_private_encrypted_and_dry_run_by_default(self):
        session = Session()
        args = Args()
        args.execute = False
        self.assertEqual(aws.cmd_launch(args, self.config(), session), 0)
        self.assertIsNone(session.ec2.launch_request)
        args.execute = True
        self.assertEqual(aws.cmd_launch(args, self.config(), session), 0)
        request = session.ec2.launch_request
        self.assertFalse(request["NetworkInterfaces"][0]["AssociatePublicIpAddress"])
        self.assertTrue(request["BlockDeviceMappings"][0]["Ebs"]["Encrypted"])
        self.assertEqual(request["MetadataOptions"]["HttpTokens"], "required")

    def test_normal_termination_requires_both_valid_receipts(self):
        session = Session()
        args = Args()
        with tempfile.TemporaryDirectory() as temporary:
            paths = []
            for kind in ("metrics", "quality", "restricted"):
                path = Path(temporary) / f"{kind}.json"
                path.write_text(json.dumps({"bundleClass": kind, "runLabel": "run-001", "bundleSha256": "a" * 64, "manifestSha256": "b" * 64}))
                paths.append(str(path))
            args.receipt = paths[:1]
            with self.assertRaises(SystemExit):
                aws.cmd_terminate(args, self.config(), session)
            self.assertFalse(session.ec2.terminated)
            args.receipt = paths
            aws.cmd_terminate(args, self.config(), session)
            self.assertTrue(session.ec2.terminated)


class DownloadPrivacyTests(unittest.TestCase):
    def test_downloader_never_logs_url_or_raw_response_body(self):
        secret = "private-key-123"

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                self.send_response(500)
                self.end_headers()
                self.wfile.write(f"raw failure {secret}".encode())

            def log_message(self, *_args):
                pass

        server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            with tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                url = f"http://127.0.0.1:{server.server_port}/{secret}"
                (root / "urls").write_text(url + "\n")
                result = subprocess.run(
                    ["node", str(ROOT / "scripts/marker-bench-download.mjs"), str(root / "urls"), str(root / "pdfs"), str(root / "downloads.jsonl")],
                    text=True, capture_output=True, check=False,
                )
                combined = result.stdout + result.stderr + (root / "downloads.jsonl").read_text()
                self.assertNotEqual(result.returncode, 0)
                self.assertNotIn(url, combined)
                self.assertNotIn(secret, combined)
                self.assertIn("http_error", combined)
        finally:
            server.shutdown()
            server.server_close()


class TelemetryTests(unittest.TestCase):
    def test_gpu_sample_is_not_silently_null(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            binary = root / "nvidia-smi"
            binary.write_text("#!/usr/bin/env bash\necho 'Synthetic GPU, 75, 40, 1024, 16384, 55, 60, 1500'\n")
            binary.chmod(0o755)
            output = root / "telemetry.jsonl"
            environment = os.environ.copy()
            environment["PATH"] = f"{root}:{environment['PATH']}"
            environment["MARKER_TELEMETRY_INTERVAL_SECONDS"] = "0.05"
            process = subprocess.Popen(["python3", str(ROOT / "scripts/marker-bench-telemetry.py"), str(output)], env=environment)
            try:
                time.sleep(0.2)
            finally:
                process.terminate()
                process.wait(timeout=5)
            rows = [json.loads(line) for line in output.read_text().splitlines()]
            self.assertTrue(rows)
            self.assertEqual(rows[-1]["gpu_util_percent"], 75.0)
            self.assertEqual(rows[-1]["vram_used_mib"], 1024.0)


if __name__ == "__main__":
    unittest.main()
