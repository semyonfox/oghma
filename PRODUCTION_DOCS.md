# Production Documentation Index

Quick guide to which document to read for what.

## 🚀 To Deploy to Production

**Read**: `PRODUCTION_SETUP_CHECKLIST.md`

Complete step-by-step guide including:
- Auth secrets generation
- OAuth provider setup (Google, GitHub, Azure, Apple)
- AWS SES email configuration
- Environment variables for Amplify and instance
- Testing checklist

**Time**: 30-60 mins depending on OAuth providers chosen

---

## 🏗️ To Deploy Canvas Worker

**Read**: `CANVAS_WORKER_DEPLOYMENT.md`

Complete guide to deploying and monitoring the background import worker:
- 3 deployment options (PM2, systemd, direct)
- Testing the integration
- Monitoring worker health
- Troubleshooting

**Time**: 5 mins

---

## 🎨 To Customize Canvas UI Components

**Read**: `CANVAS_UI_COMPONENTS.md`

Technical reference for the UI components:
- Component overview and usage
- API endpoints
- Database tables
- Customization points (polling intervals, auto-close delays)
- Troubleshooting

**Time**: 5-15 mins depending on customizations

---

## 📋 Document Breakdown

| Document | Purpose | Audience | Read If |
|----------|---------|----------|---------|
| `PRODUCTION_SETUP_CHECKLIST.md` | OAuth, email, env vars | DevOps, backend | Deploying to production |
| `CANVAS_WORKER_DEPLOYMENT.md` | Worker deployment, monitoring | DevOps, backend | Setting up background job processor |
| `CANVAS_UI_COMPONENTS.md` | Component API, customization | Frontend, full-stack | Modifying UI or polling behavior |
| `AGENTS.md` | Agent operational guidelines | Developers | Working with Claude agents |

---

## 🎯 Quick Links

### Setting Up for First Time

1. Generate `AUTH_SECRET`: `openssl rand -base64 32`
2. Pick OAuth provider(s): Google (easiest), GitHub, Azure, Apple (see `PRODUCTION_SETUP_CHECKLIST.md` PART 2)
3. Set up email: AWS SES (see `PRODUCTION_SETUP_CHECKLIST.md` PART 3)
4. Deploy worker: PM2, systemd, or direct (see `CANVAS_WORKER_DEPLOYMENT.md`)
5. Set env vars in Amplify console (see `PRODUCTION_SETUP_CHECKLIST.md` PART 4)
6. Push to Amplify: `git push`

### Troubleshooting

- **OAuth button missing?** Check env vars in Amplify console (names must match exactly)
- **Password reset email not arriving?** Check SES sandbox status, verify sender email
- **Canvas import not showing?** Check worker is running (`pm2 list`)
- **Progress bar stuck?** Check worker logs (`pm2 logs canvas-worker`)

See specific docs for detailed troubleshooting.

---

## ✅ Status

- ✅ OAuth implemented (4 providers)
- ✅ Email configured (AWS SES)
- ✅ Canvas import UI complete
- ✅ Worker background processor ready
- ✅ Multi-user safe
- ✅ Amplify compatible

Ready to deploy! 🚀
