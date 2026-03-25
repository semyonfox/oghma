#!/bin/bash
set -euo pipefail

# AWS WAF setup for OghmaNotes
# attaches a WebACL to the Amplify CloudFront distribution
# must use us-east-1 region for CloudFront-scoped WAFs

REGION="us-east-1"
WAF_NAME="oghmanotes-waf"
METRIC_PREFIX="oghmanotes"

echo "=== OghmaNotes AWS WAF Setup ==="
echo ""
echo "this script creates a WAF WebACL with:"
echo "  1. rate-based rule (2000 req / 5 min per IP)"
echo "  2. AWS managed common rule set (OWASP top 10)"
echo "  3. AWS managed known bad inputs (Log4j, SSRF)"
echo "  4. AWS IP reputation list"
echo ""

# step 1: create the WebACL
echo "[1/3] creating WebACL..."
WEB_ACL_ARN=$(aws wafv2 create-web-acl \
  --name "$WAF_NAME" \
  --scope CLOUDFRONT \
  --region "$REGION" \
  --default-action '{"Allow":{}}' \
  --visibility-config "{
    \"SampledRequestsEnabled\": true,
    \"CloudWatchMetricsEnabled\": true,
    \"MetricName\": \"${METRIC_PREFIX}WAF\"
  }" \
  --rules '[
    {
      "Name": "RateLimit2000Per5Min",
      "Priority": 1,
      "Statement": {
        "RateBasedStatement": {
          "Limit": 2000,
          "AggregateKeyType": "IP"
        }
      },
      "Action": { "Block": {} },
      "VisibilityConfig": {
        "SampledRequestsEnabled": true,
        "CloudWatchMetricsEnabled": true,
        "MetricName": "'"${METRIC_PREFIX}"'RateLimit"
      }
    },
    {
      "Name": "AWSManagedCommonRuleSet",
      "Priority": 2,
      "Statement": {
        "ManagedRuleGroupStatement": {
          "VendorName": "AWS",
          "Name": "AWSManagedRulesCommonRuleSet"
        }
      },
      "OverrideAction": { "None": {} },
      "VisibilityConfig": {
        "SampledRequestsEnabled": true,
        "CloudWatchMetricsEnabled": true,
        "MetricName": "'"${METRIC_PREFIX}"'CommonRules"
      }
    },
    {
      "Name": "AWSManagedKnownBadInputs",
      "Priority": 3,
      "Statement": {
        "ManagedRuleGroupStatement": {
          "VendorName": "AWS",
          "Name": "AWSManagedRulesKnownBadInputsRuleSet"
        }
      },
      "OverrideAction": { "None": {} },
      "VisibilityConfig": {
        "SampledRequestsEnabled": true,
        "CloudWatchMetricsEnabled": true,
        "MetricName": "'"${METRIC_PREFIX}"'BadInputs"
      }
    },
    {
      "Name": "AWSIPReputationList",
      "Priority": 4,
      "Statement": {
        "ManagedRuleGroupStatement": {
          "VendorName": "AWS",
          "Name": "AWSManagedRulesAmazonIpReputationList"
        }
      },
      "OverrideAction": { "None": {} },
      "VisibilityConfig": {
        "SampledRequestsEnabled": true,
        "CloudWatchMetricsEnabled": true,
        "MetricName": "'"${METRIC_PREFIX}"'IPReputation"
      }
    }
  ]' \
  --query 'Summary.ARN' \
  --output text)

echo "  WebACL ARN: $WEB_ACL_ARN"

# step 2: find the Amplify CloudFront distribution
echo ""
echo "[2/3] finding Amplify CloudFront distribution..."
echo ""
echo "  you need to associate this WebACL with your CloudFront distribution."
echo "  find your distribution ARN in the AWS console:"
echo "    Amplify > oghmanotes > Hosting > Domain management"
echo "    or: CloudFront > Distributions > find the one with your domain"
echo ""
echo "  then run:"
echo "    aws wafv2 associate-web-acl \\"
echo "      --web-acl-arn $WEB_ACL_ARN \\"
echo "      --resource-arn arn:aws:cloudfront::<ACCOUNT_ID>:distribution/<DIST_ID> \\"
echo "      --region $REGION"

# step 3: verify
echo ""
echo "[3/3] to verify the WAF is attached:"
echo "    aws wafv2 get-web-acl \\"
echo "      --name $WAF_NAME \\"
echo "      --scope CLOUDFRONT \\"
echo "      --id <WebACL-ID> \\"
echo "      --region $REGION"
echo ""
echo "  estimated cost: ~\$6-10/month (WebACL + managed rules + per-request inspection)"
echo ""
echo "=== done ==="
