# Quick Deploy to Vercel

## Fastest Method (CLI - Already Installed ✅)

### 1. Make sure your code is committed
```bash
git add .
git commit -m "Ready for deployment"
git push
```

### 2. Deploy to Vercel
```bash
# Login (if not already logged in)
vercel login

# Deploy (first time will ask questions)
vercel

# Deploy to production
vercel --prod
```

### 3. Set Environment Variables

**IMPORTANT**: You MUST set these environment variables in Vercel Dashboard:

1. Go to: https://vercel.com/dashboard
2. Click on your project
3. Go to **Settings** → **Environment Variables**
4. Add each variable (select Production, Preview, and Development for each):

```
REACT_APP_FIREBASE_API_KEY
REACT_APP_FIREBASE_AUTH_DOMAIN
REACT_APP_FIREBASE_PROJECT_ID
REACT_APP_FIREBASE_STORAGE_BUCKET
REACT_APP_FIREBASE_MESSAGING_SENDER_ID
REACT_APP_FIREBASE_APP_ID
REACT_APP_FIREBASE_DATABASE_URL
REACT_APP_OPENAI_API_KEY
```

5. After adding variables, **redeploy** your project (or push a new commit)

### 4. Get Your Values

Get your environment variable values from:
- **Firebase**: Your `.env.local` file or Firebase Console → Project Settings → General → Your apps
- **OpenAI**: Your OpenAI account dashboard

---

## Alternative: Deploy via Dashboard

1. Go to: https://vercel.com/new
2. Import your Git repository
3. Configure:
   - Framework: Create React App (auto-detected)
   - Build Command: `npm run build`
   - Output Directory: `build`
4. Add environment variables (see step 3 above)
5. Click Deploy

---

## Your App Will Be Live At:
`https://your-project-name.vercel.app`

---

## After Deployment

1. **Update Firebase Authorized Domains**:
   - Firebase Console → Authentication → Settings → Authorized domains
   - Add: `your-project-name.vercel.app`

2. **Test your app** at the Vercel URL

---

## Need to Update Environment Variables?

1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables
2. Add/Edit variables
3. Redeploy (or push a new commit)



