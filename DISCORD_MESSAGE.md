# Discord Message for Team

Copy and paste this to your Discord server:

---

## 🚀 SocsBoard AWS Setup - Action Required

Hey team! We're connecting to AWS for our app. **Read this carefully** - it's about 5-10 minutes of work.

### 📋 What We Need

**3 AWS Services to set up:**
- ✅ **RDS MariaDB** - Database
- ✅ **ElastiCache Redis** - Cache layer  
- ✅ **S3 Bucket** - File storage

### 👤 Role Assignments

**@[Setup Person]** - Do the AWS setup (do this ONCE):
1. Read: **`docs/AWS_SETUP_COMPLETE.md`** → "For the Setup Person" section
2. Create RDS, ElastiCache, S3 in AWS Console
3. Share 9 credentials with team via secure message (encrypted/DM, NOT in chat)

**Everyone else (@[Team Member 1] @[Team Member 2]):**
1. Get the 9 credentials from setup person
2. Read: **`docs/AWS_SETUP_COMPLETE.md`** → "For Team Members" section
3. Create `.env.local` with credentials (5 min)
4. Run `npm run dev` and you're done!

### 📍 Find Everything Here

**Master Setup Guide:**
→ `docs/AWS_SETUP_COMPLETE.md`

**For Storage API Docs:**
→ `docs/STORAGE_REFACTOR.md`

**For S3 Specifics:**
→ `docs/S3_SETUP.md`

### 🔐 IMPORTANT Security Notes

- **DO NOT** commit `.env.local` to Git (already in .gitignore)
- **DO NOT** share credentials in this chat (use DM/encrypted message)
- **DO NOT** use root AWS account credentials
- Store credentials locally only

### ⏰ Timeline

- Setup person: 20-30 min
- Each team member: 5 min
- **Total before we can test: ~45 min**

### 🎯 What You'll Get

Once set up, you can:
- ✅ Upload files to S3
- ✅ Store/retrieve from MariaDB
- ✅ Cache data with Redis
- ✅ Collaborate on notes

### ❓ Questions?

- Check section "Troubleshooting" in `AWS_SETUP_COMPLETE.md`
- Or ask in thread below 👇

**Let's go! 🚀**

---
