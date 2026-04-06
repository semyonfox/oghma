#!/usr/bin/env bash
# updates the Marker ASG launch template to use a new (baked) AMI
# and removes spot config if present (account has 0 spot GPU quota)
#
# usage: bash infra/marker/update-lt-ami.sh <ami-id>
set -euo pipefail

AMI_ID="${1:?Usage: update-lt-ami.sh <ami-id>}"
REGION="${MARKER_ASG_REGION:-eu-west-1}"
LT_NAME="marker-lt-oghmanotes"

echo "Updating launch template: $LT_NAME"
echo "  AMI: $AMI_ID"
echo "  Region: $REGION"

LT_ID=$(aws ec2 describe-launch-templates \
  --launch-template-names "$LT_NAME" \
  --region "$REGION" \
  --query 'LaunchTemplates[0].LaunchTemplateId' --output text)

# get latest version data, strip spot config, swap AMI
CURRENT=$(aws ec2 describe-launch-template-versions \
  --launch-template-id "$LT_ID" \
  --versions '$Latest' \
  --region "$REGION" \
  --query 'LaunchTemplateVersions[0].LaunchTemplateData' \
  --output json)

NEW=$(echo "$CURRENT" | python3 -c "
import json, sys
d = json.load(sys.stdin)
d.pop('InstanceMarketOptions', None)  # remove spot — quota=0 on this account
d['ImageId'] = sys.argv[1]
print(json.dumps(d))
" "$AMI_ID")

NEW_VER=$(aws ec2 create-launch-template-version \
  --launch-template-id "$LT_ID" \
  --launch-template-data "$NEW" \
  --region "$REGION" \
  --query 'LaunchTemplateVersion.VersionNumber' --output text)

aws ec2 modify-launch-template \
  --launch-template-id "$LT_ID" \
  --default-version "$NEW_VER" \
  --region "$REGION" > /dev/null

echo "✓ Launch template $LT_ID updated to version $NEW_VER"
echo "  AMI: $AMI_ID (on-demand, spot removed)"
echo ""
echo "Next scale-up will use the baked AMI (~90s cold start)."
