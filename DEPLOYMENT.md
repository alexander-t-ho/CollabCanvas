# Deploying CollabCanvas to Vercel

This guide will walk you through deploying your CollabCanvas application to Vercel.

## Prerequisites

- ✅ Vercel account (you mentioned you already have one)
- ✅ Git repository (your code should be committed)
- ✅ Firebase project configured
- ✅ OpenAI API key

## Step 1: Ensure Your Code is Committed

Make sure all your changes are committed to Git:

```bash
git add .
git commit -m "Ready for production deployment"
git push origin main
```

## Step 2: Deploy via Vercel Dashboard (Recommended)

### Option A: Import from Git Repository

1. **Go to Vercel Dashboard**
   - Visit [https://vercel.com/dashboard](https://vercel.com/dashboard)
   - Click **"Add New..."** → **"Project"**

2. **Import Your Repository**
   - If your code is on GitHub, GitLab, or Bitbucket, Vercel will detect it
   - Select your `collabcanvas` repository
   - Click **"Import"**

3. **Configure Project Settings**
   - **Framework Preset**: Vercel should auto-detect "Create React App"
   - **Root Directory**: Leave as `./` (or set if your project is in a subdirectory)
   - **Build Command**: `npm run build` (should be auto-filled)
   - **Output Directory**: `build` (should be auto-filled)
   - **Install Command**: `npm install` (should be auto-filled)

4. **Add Environment Variables**
   This is CRITICAL! Click **"Environment Variables"** and add all of these:

   ```
   REACT_APP_FIREBASE_API_KEY=your_firebase_api_key
   REACT_APP_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
   REACT_APP_FIREBASE_PROJECT_ID=your_project_id
   REACT_APP_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
   REACT_APP_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
   REACT_APP_FIREBASE_APP_ID=your_app_id
   REACT_APP_FIREBASE_DATABASE_URL=https://your_project-default-rtdb.firebaseio.com
   REACT_APP_OPENAI_API_KEY=your_openai_api_key
   ```

   **Important**: Add each variable for **Production**, **Preview**, and **Development** environments.

5. **Deploy**
   - Click **"Deploy"**
   - Wait for the build to complete (usually 2-3 minutes)

6. **Access Your App**
   - Once deployed, Vercel will provide you with a URL like: `https://collabcanvas-xxx.vercel.app`
   - You can also set up a custom domain later

## Step 3: Deploy via Vercel CLI (Alternative)

If you prefer using the command line:

### Install Vercel CLI

```bash
npm install -g vercel
```

### Login to Vercel

```bash
vercel login
```

### Deploy

```bash
# First deployment (follow prompts)
vercel

# For production deployment
vercel --prod
```

### Set Environment Variables via CLI

```bash
# Set Firebase variables
vercel env add REACT_APP_FIREBASE_API_KEY production
vercel env add REACT_APP_FIREBASE_AUTH_DOMAIN production
vercel env add REACT_APP_FIREBASE_PROJECT_ID production
vercel env add REACT_APP_FIREBASE_STORAGE_BUCKET production
vercel env add REACT_APP_FIREBASE_MESSAGING_SENDER_ID production
vercel env add REACT_APP_FIREBASE_APP_ID production
vercel env add REACT_APP_FIREBASE_DATABASE_URL production

# Set OpenAI variable
vercel env add REACT_APP_OPENAI_API_KEY production

# Repeat for preview and development environments if needed
```

## Step 4: Verify Deployment

After deployment:

1. **Check the Build Logs**
   - Go to your project dashboard on Vercel
   - Check the "Deployments" tab for any errors

2. **Test Your App**
   - Visit your deployed URL
   - Test authentication (login/signup)
   - Test canvas functionality
   - Test AI features

3. **Check Environment Variables**
   - Go to Settings → Environment Variables
   - Verify all variables are set correctly

## Step 5: Configure Firebase for Production

### Update Firebase Authorized Domains

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Go to **Authentication** → **Settings** → **Authorized domains**
4. Add your Vercel domain: `your-app.vercel.app`

### Update Firestore Rules (if needed)

Make sure your Firestore security rules allow access from your production domain.

## Troubleshooting

### Build Fails

- Check build logs in Vercel dashboard
- Ensure all dependencies are in `package.json`
- Verify Node.js version compatibility (Vercel uses Node 18.x by default)

### Environment Variables Not Working

- Make sure variable names start with `REACT_APP_` (required for Create React App)
- Redeploy after adding environment variables
- Check that variables are set for the correct environment (Production/Preview/Development)

### App Works Locally But Not in Production

- Check browser console for errors
- Verify Firebase project settings
- Check CORS settings in Firebase
- Verify all environment variables are set

### Common Issues

1. **"Module not found" errors**: Run `npm install` locally and commit `package-lock.json`
2. **Firebase errors**: Double-check all Firebase config values
3. **OpenAI API errors**: Verify your API key is correct and has credits

## Continuous Deployment

Once linked to Git, Vercel will automatically deploy:
- **Production**: Every push to `main` branch
- **Preview**: Every pull request gets a preview URL

## Next Steps

- Set up a custom domain (optional)
- Configure analytics (optional)
- Set up monitoring and error tracking
- Review and optimize build settings

## Need Help?

- Vercel Documentation: https://vercel.com/docs
- Vercel Support: https://vercel.com/support



