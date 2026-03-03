# Quick Start - Authentication with Test Credentials

Everything is set up and ready to test! No database required for initial testing.

---

## 🧪 Test Credentials (Hardcoded)

```
Email:    test@oghmanotes.io
Password: password123
```

Use these to login immediately without any database setup.

---

## 🚀 How It Works

### **Without Database** (Development Mode)
```
✅ Login/Register works with hardcoded test user
✅ Session cookie created
✅ /notes page protected and accessible
✅ Logout works
❌ Password reset emails log to console (SES not ready)
```

### **With Database** (Production)
```
✅ All above features + multiple users
✅ Real password reset emails via AWS SES
✅ User data persisted in PostgreSQL
✅ Full auth flow enabled
```

---

## 🧑‍💻 Test Flow (No DB Required)

### 1. **Start Dev Server**
```bash
pnpm dev
```

### 2. **Visit Login Page**
```
http://localhost:3000/login
```

### 3. **Enter Test Credentials**
```
Email:    test@oghmanotes.io
Password: password123
```

### 4. **You're In!**
- ✅ Redirects to `/notes`
- ✅ Session cookie created
- ✅ User data loaded in sidebar
- ✅ Logout button visible (bottom of icon nav)

### 5. **Try Logout**
- Click logout button (exit icon at bottom left)
- You're redirected to `/notes` → then to `/login`
- Session cleared

### 6. **Try Protected Routes**
- Try accessing `/notes` directly without login
- You're redirected to `/login` automatically
- Middleware protects it

---

## 🔍 Key Files

| File | Purpose |
|------|---------|
| `src/lib/test-credentials.js` | Hardcoded test user |
| `src/middleware.ts` | Route protection |
| `src/components/providers/AuthProvider.tsx` | Auth context |
| `src/hooks/useAuth.ts` | Auth hook for components |
| `src/app/api/auth/login/route.js` | Updated to use test credentials |
| `src/components/sidebar/icon-nav.tsx` | Logout button |

---

## 🌍 Auth Flow Diagram

```
LOGIN PAGE
  ↓
  [Enter: test@oghmanotes.io / password123]
  ↓
POST /api/auth/login
  ├─ Check test credentials (no DB needed!)
  ├─ Generate JWT token
  ├─ Create session cookie (HttpOnly)
  ↓
REDIRECT TO /NOTES
  ↓
MIDDLEWARE CHECK
  ├─ Validates session cookie
  ├─ Verifies JWT token
  ↓
/NOTES PAGE LOADS
  ├─ AuthGuard checks user
  ├─ NotesProviders wrap UI
  ├─ VSCodeLayout renders
  ├─ Logout button visible
  ↓
CLICK LOGOUT
  ├─ POST /api/auth/logout
  ├─ Session cookie cleared
  ├─ Redirects to /login
  ↓
BACK AT LOGIN
```

---

## 🔐 Security Features Active

✅ **Passwords**: bcrypt hashed (even test credentials)
✅ **JWT**: HS256 signed tokens (24h expiry)
✅ **Cookies**: HttpOnly, Secure, SameSite=Lax
✅ **Route Protection**: Middleware guards `/notes`
✅ **Rate Limiting**: Active on login attempts
✅ **Account Lockout**: 30 mins after 5 failed attempts

---

## 🐛 If Something Goes Wrong

### "Invalid credentials" on login
- Check spelling: `test@oghmanotes.io` (not .com)
- Check password: `password123`

### Redirected to login after clicking logout
- ✅ This is correct behavior!
- You've been logged out

### Can access /notes without login
- ❌ Middleware should prevent this
- Check that middleware.ts exists and build was successful
- Restart dev server: `pnpm dev`

### "useAuth must be used within an AuthProvider" error
- Make sure root layout includes `<AuthProvider>`
- Check `src/app/layout.js` has AuthProvider wrapper

---

## 🎯 What's Different from Production

| Feature | Dev (No DB) | Production |
|---------|-----------|-----------|
| Test user login | ✅ Hardcoded | ❌ N/A |
| Multiple users | ❌ No | ✅ Yes |
| Database required | ❌ No | ✅ Yes (PostgreSQL) |
| Password reset emails | ❌ Logs to console | ✅ AWS SES |
| Session persistence | ⚠️ Memory only | ✅ Database |

---

## 📝 When Database Comes Online

1. Update `.env.local`:
   ```
   DATABASE_URL="postgresql://user:pass@host:5432/oghma"
   ```

2. Run migrations:
   ```
   pnpm db:migrate
   ```

3. Login will fall back to database automatically
   - Test credentials still work (hardcoded check first)
   - New users can register
   - Passwords reset via AWS SES

---

## 📚 Full Documentation

- **Complete Auth Guide**: `docs/AUTH_INTEGRATION.md`
- **Database Setup**: `docs/PRISMA_SETUP.md`
- **Middleware Logic**: Check `src/middleware.ts`
- **Auth Provider**: Check `src/components/providers/AuthProvider.tsx`

---

## ✨ You're Ready!

Just run:
```bash
pnpm dev
```

And navigate to `http://localhost:3000/login` to test! 🚀
