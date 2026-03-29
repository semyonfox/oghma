#!/usr/bin/env bash
# one-time setup: creates EC2 instance for Marker OCR server with Elastic IP
# run from the project root: bash infra/marker/setup.sh
#
# prerequisites:
#   - aws cli configured with appropriate credentials
#   - default VPC exists in the target region
#
# outputs:
#   - MARKER_INSTANCE_ID  — EC2 instance ID (save for start/stop)
#   - MARKER_API_URL      — stable endpoint for the marker server
#
# the instance is stopped after setup — the app starts it on demand
set -euo pipefail

REGION="${AWS_REGION:-eu-north-1}"
INSTANCE_TYPE="${MARKER_INSTANCE_TYPE:-g4dn.xlarge}"
PROJECT="oghmanotes"
KEY_NAME="marker-server-${PROJECT}"

echo "=== Marker OCR Server Setup ==="
echo "Region:   $REGION"
echo "Instance: $INSTANCE_TYPE"
echo ""

# 1. get default VPC
echo "[1/7] Finding default VPC..."
VPC_ID=$(aws ec2 describe-vpcs \
  --filters "Name=isDefault,Values=true" \
  --region "$REGION" \
  --query 'Vpcs[0].VpcId' --output text)

if [ "$VPC_ID" = "None" ] || [ -z "$VPC_ID" ]; then
  echo "ERROR: No default VPC found in $REGION"
  echo "Create one with: aws ec2 create-default-vpc --region $REGION"
  exit 1
fi
echo "  VPC: $VPC_ID"

# pick the first public subnet
SUBNET_ID=$(aws ec2 describe-subnets \
  --filters "Name=vpc-id,Values=$VPC_ID" "Name=default-for-az,Values=true" \
  --region "$REGION" \
  --query 'Subnets[0].SubnetId' --output text)
echo "  Subnet: $SUBNET_ID"

# 2. create security group (idempotent)
echo "[2/7] Creating security group..."
SG_ID=$(aws ec2 describe-security-groups \
  --filters "Name=group-name,Values=marker-server" "Name=vpc-id,Values=$VPC_ID" \
  --region "$REGION" \
  --query 'SecurityGroups[0].GroupId' --output text 2>/dev/null)

if [ "$SG_ID" = "None" ] || [ -z "$SG_ID" ]; then
  SG_ID=$(aws ec2 create-security-group \
    --group-name marker-server \
    --description "Marker OCR server - port 8000" \
    --vpc-id "$VPC_ID" \
    --region "$REGION" \
    --query 'GroupId' --output text)

  aws ec2 authorize-security-group-ingress \
    --group-id "$SG_ID" --protocol tcp --port 8000 --cidr 0.0.0.0/0 \
    --region "$REGION"

  aws ec2 authorize-security-group-ingress \
    --group-id "$SG_ID" --protocol tcp --port 22 --cidr 0.0.0.0/0 \
    --region "$REGION"

  aws ec2 create-tags --resources "$SG_ID" \
    --tags Key=Project,Value=$PROJECT Key=Service,Value=marker \
    --region "$REGION"
fi
echo "  Security Group: $SG_ID"

# 3. create key pair (skip if exists)
echo "[3/7] Setting up key pair..."
if ! aws ec2 describe-key-pairs --key-names "$KEY_NAME" --region "$REGION" &>/dev/null; then
  aws ec2 create-key-pair \
    --key-name "$KEY_NAME" \
    --query 'KeyMaterial' --output text \
    --region "$REGION" > "infra/marker/${KEY_NAME}.pem"
  chmod 400 "infra/marker/${KEY_NAME}.pem"
  echo "  Created: infra/marker/${KEY_NAME}.pem"
  echo "  WARNING: Add ${KEY_NAME}.pem to .gitignore!"
else
  echo "  Key pair already exists: $KEY_NAME"
fi

# 4. get NVIDIA Deep Learning AMI (Amazon Linux 2, drivers pre-installed)
echo "[4/7] Finding NVIDIA Deep Learning AMI..."
AMI_ID=$(aws ec2 describe-images \
  --owners amazon \
  --filters \
    "Name=name,Values=Deep Learning AMI GPU PyTorch*Amazon Linux 2*" \
    "Name=state,Values=available" \
    "Name=architecture,Values=x86_64" \
  --query 'sort_by(Images, &CreationDate)[-1].ImageId' \
  --region "$REGION" --output text)

if [ "$AMI_ID" = "None" ] || [ -z "$AMI_ID" ]; then
  # fallback: any NVIDIA DLAMI
  AMI_ID=$(aws ec2 describe-images \
    --owners amazon \
    --filters \
      "Name=name,Values=Deep Learning Base OSS Nvidia Driver AMI*Amazon Linux 2*" \
      "Name=state,Values=available" \
      "Name=architecture,Values=x86_64" \
    --query 'sort_by(Images, &CreationDate)[-1].ImageId' \
    --region "$REGION" --output text)
fi
echo "  AMI: $AMI_ID (NVIDIA DLAMI)"

# 4b. create SQS extraction retry queue
echo "[4b/7] Creating extraction retry queue..."
RETRY_QUEUE_URL=$(aws sqs create-queue \
  --queue-name "${PROJECT}-extract-retry" \
  --attributes '{"VisibilityTimeout":"300","MessageRetentionPeriod":"86400"}' \
  --tags "Project=$PROJECT,Service=marker" \
  --region "$REGION" \
  --query 'QueueUrl' --output text 2>/dev/null || \
  aws sqs get-queue-url \
    --queue-name "${PROJECT}-extract-retry" \
    --region "$REGION" \
    --query 'QueueUrl' --output text)
echo "  Retry Queue: $RETRY_QUEUE_URL"

# 5. launch instance
echo "[5/7] Launching instance..."
INSTANCE_ID=$(aws ec2 run-instances \
  --image-id "$AMI_ID" \
  --instance-type "$INSTANCE_TYPE" \
  --key-name "$KEY_NAME" \
  --security-group-ids "$SG_ID" \
  --subnet-id "$SUBNET_ID" \
  --associate-public-ip-address \
  --user-data file://infra/marker/userdata.sh \
  --block-device-mappings '[{"DeviceName":"/dev/xvda","Ebs":{"VolumeSize":75,"VolumeType":"gp3"}}]' \
  --tag-specifications \
    "ResourceType=instance,Tags=[{Key=Name,Value=marker-server},{Key=Project,Value=$PROJECT},{Key=Service,Value=marker}]" \
  --region "$REGION" \
  --query 'Instances[0].InstanceId' --output text)
echo "  Instance: $INSTANCE_ID"

# 6. allocate Elastic IP and associate
echo "[6/7] Allocating Elastic IP..."
aws ec2 wait instance-running --instance-ids "$INSTANCE_ID" --region "$REGION"

ALLOC_ID=$(aws ec2 allocate-address \
  --domain vpc \
  --tag-specifications \
    "ResourceType=elastic-ip,Tags=[{Key=Name,Value=marker-server},{Key=Project,Value=$PROJECT}]" \
  --region "$REGION" \
  --query 'AllocationId' --output text)

aws ec2 associate-address \
  --instance-id "$INSTANCE_ID" \
  --allocation-id "$ALLOC_ID" \
  --region "$REGION"

PUBLIC_IP=$(aws ec2 describe-addresses \
  --allocation-ids "$ALLOC_ID" \
  --region "$REGION" \
  --query 'Addresses[0].PublicIp' --output text)
echo "  Elastic IP: $PUBLIC_IP"

# 7. stop instance (app starts it on demand)
echo "[7/7] Stopping instance (will start on demand)..."
aws ec2 stop-instances --instance-ids "$INSTANCE_ID" --region "$REGION" >/dev/null

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Instance ID:  $INSTANCE_ID"
echo "Elastic IP:   $PUBLIC_IP"
echo "Endpoint:     http://$PUBLIC_IP:8000"
echo ""
echo "Add these to your environment:"
echo "  MARKER_EC2_INSTANCE_ID=$INSTANCE_ID"
echo "  MARKER_API_URL=http://$PUBLIC_IP:8000"
echo "  SQS_EXTRACT_RETRY_QUEUE_URL=$RETRY_QUEUE_URL"
echo ""
echo "The instance auto-shuts down after 15 min idle."
echo "The app will auto-start it when imports begin."
echo ""
echo "To switch to CPU-only (cheaper, ~\$0.17/hr but 5-10x slower):"
echo "  MARKER_INSTANCE_TYPE=c6i.xlarge bash infra/marker/setup.sh"
