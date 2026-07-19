#!/usr/bin/env python3
"""Fail-closed lifecycle guards for one temporary Marker GPU benchmark."""
import argparse
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path

import boto3

PROJECT = "oghma-marker-benchmark"
CANDIDATES = {"eu-west-1": {"g4dn.xlarge": 4, "g5.xlarge": 4}, "eu-west-2": {"g6.xlarge": 4}}
SAFE = re.compile(r"^[A-Za-z0-9._-]+$")


def load_config(path):
    path = Path(path)
    if path.stat().st_mode & 0o077:
        raise SystemExit("operator config must have mode 0600")
    value = json.loads(path.read_text(encoding="utf-8"))
    required = ("awsProfile", "expectedAccount", "runTag", "schedulerRoleArn", "deadlineUtc")
    if any(not isinstance(value.get(key), str) or not value[key] for key in required):
        raise SystemExit("operator config is incomplete")
    if not re.fullmatch(r"[0-9]{12}", value["expectedAccount"]) or not SAFE.fullmatch(value["runTag"]):
        raise SystemExit("operator config account or run tag is invalid")
    deadline = datetime.fromisoformat(value["deadlineUtc"].replace("Z", "+00:00"))
    if deadline.tzinfo is None or deadline <= datetime.now(timezone.utc):
        raise SystemExit("operator deadline must be an absolute future time")
    return value


def session_and_identity(config):
    session = boto3.Session(profile_name=config["awsProfile"])
    identity = session.client("sts").get_caller_identity()
    root_allowed = config.get("allowRootOperator") is True
    if identity["Account"] != config["expectedAccount"] or (identity["Arn"].endswith(":root") and not root_allowed):
        raise SystemExit("refusing unexpected account or root credentials")
    return session


def instance(session, region, instance_id):
    reservations = session.client("ec2", region_name=region).describe_instances(InstanceIds=[instance_id])["Reservations"]
    if len(reservations) != 1 or len(reservations[0]["Instances"]) != 1:
        raise SystemExit("refusing ambiguous instance lookup")
    return reservations[0]["Instances"][0]


def tags(item):
    return {tag["Key"]: tag["Value"] for tag in item.get("Tags", [])}


def approved_artifacts(config):
    checks = (
        ("harnessManifestPath", "harnessSha256", "approvedHarnessSha256"),
        ("cleanBuildManifestPath", "archiveSha256", "approvedCleanBuildSha256"),
        ("diagnosticBuildManifestPath", "archiveSha256", "approvedDiagnosticBuildSha256"),
    )
    for path_key, manifest_key, approved_key in checks:
        path = config.get(path_key)
        if not isinstance(path, str) or not Path(path).is_file():
            return False
        try:
            manifest = json.loads(Path(path).read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return False
        if manifest.get(manifest_key) != config.get(approved_key):
            return False
    return True


def matching_instance(item, config):
    mapped = tags(item)
    flags = [m.get("Ebs", {}).get("DeleteOnTermination", False) for m in item.get("BlockDeviceMappings", []) if "Ebs" in m]
    return mapped.get("Project") == PROJECT and mapped.get("BenchmarkRun") == config["runTag"] and bool(flags) and all(flags)


def cmd_preflight(args, config, session):
    if args.instance_type not in CANDIDATES.get(args.region, {}):
        raise SystemExit("selected instance is not in the benchmark matrix")
    ec2 = session.client("ec2", region_name=args.region)
    quota = session.client("service-quotas", region_name=args.region).get_service_quota(ServiceCode="ec2", QuotaCode="L-DB2E81BA")["Quota"]["Value"]
    offered = {x["InstanceType"] for x in ec2.describe_instance_type_offerings(LocationType="region", Filters=[{"Name": "instance-type", "Values": [args.instance_type]}])["InstanceTypeOfferings"]}
    active = ec2.describe_instances(Filters=[{"Name": "instance-state-name", "Values": ["pending", "running", "stopping", "stopped"]}, {"Name": "instance-type", "Values": list(CANDIDATES[args.region])}])["Reservations"]
    reused = ec2.describe_instances(Filters=[{"Name": "tag:BenchmarkRun", "Values": [config["runTag"]]}])["Reservations"]
    count = sum(len(row["Instances"]) for row in active)
    reused_count = sum(len(row["Instances"]) for row in reused)
    price_ok = isinstance(config.get("approvedHourlyRateUsd"), (int, float)) and isinstance(config.get("maximumHourlyRateUsd"), (int, float)) and 0 < config["approvedHourlyRateUsd"] <= config["maximumHourlyRateUsd"]
    builds_ok = approved_artifacts(config)
    healthy = args.instance_type in offered and quota >= CANDIDATES[args.region][args.instance_type] and count == 0 and reused_count == 0 and price_ok and builds_ok
    print(json.dumps({"offered": args.instance_type in offered, "quotaSufficient": quota >= CANDIDATES[args.region][args.instance_type], "conflictingGpuInstances": count, "reusedRunTagInstances": reused_count, "priceApproved": price_ok, "buildsApproved": builds_ok, "healthy": healthy}, indent=2))
    return 0 if healthy else 2


def launch_config(config):
    required = ("amiId", "subnetId", "securityGroupId", "instanceProfileArn", "rootDeviceName")
    if any(not isinstance(config.get(key), str) or not config[key] for key in required):
        raise SystemExit("operator config is missing launch fields")
    if not isinstance(config.get("volumeGiB"), int) or config["volumeGiB"] < 75:
        raise SystemExit("operator config volumeGiB must be at least 75")


def render_userdata(config):
    source = (Path(__file__).resolve().parents[1] / "infra/marker/benchmark-userdata.sh").read_text(encoding="utf-8")
    assignment = "MARKER_BENCH_DEADLINE_UTC=" + json.dumps(config["deadlineUtc"]) + "\nset -- \"$MARKER_BENCH_DEADLINE_UTC\"\n"
    return source.replace("set -euo pipefail\n", "set -euo pipefail\n" + assignment, 1)


def cmd_launch(args, config, session):
    launch_config(config)
    if cmd_preflight(args, config, session) != 0:
        raise SystemExit("launch preflight failed")
    request = {
        "ImageId": config["amiId"],
        "InstanceType": args.instance_type,
        "MinCount": 1,
        "MaxCount": 1,
        "IamInstanceProfile": {"Arn": config["instanceProfileArn"]},
        "MetadataOptions": {"HttpTokens": "required", "HttpEndpoint": "enabled"},
        "InstanceInitiatedShutdownBehavior": "terminate",
        "NetworkInterfaces": [{"DeviceIndex": 0, "SubnetId": config["subnetId"], "Groups": [config["securityGroupId"]], "AssociatePublicIpAddress": False, "DeleteOnTermination": True}],
        "BlockDeviceMappings": [{"DeviceName": config["rootDeviceName"], "Ebs": {"VolumeSize": config["volumeGiB"], "VolumeType": "gp3", "Encrypted": True, "DeleteOnTermination": True}}],
        "TagSpecifications": [
            {"ResourceType": kind, "Tags": [{"Key": "Project", "Value": PROJECT}, {"Key": "BenchmarkRun", "Value": config["runTag"]}]}
            for kind in ("instance", "volume")
        ],
        "UserData": render_userdata(config),
    }
    if not args.execute:
        print(json.dumps({"execute": False, "instanceType": args.instance_type, "region": args.region, "privateNetworking": True, "encryptedVolumeGiB": config["volumeGiB"], "deadlineUtc": config["deadlineUtc"]}, indent=2))
        return 0
    response = session.client("ec2", region_name=args.region).run_instances(**request)
    instances = response.get("Instances", [])
    if len(instances) != 1:
        raise SystemExit("launch did not return exactly one instance")
    print(json.dumps({"execute": True, "launched": True, "instanceId": instances[0]["InstanceId"]}, indent=2))
    return 0


def cmd_postlaunch(args, config, session):
    ec2 = session.client("ec2", region_name=args.region)
    item = instance(session, args.region, args.instance_id)
    ingress = sum((ec2.describe_security_groups(GroupIds=[g["GroupId"]])["SecurityGroups"][0].get("IpPermissions", []) for g in item.get("SecurityGroups", [])), [])
    managed = session.client("ssm", region_name=args.region).describe_instance_information(Filters=[{"Key": "InstanceIds", "Values": [args.instance_id]}]).get("InstanceInformationList", [])
    volume_ids = [mapping.get("Ebs", {}).get("VolumeId") for mapping in item.get("BlockDeviceMappings", []) if mapping.get("Ebs", {}).get("VolumeId")]
    volumes = ec2.describe_volumes(VolumeIds=volume_ids).get("Volumes", []) if volume_ids else []
    checks = {
        "stateRunning": item["State"]["Name"] == "running", "instanceTypeMatches": item["InstanceType"] == args.instance_type,
        "amiMatches": item.get("ImageId") == config.get("amiId"),
        "subnetMatches": item.get("SubnetId") == config.get("subnetId"),
        "securityGroupMatches": {group.get("GroupId") for group in item.get("SecurityGroups", [])} == {config.get("securityGroupId")},
        "instanceProfileMatches": item.get("IamInstanceProfile", {}).get("Arn") == config.get("instanceProfileArn"),
        "identityAndVolumes": matching_instance(item, config), "noPublicIp": not item.get("PublicIpAddress"),
        "imdsv2Required": item.get("MetadataOptions", {}).get("HttpTokens") == "required", "noIngressRules": not ingress,
        "ssmOnline": any(x.get("PingStatus") == "Online" for x in managed),
        "volumesEncrypted": bool(volumes) and all(volume.get("Encrypted") for volume in volumes),
        "volumeSizeApproved": bool(volumes) and all(volume.get("Size") == config.get("volumeGiB") for volume in volumes),
        "shutdownTerminates": ec2.describe_instance_attribute(InstanceId=args.instance_id, Attribute="instanceInitiatedShutdownBehavior")["InstanceInitiatedShutdownBehavior"]["Value"] == "terminate",
    }
    healthy = all(checks.values())
    print(json.dumps({"checks": checks, "healthy": healthy}, indent=2))
    return 0 if healthy else 2


def scheduler_name(config):
    return f"oghma-marker-{config['runTag']}"


def cmd_arm_deadline(args, config, session):
    client = session.client("scheduler", region_name=args.region)
    payload = json.dumps({"InstanceIds": [args.instance_id]}, separators=(",", ":"))
    expression = "at(" + datetime.fromisoformat(config["deadlineUtc"].replace("Z", "+00:00")).astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S") + ")"
    request = {"Name": scheduler_name(config), "ScheduleExpression": expression, "FlexibleTimeWindow": {"Mode": "OFF"}, "ActionAfterCompletion": "DELETE", "Target": {"Arn": "arn:aws:scheduler:::aws-sdk:ec2:terminateInstances", "RoleArn": config["schedulerRoleArn"], "Input": payload}, "Description": f"Emergency deadline for {PROJECT}"}
    if args.execute:
        client.create_schedule(**request)
        actual = client.get_schedule(Name=request["Name"])
        actual_target = actual.get("Target", {})
        if (
            actual.get("ScheduleExpression") != expression
            or actual.get("State", "ENABLED") != "ENABLED"
            or actual_target.get("Input") != payload
            or actual_target.get("Arn") != request["Target"]["Arn"]
            or actual_target.get("RoleArn") != config["schedulerRoleArn"]
        ):
            raise SystemExit("scheduler verification failed")
    print(json.dumps({"name": request["Name"], "deadlineUtc": config["deadlineUtc"], "execute": args.execute}, indent=2))
    return 0


def load_receipts(paths, run_label):
    values = [json.loads(Path(path).read_text(encoding="utf-8")) for path in paths]
    if {x.get("bundleClass") for x in values} != {"metrics", "quality", "restricted"} or {x.get("runLabel") for x in values} != {run_label}:
        raise SystemExit("matching metrics, quality, and restricted homelab receipts are required")
    if any(not re.fullmatch(r"[0-9a-f]{64}", str(x.get("bundleSha256", ""))) or not re.fullmatch(r"[0-9a-f]{64}", str(x.get("manifestSha256", ""))) for x in values):
        raise SystemExit("invalid homelab receipt")
    return values


def cmd_terminate(args, config, session):
    item = instance(session, args.region, args.instance_id)
    if not matching_instance(item, config):
        raise SystemExit("instance identity or delete-on-termination check failed")
    receipts = load_receipts(args.receipt, args.run_label) if args.execute else []
    print(json.dumps({"state": item["State"]["Name"], "homelabReceipts": sorted(x["bundleClass"] for x in receipts), "execute": args.execute}, indent=2))
    if not args.execute:
        return 0
    ec2 = session.client("ec2", region_name=args.region)
    ec2.terminate_instances(InstanceIds=[args.instance_id])
    ec2.get_waiter("instance_terminated").wait(InstanceIds=[args.instance_id], WaiterConfig={"Delay": 10, "MaxAttempts": 60})
    scheduler = session.client("scheduler", region_name=args.region)
    try:
        scheduler.delete_schedule(Name=scheduler_name(config))
    except scheduler.exceptions.ResourceNotFoundException:
        pass
    return 0


def cmd_audit(args, config, session):
    report, leftovers = {}, 0
    filters = [{"Name": "tag:Project", "Values": [PROJECT]}, {"Name": "tag:BenchmarkRun", "Values": [config["runTag"]]}]
    for region in args.region or list(CANDIDATES):
        ec2 = session.client("ec2", region_name=region)
        reservations = ec2.describe_instances(Filters=filters)["Reservations"]
        instances = [x for row in reservations for x in row["Instances"] if x["State"]["Name"] != "terminated"]
        groups = {"activeInstances": instances, "volumes": ec2.describe_volumes(Filters=filters)["Volumes"], "networkInterfaces": ec2.describe_network_interfaces(Filters=filters)["NetworkInterfaces"], "addresses": ec2.describe_addresses(Filters=filters)["Addresses"], "securityGroups": ec2.describe_security_groups(Filters=filters)["SecurityGroups"], "images": ec2.describe_images(Owners=["self"], Filters=filters)["Images"], "snapshots": ec2.describe_snapshots(OwnerIds=["self"], Filters=filters)["Snapshots"]}
        report[region] = {key: len(value) for key, value in groups.items()}
        leftovers += sum(report[region].values())
    try:
        session.client("scheduler", region_name=(args.region or list(CANDIDATES))[0]).get_schedule(Name=scheduler_name(config))
        report["scheduler"] = 1
        leftovers += 1
    except session.client("scheduler", region_name=(args.region or list(CANDIDATES))[0]).exceptions.ResourceNotFoundException:
        report["scheduler"] = 0
    print(json.dumps({"regions": report, "leftovers": leftovers, "healthy": leftovers == 0}, indent=2))
    return 0 if leftovers == 0 else 2


def parser():
    root = argparse.ArgumentParser()
    root.add_argument("--config", required=True)
    commands = root.add_subparsers(dest="command", required=True)
    p = commands.add_parser("preflight"); p.add_argument("--region", required=True); p.add_argument("--instance-type", required=True)
    p = commands.add_parser("launch"); p.add_argument("--region", required=True); p.add_argument("--instance-type", required=True); p.add_argument("--execute", action="store_true")
    p = commands.add_parser("postlaunch"); p.add_argument("instance_id"); p.add_argument("--region", required=True); p.add_argument("--instance-type", required=True)
    p = commands.add_parser("arm-deadline"); p.add_argument("instance_id"); p.add_argument("--region", required=True); p.add_argument("--execute", action="store_true")
    p = commands.add_parser("terminate"); p.add_argument("instance_id"); p.add_argument("--region", required=True); p.add_argument("--run-label", required=True); p.add_argument("--receipt", action="append", default=[]); p.add_argument("--execute", action="store_true")
    p = commands.add_parser("audit"); p.add_argument("--region", action="append", default=[])
    return root


def main():
    args = parser().parse_args()
    config = load_config(args.config)
    session = session_and_identity(config)
    return globals()[f"cmd_{args.command.replace('-', '_')}"](args, config, session)


if __name__ == "__main__":
    raise SystemExit(main())
