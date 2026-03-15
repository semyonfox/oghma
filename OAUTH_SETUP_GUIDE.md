# OAuth Setup Guide

## Overview

Auth.js is now integrated and ready for OAuth. You just need to add credentials from each provider. This guide walks you through each one.

**Status Tracker**: Mark each section as you complete it.

---

## Google OAuth

### Steps

1. Go to **Google Cloud Console**
   - URL: https://console.cloud.google.com
   
2. Create a new project (or select existing one)
   - Project name: `oghmanotes` (or whatever)
   - Create

3. Enable Google+ API
   - Search for "Google+ API" in the search bar
   - Click **Enable**

4. Create OAuth 2.0 credentials
   - Left sidebar → **Credentials**
   - Click **Create Credentials** → **OAuth client ID**
   - Application type: **Web application**
   - Name: `oghmanotes`
   - Authorized redirect URIs → **Add URI**: `http://localhost:3000/api/auth/callback/google`
   - Click **Create**

5. Copy credentials
   - You'll see a popup with:
     - **Client ID** → Copy to `GOOGLE_ID` in `.env.local`
     - **Client Secret** → Copy to `GOOGLE_SECRET` in `.env.local`

### For Production

Change redirect URI to: `https://yourdomain.com/api/auth/callback/google`

### Checklist

- [ ] Project created
- [ ] Google+ API enabled
- [ ] OAuth credentials created
- [ ] `GOOGLE_ID` added to `.env.local`
- [ ] `GOOGLE_SECRET` added to `.env.local`

---

## GitHub OAuth

### Steps

1. Go to **GitHub Developer Settings**
   - URL: https://github.com/settings/developers
   - Or: GitHub → Settings → Developer settings → OAuth Apps

2. Click **New OAuth App**

3. Fill in the form
   - **Application name**: `oghmanotes`
   - **Homepage URL**: `http://localhost:3000`
   - **Application description**: (optional)
   - **Authorization callback URL**: `http://localhost:3000/api/auth/callback/github`
   - Click **Register application**

4. Copy credentials
   - You'll see:
     - **Client ID** → Copy to `GITHUB_ID` in `.env.local`
     - **Client Secret** → Click **Generate a new client secret** → Copy to `GITHUB_SECRET` in `.env.local`

### For Production

Change callback URL to: `https://yourdomain.com/api/auth/callback/github`

### Checklist

- [ ] GitHub OAuth App created
- [ ] `GITHUB_ID` added to `.env.local`
- [ ] `GITHUB_SECRET` added to `.env.local`

---

## Microsoft/Azure OAuth

### Steps

1. Go to **Azure Portal**
   - URL: https://portal.azure.com
   - Sign in with your Microsoft account

2. Navigate to App registrations
   - Search bar → "App registrations"
   - Click **New registration**

3. Register the application
   - **Name**: `oghmanotes`
   - **Supported account types**: Accounts in any organizational directory (Any Azure AD directory - Multitenant)
   - **Redirect URI**: Web → `http://localhost:3000/api/auth/callback/azure-ad`
   - Click **Register**

4. Get credentials
   - You're now in the app's overview page
   - Copy:
     - **Application (client) ID** → `AZURE_CLIENT_ID` in `.env.local`
     - **Directory (tenant) ID** → `AZURE_TENANT_ID` in `.env.local`

5. Create client secret
   - Left sidebar → **Certificates & secrets**
   - Click **New client secret**
   - Description: `oghmanotes`
   - Expires: (choose one, usually 24 months)
   - Click **Add**
   - Copy the **Value** (not the ID) → `AZURE_CLIENT_SECRET` in `.env.local`

### For Production

Change redirect URI to: `https://yourdomain.com/api/auth/callback/azure-ad`

### Checklist

- [ ] App registered in Azure
- [ ] `AZURE_CLIENT_ID` added to `.env.local`
- [ ] `AZURE_TENANT_ID` added to `.env.local`
- [ ] `AZURE_CLIENT_SECRET` added to `.env.local`

---

## Apple OAuth

### Steps

1. Go to **Apple Developer Account**
   - URL: https://developer.apple.com/account
   - Sign in with your Apple ID

2. Get your Team ID
   - Top right → Your name → **Membership**
   - Copy **Team ID** (e.g., `ABC123DEF`)
   - Save this for later: `APPLE_ID = <TeamID>.<ServiceID>`

3. Create a Service ID
   - Left sidebar → **Identifiers**
   - Click **+** button
   - Select **Service IDs**
   - Register Service ID:
     - **Description**: `oghmanotes`
     - **Identifier**: `com.example.oghmanotes` (or whatever, must be unique)
     - Check **Sign in with Apple**
     - Click **Configure**
   - Configure Service ID:
     - **Primary App ID**: Select your main app or create one
     - **Domains and Subdomains**: Add `localhost` and your production domain
     - **Return URLs**: 
       - `http://localhost:3000/api/auth/callback/apple`
       - `https://yourdomain.com/api/auth/callback/apple` (for production)
     - Click **Save**
   - Click **Continue** → **Register**

4. Create a private key
   - Left sidebar → **Keys**
   - Click **+** button
   - **Key Name**: `oghmanotes`
   - Check **Sign in with Apple**
   - Click **Configure**
   - Select your Service ID (from step 3)
   - Click **Save** → **Continue** → **Register**
   - **Download** the key file (`.p8`) - **Save this, you can only download once!**
   - Copy the **Key ID** shown on screen

5. Encode private key to base64
   - Open the `.p8` file you downloaded in a text editor
   - Copy all content (including `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----`)
   - Go to an online base64 encoder: https://www.base64encode.org/
   - Paste the key content
   - Copy the encoded output → `APPLE_SECRET` in `.env.local`

6. Create `APPLE_ID`
   - Format: `<TeamID>.<ServiceID>`
   - Example: `ABC123DEF.com.example.oghmanotes`
   - Add to `.env.local`

### For Production

Add production redirect URI in Apple Developer portal to Service ID configuration.

### Checklist

- [ ] Team ID found
- [ ] Service ID created
- [ ] Private key downloaded
- [ ] Private key encoded to base64
- [ ] `APPLE_ID` (TeamID.ServiceID) added to `.env.local`
- [ ] `APPLE_SECRET` (base64 private key) added to `.env.local`

---

## .env.local Template

Here's what your `.env.local` should look like when complete:

```bash
# Database configuration
DATABASE_URL=postgresql://...
# ... other existing vars ...

# Auth.js Secret (already generated)
AUTH_SECRET=hjO4dZrF37IaqODxu2zNIxf0TBTgZAJ0BZ3W5oR6byM=

# Google OAuth
GOOGLE_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_SECRET=your-google-client-secret

# GitHub OAuth
GITHUB_ID=your-github-client-id
GITHUB_SECRET=your-github-client-secret

# Microsoft/Azure OAuth
AZURE_CLIENT_ID=your-azure-client-id
AZURE_CLIENT_SECRET=your-azure-client-secret
AZURE_TENANT_ID=your-azure-tenant-id

# Apple OAuth
APPLE_ID=ABC123DEF.com.example.oghmanotes
APPLE_SECRET=base64-encoded-private-key
```

---

## Testing

Once you've added credentials:

1. Start dev server: `npm run dev`
2. Go to http://localhost:3000/login
3. Click "Sign in with [Provider]"
4. You should be redirected to the provider's login
5. After login, you should return to `/notes`

If a provider is missing credentials, its button will still appear but will error - that's fine. Just skip it.

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Invalid Client ID" | Check you copied the correct credentials, no extra spaces |
| "Redirect URI mismatch" | Make sure `http://localhost:3000/api/auth/callback/[provider]` is added in each provider's dashboard |
| "Secret not found" | Check `.env.local` has all required vars for that provider |
| Button does nothing | Check browser console for errors, ensure dev server restarted after `.env.local` changes |

---

## Production Checklist

When ready to deploy:

1. **Add production domain redirect URIs** to each OAuth provider config
   - Google: `https://yourdomain.com/api/auth/callback/google`
   - GitHub: `https://yourdomain.com/api/auth/callback/github`
   - Azure: `https://yourdomain.com/api/auth/callback/azure-ad`
   - Apple: `https://yourdomain.com/api/auth/callback/apple`

2. **Update `.env.production`** with production credentials (if different)

3. **Keep `.env.local` private** - never commit to git

---

## Questions?

Check Auth.js docs: https://authjs.dev/getting-started/providers
