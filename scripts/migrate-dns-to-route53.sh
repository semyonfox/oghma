#!/usr/bin/env bash
set -euo pipefail

# migrate cloudflare dns for oghmanotes.ie to aws route 53
# run this script to create the hosted zone and populate records
# then update nameservers at your domain registrar

DOMAIN="oghmanotes.ie"
REGION="eu-north-1"
COMMENT="oghmanotes.ie - migrated from cloudflare $(date +%Y-%m-%d)"

echo "=== Route 53 DNS Migration for $DOMAIN ==="
echo ""

# ─── step 1: create hosted zone ───────────────────────────────────
echo "[1/5] Creating Route 53 hosted zone..."

ZONE_OUTPUT=$(aws route53 create-hosted-zone \
  --name "$DOMAIN" \
  --caller-reference "migrate-$(date +%s)" \
  --hosted-zone-config Comment="$COMMENT" \
  --output json 2>&1) || {
    # if zone already exists, find it instead
    if echo "$ZONE_OUTPUT" | grep -q "HostedZoneAlreadyExists"; then
      echo "  -> Hosted zone already exists, looking it up..."
      ZONE_ID=$(aws route53 list-hosted-zones-by-name \
        --dns-name "$DOMAIN" \
        --query "HostedZones[?Name=='${DOMAIN}.'].Id" \
        --output text | sed 's|/hostedzone/||')
    else
      echo "ERROR: $ZONE_OUTPUT"
      exit 1
    fi
  }

if [ -z "${ZONE_ID:-}" ]; then
  ZONE_ID=$(echo "$ZONE_OUTPUT" | python3 -c "import sys,json; print(json.load(sys.stdin)['HostedZone']['Id'].split('/')[-1])")
fi

echo "  -> Hosted Zone ID: $ZONE_ID"
echo ""

# ─── step 2: get nameservers ──────────────────────────────────────
echo "[2/5] Retrieving Route 53 nameservers..."
NAMESERVERS=$(aws route53 get-hosted-zone \
  --id "$ZONE_ID" \
  --query "DelegationSet.NameServers" \
  --output text)

echo ""
echo "  ┌─────────────────────────────────────────────┐"
echo "  │  NAMESERVERS (set these at your registrar)   │"
echo "  ├─────────────────────────────────────────────┤"
for NS in $NAMESERVERS; do
  printf "  │  %-43s│\n" "$NS"
done
echo "  └─────────────────────────────────────────────┘"
echo ""

# ─── step 3: discover amplify app domain ──────────────────────────
echo "[3/5] Discovering Amplify app CloudFront domain..."

# find the amplify app
AMPLIFY_APPS=$(aws amplify list-apps --region "$REGION" --query "apps[?name=='oghmanotes' || name=='OghmaNotes' || contains(name, 'oghma')].{id:appId,name:name,domain:defaultDomain}" --output json 2>/dev/null || echo "[]")

AMPLIFY_DOMAIN=""
AMPLIFY_APP_ID=""
if [ "$AMPLIFY_APPS" != "[]" ] && [ -n "$AMPLIFY_APPS" ]; then
  AMPLIFY_APP_ID=$(echo "$AMPLIFY_APPS" | python3 -c "import sys,json; apps=json.load(sys.stdin); print(apps[0]['id'] if apps else '')" 2>/dev/null || echo "")
  AMPLIFY_DOMAIN=$(echo "$AMPLIFY_APPS" | python3 -c "import sys,json; apps=json.load(sys.stdin); print(apps[0]['domain'] if apps else '')" 2>/dev/null || echo "")
fi

if [ -n "$AMPLIFY_DOMAIN" ]; then
  echo "  -> Amplify app: $AMPLIFY_APP_ID"
  echo "  -> Default domain: $AMPLIFY_DOMAIN"

  # check for custom domain config
  CUSTOM_DOMAINS=$(aws amplify list-domain-associations \
    --app-id "$AMPLIFY_APP_ID" \
    --region "$REGION" \
    --query "domainAssociations[].{domain:domainName,status:domainStatus}" \
    --output json 2>/dev/null || echo "[]")
  echo "  -> Custom domains: $CUSTOM_DOMAINS"
else
  echo "  -> Could not auto-detect Amplify app. You may need to set records manually."
  echo "     Check: aws amplify list-apps --region $REGION"
fi
echo ""

# ─── step 4: discover SES verification records ────────────────────
echo "[4/5] Discovering SES email verification records..."

SES_IDENTITY=$(aws ses get-identity-verification-attributes \
  --identities "$DOMAIN" "contact@${DOMAIN}" \
  --region "$REGION" \
  --output json 2>/dev/null || echo "{}")

SES_DKIM=$(aws ses get-identity-dkim-attributes \
  --identities "$DOMAIN" \
  --region "$REGION" \
  --output json 2>/dev/null || echo "{}")

DKIM_TOKENS=$(echo "$SES_DKIM" | python3 -c "
import sys, json
data = json.load(sys.stdin)
attrs = data.get('DkimAttributes', {}).get('$DOMAIN', {})
tokens = attrs.get('DkimTokens', [])
for t in tokens:
    print(t)
" 2>/dev/null || echo "")

echo "  -> SES verification status:"
echo "$SES_IDENTITY" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for identity, attrs in data.get('VerificationAttributes', {}).items():
    print(f'     {identity}: {attrs.get(\"VerificationStatus\", \"unknown\")}')
" 2>/dev/null || echo "     (could not read SES status)"

if [ -n "$DKIM_TOKENS" ]; then
  echo "  -> DKIM tokens found: $(echo "$DKIM_TOKENS" | wc -l) tokens"
else
  echo "  -> No DKIM tokens found. You may need to enable DKIM:"
  echo "     aws ses verify-domain-dkim --domain $DOMAIN --region $REGION"
fi
echo ""

# ─── step 5: create DNS records ───────────────────────────────────
echo "[5/5] Creating DNS records..."

# build the change batch
CHANGES=()

# --- SPF record (for SES email sending) ---
CHANGES+=("{
  \"Action\": \"UPSERT\",
  \"ResourceRecordSet\": {
    \"Name\": \"$DOMAIN\",
    \"Type\": \"TXT\",
    \"TTL\": 300,
    \"ResourceRecords\": [
      {\"Value\": \"\\\"v=spf1 include:amazonses.com ~all\\\"\"}
    ]
  }
}")

# --- DMARC record ---
CHANGES+=("{
  \"Action\": \"UPSERT\",
  \"ResourceRecordSet\": {
    \"Name\": \"_dmarc.$DOMAIN\",
    \"Type\": \"TXT\",
    \"TTL\": 300,
    \"ResourceRecords\": [
      {\"Value\": \"\\\"v=DMARC1; p=quarantine; rua=mailto:contact@${DOMAIN}\\\"\"}
    ]
  }
}")

# --- SES DKIM CNAME records ---
if [ -n "$DKIM_TOKENS" ]; then
  while IFS= read -r TOKEN; do
    [ -z "$TOKEN" ] && continue
    CHANGES+=("{
      \"Action\": \"UPSERT\",
      \"ResourceRecordSet\": {
        \"Name\": \"${TOKEN}._domainkey.$DOMAIN\",
        \"Type\": \"CNAME\",
        \"TTL\": 300,
        \"ResourceRecords\": [
          {\"Value\": \"${TOKEN}.dkim.amazonses.com\"}
        ]
      }
    }")
  done <<< "$DKIM_TOKENS"
fi

# --- MX record for SES inbound (optional, useful for bounce handling) ---
CHANGES+=("{
  \"Action\": \"UPSERT\",
  \"ResourceRecordSet\": {
    \"Name\": \"$DOMAIN\",
    \"Type\": \"MX\",
    \"TTL\": 300,
    \"ResourceRecords\": [
      {\"Value\": \"10 inbound-smtp.${REGION}.amazonaws.com\"}
    ]
  }
}")

# --- www CNAME to amplify ---
if [ -n "$AMPLIFY_DOMAIN" ]; then
  CHANGES+=("{
    \"Action\": \"UPSERT\",
    \"ResourceRecordSet\": {
      \"Name\": \"www.$DOMAIN\",
      \"Type\": \"CNAME\",
      \"TTL\": 300,
      \"ResourceRecords\": [
        {\"Value\": \"$AMPLIFY_DOMAIN\"}
      ]
    }
  }")
fi

# join changes array
CHANGE_LIST=$(IFS=,; echo "${CHANGES[*]}")

CHANGE_BATCH="{
  \"Comment\": \"$COMMENT\",
  \"Changes\": [$CHANGE_LIST]
}"

# write to temp file for aws cli (avoids shell escaping issues)
TMPFILE=$(mktemp /tmp/route53-changes-XXXXXX.json)
echo "$CHANGE_BATCH" > "$TMPFILE"

echo "  -> Applying $(echo "${#CHANGES[@]}") DNS record changes..."
CHANGE_RESULT=$(aws route53 change-resource-record-sets \
  --hosted-zone-id "$ZONE_ID" \
  --change-batch "file://$TMPFILE" \
  --output json 2>&1) || {
    echo "  WARNING: Some records may have failed:"
    echo "  $CHANGE_RESULT"
  }

CHANGE_ID=$(echo "$CHANGE_RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin)['ChangeInfo']['Id'].split('/')[-1])" 2>/dev/null || echo "unknown")
echo "  -> Change ID: $CHANGE_ID"

rm -f "$TMPFILE"

echo ""
echo "═══════════════════════════════════════════════════════"
echo ""
echo "  MIGRATION COMPLETE — records created in Route 53"
echo ""
echo "═══════════════════════════════════════════════════════"
echo ""
echo "WHAT YOU NEED TO DO NOW:"
echo ""
echo "  1. UPDATE NAMESERVERS at your domain registrar for $DOMAIN"
echo "     Replace the Cloudflare nameservers with these Route 53 ones:"
echo ""
for NS in $NAMESERVERS; do
  echo "       $NS"
done
echo ""
echo "  2. CONNECT CUSTOM DOMAIN in Amplify (if not already done):"
echo "     aws amplify create-domain-association \\"
echo "       --app-id $AMPLIFY_APP_ID \\"
echo "       --domain-name $DOMAIN \\"
echo "       --sub-domain-settings '[{\"prefix\":\"\",\"branchName\":\"main\"},{\"prefix\":\"www\",\"branchName\":\"main\"}]' \\"
echo "       --region $REGION"
echo ""
echo "     Amplify will provide a CloudFront distribution + SSL cert."
echo "     It will also create/update the A/AAAA ALIAS records in Route 53 automatically"
echo "     if you select Route 53 as your DNS provider during domain setup."
echo ""
echo "  3. WAIT FOR PROPAGATION"
echo "     DNS propagation after nameserver change: 24-48 hours"
echo "     (usually much faster, often under 1 hour)"
echo ""
echo "  4. VERIFY SES DOMAIN (if not already done):"
echo "     aws ses verify-domain-identity --domain $DOMAIN --region $REGION"
echo "     aws ses verify-domain-dkim --domain $DOMAIN --region $REGION"
echo ""
echo "  5. REMOVE CLOUDFLARE (after propagation confirms Route 53 is active):"
echo "     - Delete the zone from Cloudflare dashboard"
echo "     - Disable any Cloudflare proxy/CDN features (now handled by CloudFront via Amplify)"
echo ""
echo "RECORDS CREATED:"
echo "  TXT   $DOMAIN                          (SPF for SES)"
echo "  TXT   _dmarc.$DOMAIN                   (DMARC policy)"
if [ -n "$DKIM_TOKENS" ]; then
echo "  CNAME <token>._domainkey.$DOMAIN  ×3   (SES DKIM)"
fi
echo "  MX    $DOMAIN                          (SES inbound)"
if [ -n "$AMPLIFY_DOMAIN" ]; then
echo "  CNAME www.$DOMAIN                      (Amplify app)"
fi
echo ""
echo "RECORDS YOU STILL NEED (Amplify handles these):"
echo "  A     $DOMAIN     → Amplify CloudFront ALIAS (created by Amplify domain setup)"
echo "  AAAA  $DOMAIN     → Amplify CloudFront ALIAS (created by Amplify domain setup)"
echo ""
