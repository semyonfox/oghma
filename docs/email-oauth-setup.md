# Email & OAuth Setup

## Email — AWS SES

Password reset emails are sent via nodemailer over AWS SES SMTP. The contact form endpoint (`POST /api/contact`) exists but does not yet send — wire it up once SES is verified.

### 1. Create an IAM user for sending

In the AWS console, create an IAM user (or use an existing one) and attach the following inline policy. The group name is referenced in `src/lib/email.js`.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "ses:SendRawEmail",
      "Resource": "*"
    }
  ]
}
```

Generate an **Access Key** (type: Application running outside AWS) for this user. The key ID and secret go into `AWS_SES_ACCESS_KEY_ID` / `AWS_SES_SECRET_ACCESS_KEY`.

### 2. Verify a sender address or domain

SES starts in sandbox mode — you can only send **to** verified addresses until you request production access.

- **Sender address**: SES → Verified identities → Create identity → Email address → enter `noreply@yourdomain.com` → click the verification link.
- **Domain** (recommended for production): SES → Verified identities → Create identity → Domain → add the CNAME/TXT records to your DNS.

Set `AWS_SES_FROM_EMAIL` to the verified address.

### 3. Request production access (sandbox → live)

By default SES is sandboxed (can only send to verified addresses). To send to arbitrary users:

SES → Account dashboard → Request production access → fill in the form. AWS usually approves within 24 hours.

### 4. Env vars

```env
AWS_SES_REGION=eu-north-1          # must match the region you verified in
AWS_SES_ACCESS_KEY_ID=AKIA...
AWS_SES_SECRET_ACCESS_KEY=...
AWS_SES_FROM_EMAIL=noreply@yourdomain.com
NEXT_PUBLIC_APP_URL=https://yourdomain.com   # used in reset-password links
```

### SMTP endpoints by region

| Region | SMTP host |
|--------|-----------|
| eu-north-1 | `email-smtp.eu-north-1.amazonaws.com` |
| eu-west-1 | `email-smtp.eu-west-1.amazonaws.com` |
| us-east-1 | `email-smtp.us-east-1.amazonaws.com` |

Port 587 (STARTTLS) is used. Port 465 (TLS) also works — change `secure: true` and `port: 465` in `src/lib/email.js` if needed.

---

## OAuth Providers

All providers are optional and opt-in. A provider only activates when its env vars are present. Credentials (email + password) login is always on unless `ENABLE_CREDENTIALS_AUTH=false`.

### Google

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a project (or select existing)
3. APIs & Services → Credentials → Create Credentials → OAuth client ID
4. Application type: **Web application**
5. Authorised redirect URIs:
   - `http://localhost:3000/api/auth/callback/google` (dev)
   - `https://yourdomain.com/api/auth/callback/google` (prod)
6. Copy **Client ID** → `GOOGLE_ID` and **Client Secret** → `GOOGLE_SECRET`

```env
GOOGLE_ID=123456789-abc.apps.googleusercontent.com
GOOGLE_SECRET=GOCSPX-...
```

### GitHub

1. Go to [github.com/settings/developers](https://github.com/settings/developers) → OAuth Apps → New OAuth App
2. Homepage URL: `https://yourdomain.com`
3. Authorisation callback URL: `https://yourdomain.com/api/auth/callback/github`
4. Copy **Client ID** → `GITHUB_ID` and generate a **Client secret** → `GITHUB_SECRET`

```env
GITHUB_ID=Ov23li...
GITHUB_SECRET=...
```

### Microsoft / Azure AD

1. Go to [portal.azure.com](https://portal.azure.com) → Azure Active Directory → App registrations → New registration
2. Supported account types: choose based on your audience (single tenant, multi-tenant, or personal accounts)
3. Redirect URI: `https://yourdomain.com/api/auth/callback/azure-ad`
4. After creation: Certificates & secrets → New client secret → copy the **Value** (not the ID)
5. Copy **Application (client) ID** → `AZURE_CLIENT_ID`, **Directory (tenant) ID** → `AZURE_TENANT_ID`

```env
AZURE_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
AZURE_CLIENT_SECRET=...
AZURE_TENANT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

### Apple

Apple Sign In is the most involved setup.

1. Apple Developer account required — [developer.apple.com](https://developer.apple.com)
2. Certificates, Identifiers & Profiles → Identifiers → Register a new identifier → **Services ID**
   - Description: your app name
   - Identifier: e.g. `com.yourdomain.oghmanotes` — this becomes `APPLE_ID`
   - Enable **Sign In with Apple** → Configure → add your domain and return URL: `https://yourdomain.com/api/auth/callback/apple`
3. Keys → Register a new key → enable **Sign In with Apple** → Configure → select your app's primary App ID
   - Download the `.p8` key file (you can only download it once)
   - Note the **Key ID** and your **Team ID** (top-right of the developer portal)
4. Generate the `APPLE_SECRET` JWT:

```bash
# install if needed: npm install -g apple-signin-auth
node -e "
const fs = require('fs');
const jwt = require('jsonwebtoken');
const key = fs.readFileSync('./AuthKey_KEYID.p8');
const token = jwt.sign({}, key, {
  algorithm: 'ES256',
  expiresIn: '180d',
  audience: 'https://appleid.apple.com',
  issuer: 'TEAM_ID',
  subject: 'SERVICE_ID',
  keyid: 'KEY_ID',
});
console.log(Buffer.from(token).toString('base64'));
"
```

```env
APPLE_ID=TEAMID.com.yourdomain.oghmanotes
APPLE_SECRET=<base64-encoded-jwt>
```

Note: Apple secrets expire (max 6 months). Rotate before expiry.

---

## Auth secret

`AUTH_SECRET` is used by Auth.js (NextAuth) to sign session tokens. Generate a strong random value:

```bash
openssl rand -base64 32
```

This is separate from `JWT_SECRET` (used by the custom credentials flow). Both must be set.

---

## Disabling providers

Leave a provider's env vars unset (or delete them) to disable that login button entirely. The provider list in `src/auth.config.ts` is built at startup from whichever vars are present.

To disable email/password login entirely:

```env
ENABLE_CREDENTIALS_AUTH=false
```
