#!/usr/bin/env bash
set -euo pipefail

# deploys the chat Lambda function with a function URL
# usage: ./infra/chat-lambda/deploy.sh
#
# prerequisites:
#   - AWS CLI configured with appropriate credentials
#   - Node.js + npm available
#   - the Lambda needs VPC access if RDS/ElastiCache are in a VPC

REGION="eu-north-1"
FUNCTION_NAME="oghmanotes-chat"
ROLE_NAME="oghmanotes-chat-lambda-role"
TIMEOUT=300        # 5 minutes
MEMORY=1024        # MB
RUNTIME="nodejs20.x"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
DIST_DIR="$SCRIPT_DIR/dist"

echo "==> building handler..."
rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR"

npx esbuild "$SCRIPT_DIR/handler.ts" \
  --bundle \
  --platform=node \
  --target=node20 \
  --format=esm \
  --outfile="$DIST_DIR/index.mjs" \
  --alias:@="$PROJECT_ROOT/src" \
  --loader:.js=ts \
  --external:pg-native \
  --external:aws-crt \
  --banner:js="import{createRequire}from'module';const require=createRequire(import.meta.url);"

echo "==> creating zip..."
cd "$DIST_DIR"
zip -q function.zip index.mjs
cd "$PROJECT_ROOT"

# create IAM role if it doesn't exist
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${ROLE_NAME}"

if ! aws iam get-role --role-name "$ROLE_NAME" &>/dev/null; then
  echo "==> creating IAM role..."
  aws iam create-role \
    --role-name "$ROLE_NAME" \
    --assume-role-policy-document '{
      "Version": "2012-10-17",
      "Statement": [{
        "Effect": "Allow",
        "Principal": { "Service": "lambda.amazonaws.com" },
        "Action": "sts:AssumeRole"
      }]
    }'

  aws iam attach-role-policy --role-name "$ROLE_NAME" \
    --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole

  # if your RDS/ElastiCache are in a VPC, also attach:
  aws iam attach-role-policy --role-name "$ROLE_NAME" \
    --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole

  echo "    waiting for role to propagate..."
  sleep 10
fi

# create or update the Lambda function
if aws lambda get-function --function-name "$FUNCTION_NAME" --region "$REGION" &>/dev/null; then
  echo "==> updating function code..."
  aws lambda update-function-code \
    --function-name "$FUNCTION_NAME" \
    --zip-file "fileb://$DIST_DIR/function.zip" \
    --region "$REGION"

  aws lambda wait function-updated --function-name "$FUNCTION_NAME" --region "$REGION"

  aws lambda update-function-configuration \
    --function-name "$FUNCTION_NAME" \
    --timeout "$TIMEOUT" \
    --memory-size "$MEMORY" \
    --region "$REGION"
else
  echo "==> creating function..."
  aws lambda create-function \
    --function-name "$FUNCTION_NAME" \
    --runtime "$RUNTIME" \
    --role "$ROLE_ARN" \
    --handler "index.handler" \
    --timeout "$TIMEOUT" \
    --memory-size "$MEMORY" \
    --zip-file "fileb://$DIST_DIR/function.zip" \
    --region "$REGION" \
    --environment "Variables={NODE_OPTIONS=--enable-source-maps}" \
    --invoke-mode RESPONSE_STREAM

  aws lambda wait function-active --function-name "$FUNCTION_NAME" --region "$REGION"
fi

# ensure invoke mode supports response streaming
aws lambda update-function-url-config \
  --function-name "$FUNCTION_NAME" \
  --region "$REGION" \
  --invoke-mode RESPONSE_STREAM 2>/dev/null || true

# create function URL if it doesn't exist
FUNCTION_URL=$(aws lambda get-function-url-config \
  --function-name "$FUNCTION_NAME" \
  --region "$REGION" \
  --query 'FunctionUrl' --output text 2>/dev/null || echo "")

if [ -z "$FUNCTION_URL" ] || [ "$FUNCTION_URL" = "None" ]; then
  echo "==> creating function URL..."
  FUNCTION_URL=$(aws lambda create-function-url-config \
    --function-name "$FUNCTION_NAME" \
    --auth-type NONE \
    --invoke-mode RESPONSE_STREAM \
    --cors '{
      "AllowOrigins": ["https://oghmanotes.ie", "https://dev.oghmanotes.ie", "http://localhost:3000"],
      "AllowMethods": ["POST", "OPTIONS"],
      "AllowHeaders": ["Content-Type", "Authorization"],
      "MaxAge": 86400
    }' \
    --region "$REGION" \
    --query 'FunctionUrl' --output text)

  # allow public invoke (auth is handled by the JWT token, not IAM)
  aws lambda add-permission \
    --function-name "$FUNCTION_NAME" \
    --statement-id "AllowPublicInvoke" \
    --action "lambda:InvokeFunctionUrl" \
    --principal "*" \
    --function-url-auth-type NONE \
    --region "$REGION" 2>/dev/null || true
fi

echo ""
echo "==> deployed successfully!"
echo "    function URL: $FUNCTION_URL"
echo ""
echo "next steps:"
echo "  1. copy the env vars from Amplify to the Lambda (DATABASE_URL, JWT_SECRET, etc.):"
echo "     aws lambda update-function-configuration --function-name $FUNCTION_NAME --region $REGION \\"
echo "       --environment 'Variables={DATABASE_URL=...,JWT_SECRET=...,LLM_API_KEY=...,...}'"
echo ""
echo "  2. if RDS/ElastiCache are in a VPC, configure VPC access:"
echo "     aws lambda update-function-configuration --function-name $FUNCTION_NAME --region $REGION \\"
echo "       --vpc-config SubnetIds=subnet-xxx,SecurityGroupIds=sg-xxx"
echo ""
echo "  3. set NEXT_PUBLIC_CHAT_URL in Amplify env vars:"
echo "     $FUNCTION_URL"
