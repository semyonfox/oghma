#!/usr/bin/env bash
# bakes a g4dn.xlarge AMI with marker-pdf pre-installed
# reduces cold start from 4-7 min to ~90 sec (just OS boot + service start, no pip install)
#
# usage: bash infra/marker/bake-ami.sh
# outputs: AMI ID — pass to update-lt-ami.sh or set as MARKER_AMI_ID for setup-asg.sh
set -euo pipefail

REGION="${MARKER_AMI_REGION:-eu-west-1}"
INSTANCE_TYPE="g4dn.xlarge"
PROJECT="oghmanotes"
KEY_NAME="marker-server-${PROJECT}"
AMI_NAME="marker-baked-$(date +%Y%m%d-%H%M)"
PROFILE_NAME="marker-instance-profile-${PROJECT}"

echo "=== Marker AMI Bake ==="
echo "Region:   $REGION"
echo "Instance: $INSTANCE_TYPE"
echo "AMI name: $AMI_NAME"
echo ""

# 1. get default VPC + first subnet
VPC_ID=$(aws ec2 describe-vpcs \
  --filters "Name=isDefault,Values=true" \
  --region "$REGION" \
  --query 'Vpcs[0].VpcId' --output text)

SUBNET_ID=$(aws ec2 describe-subnets \
  --filters "Name=vpc-id,Values=$VPC_ID" "Name=default-for-az,Values=true" \
  --region "$REGION" \
  --query 'Subnets[0].SubnetId' --output text)

# 2. get the Deep Learning AMI (same base as current setup)
BASE_AMI=$(aws ec2 describe-images \
  --owners amazon \
  --filters \
    "Name=name,Values=Deep Learning OSS Nvidia Driver AMI GPU PyTorch*Amazon Linux 2023*" \
    "Name=state,Values=available" \
  --region "$REGION" \
  --query 'Images | sort_by(@, &CreationDate) | [-1].ImageId' \
  --output text)

echo "Base AMI: $BASE_AMI"

# 3. security group (must exist — run setup-asg.sh first)
SG_ID=$(aws ec2 describe-security-groups \
  --filters "Name=group-name,Values=marker-instance-sg" "Name=vpc-id,Values=$VPC_ID" \
  --region "$REGION" \
  --query 'SecurityGroups[0].GroupId' --output text 2>/dev/null || true)

if [ -z "$SG_ID" ] || [ "$SG_ID" = "None" ]; then
  echo "ERROR: marker-instance-sg not found. Run setup-asg.sh first to create the security groups."
  exit 1
fi

# 4. launch bake instance (on-demand)
echo "[1/5] Launching bake instance..."
INSTANCE_ID=$(aws ec2 run-instances \
  --image-id "$BASE_AMI" \
  --instance-type "$INSTANCE_TYPE" \
  --key-name "$KEY_NAME" \
  --security-group-ids "$SG_ID" \
  --subnet-id "$SUBNET_ID" \
  --user-data "file://infra/marker/userdata-asg.sh" \
  --iam-instance-profile "Name=$PROFILE_NAME" \
  --block-device-mappings '[{"DeviceName":"/dev/xvda","Ebs":{"VolumeSize":75,"VolumeType":"gp3"}}]' \
  --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=marker-bake-temp},{Key=Project,Value=$PROJECT}]" \
  --region "$REGION" \
  --query 'Instances[0].InstanceId' --output text)

echo "  Instance: $INSTANCE_ID"

# cleanup trap — always terminate bake instance on exit (including errors)
cleanup() {
  echo ""
  echo "Terminating bake instance $INSTANCE_ID..."
  aws ec2 terminate-instances --instance-ids "$INSTANCE_ID" --region "$REGION" > /dev/null 2>&1 || true
}
trap cleanup EXIT

# 5. wait for instance to be running
echo "[2/5] Waiting for instance to start..."
aws ec2 wait instance-running --instance-ids "$INSTANCE_ID" --region "$REGION"

PUBLIC_IP=$(aws ec2 describe-instances \
  --instance-ids "$INSTANCE_ID" \
  --region "$REGION" \
  --query 'Reservations[0].Instances[0].PublicIpAddress' --output text)
echo "  Running at: $PUBLIC_IP"

# 6. wait for marker service to become healthy (userdata does the full install)
echo "[3/5] Waiting for Marker to become healthy (first install ~5-7 min)..."
DEADLINE=$(( $(date +%s) + 720 ))
LAST_DOT=$(date +%s)
while [ "$(date +%s)" -lt "$DEADLINE" ]; do
  if curl -sf --max-time 5 "http://${PUBLIC_IP}:8000/" > /dev/null 2>&1; then
    echo ""
    echo "  ✓ Marker is healthy!"
    break
  fi
  NOW=$(date +%s)
  if [ $(( NOW - LAST_DOT )) -ge 15 ]; then
    echo "  ... $(( DEADLINE - NOW ))s remaining"
    LAST_DOT=$NOW
  fi
  sleep 5
done

if ! curl -sf --max-time 5 "http://${PUBLIC_IP}:8000/" > /dev/null 2>&1; then
  echo "ERROR: Marker did not become healthy within 12 minutes. Check /var/log/marker-setup.log on instance."
  exit 1
fi

# 7. create AMI snapshot
echo "[4/5] Creating AMI (no-reboot snapshot)..."
AMI_ID=$(aws ec2 create-image \
  --instance-id "$INSTANCE_ID" \
  --name "$AMI_NAME" \
  --description "marker-pdf pre-installed on g4dn.xlarge, ~90s cold start" \
  --no-reboot \
  --tag-specifications "ResourceType=image,Tags=[{Key=Project,Value=$PROJECT},{Key=Service,Value=marker},{Key=BakedAt,Value=$(date -u +%Y-%m-%dT%H:%M:%SZ)}]" \
  --region "$REGION" \
  --query 'ImageId' --output text)

echo "  AMI ID: $AMI_ID"
echo "  Waiting for AMI to be available (usually 2-5 min)..."
aws ec2 wait image-available --image-ids "$AMI_ID" --region "$REGION"
echo "  ✓ AMI ready"

# trap will terminate instance after this
echo "[5/5] Terminating bake instance..."

echo ""
echo "=== AMI Bake Complete ==="
echo ""
echo "AMI ID: $AMI_ID"
echo ""
echo "Update your live launch template:"
echo "  bash infra/marker/update-lt-ami.sh $AMI_ID"
echo ""
echo "Or re-run setup-asg.sh with the baked AMI:"
echo "  MARKER_AMI_ID=$AMI_ID bash infra/marker/setup-asg.sh"
