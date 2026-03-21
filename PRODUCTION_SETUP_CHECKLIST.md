# Production Setup Checklist

Complete guide to getting everything production-ready. Copy-paste friendly with exact links and steps.

---

## Quick summary

**What you need:**
1. **OAuth Providers** (pick 1+): Google, GitHub, Azure AD, Apple
2. **Email Service**: AWS SES (for password reset emails)
3. **Environment Variables**: Set in Amplify + instance
4. **Database**: Already set up (AWS RDS PostgreSQL)
5. **Storage**: Already set up (AWS S3)
6. **Auth Secrets**: Generate 2 random strings

---

## Part 1: auth secrets

These go in Amplify Secrets AND in your instance `.env`.

### Generate AUTH_SECRET (for Auth.js/NextAuth)

```bash
openssl rand -base64 32
```

Example output:
```
xB8mK9pLqR2vW4nJ7hF3sQ5tU6yX0zC1dE2...
```

**Set this as:**
- Amplify: `AUTH_SECRET`
- Instance `.env`: `AUTH_SECRET=xB8mK9pLqR2vW4nJ7hF3sQ5tU6yX0zC1dE2...`

---

## Part 2: OAuth providers (pick 1 or more)

### Option A: Google (Easiest, ~5 mins)

1. **Go to**: https://console.cloud.google.com
2. **Create Project**:
   - Click project dropdown (top-left)
   - Click "NEW PROJECT"
   - Name: "OghmaNotes"
   - Create

3. **Enable OAuth**:
   - Left sidebar → APIs & Services → Credentials
   - Click "Create Credentials" → "OAuth client ID"
   - Choose application type: **Web application**
   - Fill in Name: "OghmaNotes"
   - Authorised redirect URIs (add both):
     ```
     http://localhost:3000/api/auth/callback/google
     https://yourdomain.amplifyapp.com/api/auth/callback/google
     ```
   - Click Create

4. **Copy Credentials**:
   - You'll see a popup with Client ID and Client Secret
   - `GOOGLE_ID` = Client ID
   - `GOOGLE_SECRET` = Client Secret

5. **Set Environment Variables**:
   ```
   Amplify Secrets:
   GOOGLE_ID=123456789-abc.apps.googleusercontent.com
   GOOGLE_SECRET=GOCSPX-...
   
   Instance .env:
   GOOGLE_ID=123456789-abc.apps.googleusercontent.com
   GOOGLE_SECRET=GOCSPX-...
   ```

---

### Option B: GitHub (~3 mins)

1. **Go to**: https://github.com/settings/developers
2. **Click**: "OAuth Apps" → "New OAuth App"
3. **Fill in**:
   - Application name: OghmaNotes
   - Homepage URL: `https://yourdomain.amplifyapp.com`
   - Authorization callback URL: `https://yourdomain.amplifyapp.com/api/auth/callback/github`
   - Click "Register application"

4. **Copy Credentials**:
   - `GITHUB_ID` = Client ID (visible on page)
   - `GITHUB_SECRET` = Click "Generate a new client secret"

5. **Set Environment Variables**:
   ```
   Amplify Secrets:
   GITHUB_ID=Ov23li...
   GITHUB_SECRET=...
   
   Instance .env:
   GITHUB_ID=Ov23li...
   GITHUB_SECRET=...
   ```

---

### Option C: Microsoft Azure AD (~10 mins)

1. **Go to**: https://portal.azure.com
2. **Navigate**: Azure Active Directory → App registrations → New registration
3. **Fill in**:
   - Name: OghmaNotes
   - Supported account types: Choose based on your need:
     - "Accounts in this organizational directory only" (single tenant)
     - "Accounts in any organizational directory" (multi-tenant)
     - "Accounts in any organizational directory + personal Microsoft accounts" (broadest)
   - Redirect URI: Web → `https://yourdomain.amplifyapp.com/api/auth/callback/azure-ad`
   - Click Register

4. **Get Application ID**:
   - From Overview page:
   - `AZURE_CLIENT_ID` = Application (client) ID
   - `AZURE_TENANT_ID` = Directory (tenant) ID

5. **Generate Client Secret**:
   - Left sidebar → Certificates & secrets
   - Click "New client secret"
   - Add description: "OghmaNotes"
   - Expires: choose (6 months or 24 months)
   - Click Add
   - Copy the VALUE (not the ID)
   - `AZURE_CLIENT_SECRET` = this value

6. **Set Environment Variables**:
   ```
   Amplify Secrets:
   AZURE_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
   AZURE_CLIENT_SECRET=...
   AZURE_TENANT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
   
   Instance .env:
   AZURE_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
   AZURE_CLIENT_SECRET=...
   AZURE_TENANT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
   ```

---

### Option D: Apple (~30 mins, complex)

**Only needed if you want iOS/macOS users.**

1. **Go to**: https://developer.apple.com
2. **Sign in** with your Apple Developer account (or create one)
3. **Certificates, Identifiers & Profiles** → **Identifiers**
4. **Create a Service ID**:
   - Click "+" button → "Services IDs" → Continue
   - App Type: Services
   - Description: OghmaNotes
   - Identifier: `com.yourdomain.oghmanotes` (reverse domain notation)
   - Check "Sign in with Apple"
   - Click Configure → add:
     - Primary App ID: (create new or select)
     - Return URLs:
       ```
       https://yourdomain.amplifyapp.com
       https://yourdomain.amplifyapp.com/api/auth/callback/apple
       ```
   - Click Save, Continue, Register

5. **Create a Key**:
   - Left sidebar → Keys
   - Click "+" button
   - Key name: OghmaNotes
   - Check "Sign in with Apple"
   - Click Configure → select the Service ID you just created
   - Click Save
   - Click Register
   - Click Download (get the `.p8` file - save it!)
   - Note your **Key ID** and **Team ID** (top-right of portal)

6. **Generate APPLE_SECRET JWT**:
   ```bash
   # Save the .p8 file as ./AuthKey_KEYID.p8 (where KEYID is your key ID)
   # Then run:
   node -e "
   const fs = require('fs');
   const jwt = require('jsonwebtoken');
   const key = fs.readFileSync('./AuthKey_ABC123DEF456.p8');
   const token = jwt.sign({}, key, {
     algorithm: 'ES256',
     expiresIn: '180d',
     audience: 'https://appleid.apple.com',
     issuer: 'TEAM_ID_HERE',
     subject: 'com.yourdomain.oghmanotes',
     keyid: 'ABC123DEF456',
   });
   console.log(Buffer.from(token).toString('base64'));
   "
   ```
   Copy the output.

7. **Set Environment Variables**:
   ```
   Amplify Secrets:
   APPLE_ID=TEAM_ID.com.yourdomain.oghmanotes
   APPLE_SECRET=<the-base64-jwt-from-above>
   
   Instance .env:
   APPLE_ID=TEAM_ID.com.yourdomain.oghmanotes
   APPLE_SECRET=<the-base64-jwt-from-above>
   ```

---

## Part 3: email (AWS SES)

Email is for password reset emails. Canvas tokens are manual (not emailed).

### Step 1: Create IAM User (or reuse existing)

1. **Go to**: https://console.aws.amazon.com/iam
2. **Users** → **Create user** → name: `oghmanotes-ses`
3. **Skip "Add permissions" for now**
4. Click Create

### Step 2: Add SES Permission to User

1. **Click the user** you just created
2. **Add permissions** → **Attach policies directly**
3. **Create inline policy** (paste this):
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
4. Click Next → Review → Create policy

### Step 3: Create Access Key

1. **Go to**: Security credentials tab (still in user page)
2. **Create access key** → Application running outside AWS
3. **Show secret access key** and copy both:
   - `AWS_SES_ACCESS_KEY_ID` = Access Key ID
   - `AWS_SES_SECRET_ACCESS_KEY` = Secret Access Key

### Step 4: Verify Sender Email in SES

1. **Go to**: https://console.aws.amazon.com/ses
2. **Make sure region is `eu-north-1`** (check top-right)
3. **Verified identities** → **Create identity** → **Email address**
4. **Enter**: `noreply@yourdomain.com` (or your domain's noreply)
5. **Create identity**
6. **Check your email inbox** and click the verification link
7. Once verified, you can use it as `AWS_SES_FROM_EMAIL`

### Step 5: Request SES Production Access (Optional but Recommended)

By default, SES is sandboxed (can only email verified addresses). To send to all users:

1. **Go to**: https://console.aws.amazon.com/ses (make sure region is correct)
2. **Account dashboard** → **Request production access**
3. **Fill form**:
   - What's your use case? "Sending transactional emails"
   - How will you use SES? "Password reset emails"
   - Website URL: your domain
   - Expected volume: < 1,000 emails/day
4. **Submit**
   - AWS usually approves within 24 hours

### Step 6: Set Environment Variables

```
Amplify Secrets:
AWS_SES_ACCESS_KEY_ID=AKIA...
AWS_SES_SECRET_ACCESS_KEY=...
AWS_SES_FROM_EMAIL=noreply@yourdomain.com
NEXT_PUBLIC_APP_URL=https://yourdomain.amplifyapp.com

Instance .env:
AWS_SES_ACCESS_KEY_ID=AKIA...
AWS_SES_SECRET_ACCESS_KEY=...
AWS_SES_FROM_EMAIL=noreply@yourdomain.com
NEXT_PUBLIC_APP_URL=https://yourdomain.amplifyapp.com
```

---

## Part 4: Amplify secrets setup

All environment variables must be set in Amplify console.

### Go to Amplify Console

1. **Go to**: https://console.aws.amazon.com/amplify
2. **Select your app** (OghmaNotes)
3. **Deployments** → **Environment variables** (or left sidebar)

### Set ALL These Variables

```
# Auth
AUTH_SECRET=<from PART 1>
ENABLE_CREDENTIALS_AUTH=true

# Database & Storage (already set, verify)
DATABASE_URL=postgresql://...
JWT_SECRET=...
STORAGE_BUCKET=our-chum-bucket
STORAGE_ACCESS_KEY=...
STORAGE_SECRET_KEY=...
STORAGE_REGION=eu-north-1
STORAGE_ENDPOINT=https://s3.eu-north-1.amazonaws.com
STORAGE_PREFIX=...

# Email (from PART 3)
AWS_SES_ACCESS_KEY_ID=...
AWS_SES_SECRET_ACCESS_KEY=...
AWS_SES_FROM_EMAIL=noreply@yourdomain.com
NEXT_PUBLIC_APP_URL=https://yourdomain.amplifyapp.com

# OAuth (PICK 1 OR MORE from PART 2)
# Google:
GOOGLE_ID=...
GOOGLE_SECRET=...

# OR GitHub:
GITHUB_ID=...
GITHUB_SECRET=...

# OR Azure:
AZURE_CLIENT_ID=...
AZURE_CLIENT_SECRET=...
AZURE_TENANT_ID=...

# OR Apple:
APPLE_ID=...
APPLE_SECRET=...
```

---

## Part 5: instance setup

Your instance needs the same variables (minus NEXT_PUBLIC_ ones).

### Update Instance .env

```bash
cd ~/code/university/ct216-software-eng/oghmanotes
nano .env
```

Add/update:
```
# Auth
AUTH_SECRET=<from PART 1>
ENABLE_CREDENTIALS_AUTH=true

# Canvas (already set)
CANVAS_DOMAIN=universityofgalway.instructure.com
CANVAS_TOKEN=<your-token>

# Email (from PART 3)
AWS_SES_ACCESS_KEY_ID=...
AWS_SES_SECRET_ACCESS_KEY=...
AWS_SES_FROM_EMAIL=noreply@yourdomain.com
NEXT_PUBLIC_APP_URL=https://yourdomain.amplifyapp.com

# OAuth (from PART 2)
GOOGLE_ID=...
GOOGLE_SECRET=...
# etc.
```

Save & exit (Ctrl+X, Y, Enter in nano)

### Restart Services

```bash
# Stop old dev server
pkill -f "npm run dev"

# Stop old worker
pkill -f canvas-worker
pm2 delete all

# Start worker
pm2 start src/lib/canvas/import-worker.js --name canvas-worker

# Start dev server (optional, for local testing)
npm run dev &

# Check they're running
pm2 list
```

---

## Part 6: verification

### Test OAuth Login

1. Open https://yourdomain.amplifyapp.com/login
2. Should see login buttons for all providers you set up
3. Click one and verify it redirects to provider, then back

### Test Password Reset Email

1. Go to login page
2. Click "Forgot password?"
3. Enter an email
4. Check email inbox for reset link
5. Click link and verify it works

### Test Canvas Import Toast

1. Go to Settings → Canvas Integration
2. Connect Canvas account
3. Select courses to import
4. Should see toast with progress bar

---

## Canvas integration

Canvas doesn't need oauth setup - you already have:
- `CANVAS_DOMAIN=universityofgalway.instructure.com`
- `CANVAS_TOKEN=<student-generated-token>`

These are manually generated by students in Canvas account settings.

---

## Redeploy Amplify

After setting env vars:

1. **Go to**: Amplify console → Deployments
2. **Click**: Recent deployment or "Redeploy this version"
3. **Wait** for build to complete (should take 3-5 mins)
4. Test at your domain

---

## Summary checklist

```
Auth:
☐ Generate AUTH_SECRET (openssl rand -base64 32)
☐ Set AUTH_SECRET in Amplify + Instance

OAuth (pick 1+):
☐ Google (if using):
    ☐ Create project at console.cloud.google.com
    ☐ Set GOOGLE_ID + GOOGLE_SECRET in Amplify + Instance
☐ GitHub (if using):
    ☐ Create app at github.com/settings/developers
    ☐ Set GITHUB_ID + GITHUB_SECRET in Amplify + Instance
☐ Azure (if using):
    ☐ Register app at portal.azure.com
    ☐ Set AZURE_CLIENT_ID + SECRET + TENANT_ID in Amplify + Instance
☐ Apple (if using):
    ☐ Complex setup - see PART 2 Option D
    ☐ Set APPLE_ID + APPLE_SECRET in Amplify + Instance

Email:
☐ Create IAM user in AWS
☐ Add SES SendRawEmail policy
☐ Create access key
☐ Verify sender email in SES (eu-north-1)
☐ (Optional) Request production access
☐ Set AWS_SES_* vars in Amplify + Instance
☐ Set NEXT_PUBLIC_APP_URL to your domain

Deployment:
☐ All env vars set in Amplify console
☐ All env vars set in instance .env
☐ Amplify redeploy triggered
☐ Instance services restarted (dev server, worker)

Testing:
☐ OAuth login works (all providers)
☐ Password reset email sends
☐ Canvas import shows toast + progress
☐ No errors in browser console or server logs
```

---

## Troubleshooting

### OAuth button doesn't show
- Check env vars are set in Amplify
- Verify capitalization: `GOOGLE_ID`, `GITHUB_ID`, etc.
- Redeploy Amplify

### OAuth redirect fails
- Check redirect URI matches exactly (case-sensitive)
- Verify domain is correct (localhost:3000 for dev, yourdomain for prod)

### Password reset email not received
- Check sender is verified in SES (eu-north-1)
- If sandboxed, only recipients in verified addresses will get emails
- Request production access to send to all users

### "Unauthorized" on password reset
- Check AWS_SES_* vars are set correctly
- Check instance can reach AWS (network/IAM permissions)

### Canvas import not showing
- Check worker is running: `pm2 list`
- Check database connection works
- Check browser console for fetch errors

---

## Quick links

- Google OAuth: https://console.cloud.google.com
- GitHub OAuth: https://github.com/settings/developers
- Azure AD: https://portal.azure.com
- Apple Developer: https://developer.apple.com
- AWS IAM: https://console.aws.amazon.com/iam
- AWS SES: https://console.aws.amazon.com/ses
- Amplify Console: https://console.aws.amazon.com/amplify

---

Once all env vars are set, push to Amplify and test.
