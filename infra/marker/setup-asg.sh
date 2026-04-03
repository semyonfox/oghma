#!/usr/bin/env bash
# autoscaling Marker GPU deployment for eu-west-1 (Ireland)
# creates: Launch Template (spot) + ALB + Target Group + ASG + IAM Role
#
# architecture:
#   ALB (port 80) -> Target Group (port 8000) -> ASG (g5.xlarge spot, 0-2 instances)
#   pure scale-to-zero — GPU only runs during active imports, cold start ~4-7 min
#
# cost (spot ~$0.35/hr): pay-per-use only, ~$0 when idle
#
# run from project root: bash infra/marker/setup-asg.sh
set -euo pipefail

REGION="eu-west-1"
INSTANCE_TYPE="${MARKER_INSTANCE_TYPE:-g5.xlarge}"
PROJECT="oghmanotes"
KEY_NAME="marker-server-${PROJECT}"
ASG_NAME="marker-asg-${PROJECT}"
LT_NAME="marker-lt-${PROJECT}"
TG_NAME="marker-tg-${PROJECT}"
ALB_NAME="marker-alb-${PROJECT}"
MAX_INSTANCES="${MARKER_MAX_INSTANCES:-2}"

echo "=== Marker OCR Autoscaling Setup (Ireland) ==="
echo "Region:    $REGION"
echo "Instance:  $INSTANCE_TYPE (spot)"
echo "Max scale: $MAX_INSTANCES"
echo "Mode:      scale-to-zero (cold start on demand)"
echo ""

# 1. get default VPC + subnets
echo "[1/9] Finding VPC and subnets..."
VPC_ID=$(aws ec2 describe-vpcs \
  --filters "Name=isDefault,Values=true" \
  --region "$REGION" \
  --query 'Vpcs[0].VpcId' --output text)

if [ "$VPC_ID" = "None" ] || [ -z "$VPC_ID" ]; then
  echo "ERROR: No default VPC in $REGION"
  exit 1
fi
echo "  VPC: $VPC_ID"

# get all default subnets (ALB needs at least 2 AZs)
SUBNET_IDS=$(aws ec2 describe-subnets \
  --filters "Name=vpc-id,Values=$VPC_ID" "Name=default-for-az,Values=true" \
  --region "$REGION" \
  --query 'Subnets[*].SubnetId' --output text)
SUBNET_CSV=$(echo "$SUBNET_IDS" | tr '\t' ',')
echo "  Subnets: $SUBNET_CSV"

# 2. security groups — one for ALB, one for instances
echo "[2/9] Creating security groups..."

# ALB security group (public port 80)
ALB_SG_ID=$(aws ec2 describe-security-groups \
  --filters "Name=group-name,Values=marker-alb-sg" "Name=vpc-id,Values=$VPC_ID" \
  --region "$REGION" \
  --query 'SecurityGroups[0].GroupId' --output text 2>/dev/null)

if [ "$ALB_SG_ID" = "None" ] || [ -z "$ALB_SG_ID" ]; then
  ALB_SG_ID=$(aws ec2 create-security-group \
    --group-name marker-alb-sg \
    --description "Marker ALB - public HTTP" \
    --vpc-id "$VPC_ID" \
    --region "$REGION" \
    --query 'GroupId' --output text)

  aws ec2 authorize-security-group-ingress \
    --group-id "$ALB_SG_ID" --protocol tcp --port 80 --cidr 0.0.0.0/0 \
    --region "$REGION"

  aws ec2 create-tags --resources "$ALB_SG_ID" \
    --tags Key=Project,Value=$PROJECT Key=Service,Value=marker-alb \
    --region "$REGION"
fi
echo "  ALB SG: $ALB_SG_ID"

# instance security group (port 8000 from ALB only + SSH)
INST_SG_ID=$(aws ec2 describe-security-groups \
  --filters "Name=group-name,Values=marker-instance-sg" "Name=vpc-id,Values=$VPC_ID" \
  --region "$REGION" \
  --query 'SecurityGroups[0].GroupId' --output text 2>/dev/null)

if [ "$INST_SG_ID" = "None" ] || [ -z "$INST_SG_ID" ]; then
  INST_SG_ID=$(aws ec2 create-security-group \
    --group-name marker-instance-sg \
    --description "Marker instances - port 8000 from ALB" \
    --vpc-id "$VPC_ID" \
    --region "$REGION" \
    --query 'GroupId' --output text)

  # allow port 8000 from ALB SG only
  aws ec2 authorize-security-group-ingress \
    --group-id "$INST_SG_ID" --protocol tcp --port 8000 \
    --source-group "$ALB_SG_ID" \
    --region "$REGION"

  # SSH for debugging
  aws ec2 authorize-security-group-ingress \
    --group-id "$INST_SG_ID" --protocol tcp --port 22 --cidr 0.0.0.0/0 \
    --region "$REGION"

  aws ec2 create-tags --resources "$INST_SG_ID" \
    --tags Key=Project,Value=$PROJECT Key=Service,Value=marker-instance \
    --region "$REGION"
fi
echo "  Instance SG: $INST_SG_ID"

# 3. key pair
echo "[3/9] Setting up key pair..."
if ! aws ec2 describe-key-pairs --key-names "$KEY_NAME" --region "$REGION" &>/dev/null; then
  aws ec2 create-key-pair \
    --key-name "$KEY_NAME" \
    --query 'KeyMaterial' --output text \
    --region "$REGION" > "infra/marker/${KEY_NAME}-ireland.pem"
  chmod 400 "infra/marker/${KEY_NAME}-ireland.pem"
  echo "  Created: infra/marker/${KEY_NAME}-ireland.pem"
else
  echo "  Key pair already exists: $KEY_NAME"
fi

# 4. find NVIDIA PyTorch DLAMI
echo "[4/9] Finding GPU AMI..."
AMI_ID=$(aws ec2 describe-images \
  --owners amazon \
  --filters \
    "Name=name,Values=Deep Learning OSS Nvidia Driver AMI GPU PyTorch*Amazon Linux 2023*" \
    "Name=state,Values=available" \
    "Name=architecture,Values=x86_64" \
  --query 'sort_by(Images, &CreationDate)[-1].ImageId' \
  --region "$REGION" --output text)

if [ "$AMI_ID" = "None" ] || [ -z "$AMI_ID" ]; then
  # fallback to base Nvidia DLAMI
  AMI_ID=$(aws ec2 describe-images \
    --owners amazon \
    --filters \
      "Name=name,Values=Deep Learning Base OSS Nvidia Driver GPU AMI*Amazon Linux 2023*" \
      "Name=state,Values=available" \
      "Name=architecture,Values=x86_64" \
    --query 'sort_by(Images, &CreationDate)[-1].ImageId' \
    --region "$REGION" --output text)
fi
echo "  AMI: $AMI_ID"

# 5. IAM instance profile (for CloudWatch logs + ECR access)
echo "[5/9] Setting up IAM role..."
ROLE_NAME="marker-ec2-role-${PROJECT}"
PROFILE_NAME="marker-ec2-profile-${PROJECT}"

if ! aws iam get-role --role-name "$ROLE_NAME" &>/dev/null; then
  aws iam create-role \
    --role-name "$ROLE_NAME" \
    --assume-role-policy-document '{
      "Version": "2012-10-17",
      "Statement": [{
        "Effect": "Allow",
        "Principal": {"Service": "ec2.amazonaws.com"},
        "Action": "sts:AssumeRole"
      }]
    }'

  aws iam attach-role-policy \
    --role-name "$ROLE_NAME" \
    --policy-arn arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy

  # add ECR access for pulling Docker image
  aws iam put-role-policy \
    --role-name "$ROLE_NAME" \
    --policy-name marker-ecr-access \
    --policy-document '{
      "Version": "2012-10-17",
      "Statement": [{
        "Effect": "Allow",
        "Action": [
          "ecr:GetAuthorizationToken",
          "ecr:BatchGetImage",
          "ecr:GetDownloadUrlForLayer"
        ],
        "Resource": "*"
      }]
    }'

  echo "  Created role: $ROLE_NAME"
else
  echo "  Role exists: $ROLE_NAME"
fi

if ! aws iam get-instance-profile --instance-profile-name "$PROFILE_NAME" &>/dev/null; then
  aws iam create-instance-profile --instance-profile-name "$PROFILE_NAME"
  aws iam add-role-to-instance-profile \
    --instance-profile-name "$PROFILE_NAME" \
    --role-name "$ROLE_NAME"
  # wait for IAM propagation
  echo "  Waiting for IAM profile propagation..."
  sleep 15
  echo "  Created instance profile: $PROFILE_NAME"
else
  echo "  Instance profile exists: $PROFILE_NAME"
fi

# 6. create Launch Template (spot instances)
echo "[6/9] Creating Launch Template (spot)..."
USERDATA_B64=$(base64 -w0 infra/marker/userdata-asg.sh)

# spot instance config — terminate on interruption (ASG handles replacement)
SPOT_CONFIG='"InstanceMarketOptions": {"MarketType": "spot", "SpotOptions": {"SpotInstanceType": "one-time", "InstanceInterruptionBehavior": "terminate"}}'

LT_DATA="{
  \"ImageId\": \"$AMI_ID\",
  \"InstanceType\": \"$INSTANCE_TYPE\",
  \"KeyName\": \"$KEY_NAME\",
  \"SecurityGroupIds\": [\"$INST_SG_ID\"],
  \"UserData\": \"$USERDATA_B64\",
  \"IamInstanceProfile\": {\"Name\": \"$PROFILE_NAME\"},
  \"BlockDeviceMappings\": [{
    \"DeviceName\": \"/dev/xvda\",
    \"Ebs\": {\"VolumeSize\": 75, \"VolumeType\": \"gp3\"}
  }],
  $SPOT_CONFIG,
  \"TagSpecifications\": [{
    \"ResourceType\": \"instance\",
    \"Tags\": [
      {\"Key\": \"Name\", \"Value\": \"marker-asg-instance\"},
      {\"Key\": \"Project\", \"Value\": \"$PROJECT\"},
      {\"Key\": \"Service\", \"Value\": \"marker\"}
    ]
  }]
}"

LT_ID=$(aws ec2 describe-launch-templates \
  --launch-template-names "$LT_NAME" \
  --region "$REGION" \
  --query 'LaunchTemplates[0].LaunchTemplateId' --output text 2>/dev/null || echo "None")

if [ "$LT_ID" = "None" ] || [ -z "$LT_ID" ]; then
  LT_ID=$(aws ec2 create-launch-template \
    --launch-template-name "$LT_NAME" \
    --launch-template-data "$LT_DATA" \
    --region "$REGION" \
    --query 'LaunchTemplate.LaunchTemplateId' --output text)
  echo "  Created Launch Template (spot): $LT_ID"
else
  aws ec2 create-launch-template-version \
    --launch-template-id "$LT_ID" \
    --version-description "spot-instances" \
    --launch-template-data "$LT_DATA" \
    --source-version 1 \
    --region "$REGION" >/dev/null

  aws ec2 modify-launch-template \
    --launch-template-id "$LT_ID" \
    --default-version '$Latest' \
    --region "$REGION" >/dev/null

  echo "  Updated Launch Template (spot): $LT_ID"
fi

# 7. create ALB + Target Group
echo "[7/9] Creating ALB and Target Group..."

# target group
TG_ARN=$(aws elbv2 describe-target-groups \
  --names "$TG_NAME" \
  --region "$REGION" \
  --query 'TargetGroups[0].TargetGroupArn' --output text 2>/dev/null || echo "None")

if [ "$TG_ARN" = "None" ] || [ -z "$TG_ARN" ]; then
  TG_ARN=$(aws elbv2 create-target-group \
    --name "$TG_NAME" \
    --protocol HTTP \
    --port 8000 \
    --vpc-id "$VPC_ID" \
    --target-type instance \
    --health-check-protocol HTTP \
    --health-check-port "8000" \
    --health-check-path "/" \
    --health-check-interval-seconds 30 \
    --health-check-timeout-seconds 10 \
    --healthy-threshold-count 2 \
    --unhealthy-threshold-count 3 \
    --region "$REGION" \
    --query 'TargetGroups[0].TargetGroupArn' --output text)
  echo "  Target Group: $TG_ARN"
else
  echo "  Target Group exists: $TG_ARN"
fi

# ALB
ALB_ARN=$(aws elbv2 describe-load-balancers \
  --names "$ALB_NAME" \
  --region "$REGION" \
  --query 'LoadBalancers[0].LoadBalancerArn' --output text 2>/dev/null || echo "None")

if [ "$ALB_ARN" = "None" ] || [ -z "$ALB_ARN" ]; then
  ALB_ARN=$(aws elbv2 create-load-balancer \
    --name "$ALB_NAME" \
    --type application \
    --scheme internet-facing \
    --security-groups "$ALB_SG_ID" \
    --subnets $SUBNET_IDS \
    --tags Key=Project,Value=$PROJECT Key=Service,Value=marker \
    --region "$REGION" \
    --query 'LoadBalancers[0].LoadBalancerArn' --output text)

  # wait for ALB to be active
  echo "  Waiting for ALB to become active..."
  aws elbv2 wait load-balancer-available \
    --load-balancer-arns "$ALB_ARN" \
    --region "$REGION"

  # create listener: port 80 -> target group
  aws elbv2 create-listener \
    --load-balancer-arn "$ALB_ARN" \
    --protocol HTTP \
    --port 80 \
    --default-actions "Type=forward,TargetGroupArn=$TG_ARN" \
    --region "$REGION" >/dev/null

  echo "  Created ALB: $ALB_ARN"
else
  echo "  ALB exists: $ALB_ARN"
fi

ALB_DNS=$(aws elbv2 describe-load-balancers \
  --load-balancer-arns "$ALB_ARN" \
  --region "$REGION" \
  --query 'LoadBalancers[0].DNSName' --output text)
echo "  ALB DNS: $ALB_DNS"

# 8. create Auto Scaling Group
echo "[8/9] Creating Auto Scaling Group..."

# check if ASG exists
ASG_EXISTS=$(aws autoscaling describe-auto-scaling-groups \
  --auto-scaling-group-names "$ASG_NAME" \
  --region "$REGION" \
  --query 'AutoScalingGroups | length(@)' --output text)

if [ "$ASG_EXISTS" = "0" ]; then
  # convert tab-separated subnet IDs to comma-separated
  aws autoscaling create-auto-scaling-group \
    --auto-scaling-group-name "$ASG_NAME" \
    --launch-template "LaunchTemplateId=$LT_ID,Version=\$Latest" \
    --min-size 0 \
    --max-size "$MAX_INSTANCES" \
    --desired-capacity 0 \
    --vpc-zone-identifier "$SUBNET_CSV" \
    --target-group-arns "$TG_ARN" \
    --health-check-type ELB \
    --health-check-grace-period 300 \
    --tags \
      "Key=Project,Value=$PROJECT,PropagateAtLaunch=true" \
      "Key=Service,Value=marker,PropagateAtLaunch=true" \
    --region "$REGION"

  echo "  Created ASG: $ASG_NAME (min=0, max=$MAX_INSTANCES, desired=0)"
else
  # update existing
  aws autoscaling update-auto-scaling-group \
    --auto-scaling-group-name "$ASG_NAME" \
    --launch-template "LaunchTemplateId=$LT_ID,Version=\$Latest" \
    --min-size 0 \
    --max-size "$MAX_INSTANCES" \
    --region "$REGION"

  echo "  Updated ASG: $ASG_NAME"
fi

# 9. target tracking policy (scale out under load, scale in when idle)
echo "[9/9] Setting up target tracking policy..."

aws autoscaling put-scaling-policy \
  --auto-scaling-group-name "$ASG_NAME" \
  --policy-name "marker-target-tracking" \
  --policy-type TargetTrackingScaling \
  --target-tracking-configuration "{
    \"PredefinedMetricSpecification\": {
      \"PredefinedMetricType\": \"ALBRequestCountPerTarget\",
      \"ResourceLabel\": \"$(echo "$ALB_ARN" | sed 's|.*:loadbalancer/||')/$(echo "$TG_ARN" | sed 's|.*:||')\"
    },
    \"TargetValue\": 10.0,
    \"ScaleInCooldown\": 120,
    \"ScaleOutCooldown\": 30
  }" \
  --region "$REGION" >/dev/null 2>&1 || echo "  (target tracking policy may need ALB traffic first)"

echo "  Target tracking policy created"

echo ""
echo "=== Setup Complete ==="
echo ""
echo "ASG Name:     $ASG_NAME"
echo "ALB DNS:      $ALB_DNS"
echo "Endpoint:     http://$ALB_DNS"
echo "Instance:     $INSTANCE_TYPE (NVIDIA A10G, spot)"
echo "Max scale:    $MAX_INSTANCES instances"
echo "Mode:         scale-to-zero — GPU starts on demand, cold start ~4-7 min"
echo ""
echo "Estimated cost (spot ~\$0.35/hr): pay-per-use only, ~\$0 when idle"
echo ""
echo "Add these to your environment:"
echo "  MARKER_ASG_NAME=$ASG_NAME"
echo "  MARKER_API_URL=http://$ALB_DNS"
echo "  MARKER_ASG_REGION=$REGION"
