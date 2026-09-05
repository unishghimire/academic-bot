# Student Payment & Proof Verification Portal (Vercel Deployment)

This directory contains the standalone, public-facing **Student Payment & Proof Portal**.
It is completely decoupled from administrative tools and contains **zero admin links or references**.

---

## 🚀 How to Deploy to Vercel

### Option 1: Via Vercel Web Dashboard (Recommended)
1. Go to [vercel.com/new](https://vercel.com/new).
2. Import your GitHub repository: `https://github.com/unishghimire/academic-bot`.
3. In the configuration step:
   - **Project Name**: `academy-student-checkout` (or any custom name)
   - **Framework Preset**: `Other`
   - **Root Directory**: Click **Edit** and choose `deployments/student-checkout`.
   - **Build Command**: Leave empty.
   - **Output Directory**: Leave empty.
4. Click **Deploy**!

### Option 2: Via Vercel CLI
```bash
cd deployments/student-checkout
npx vercel --prod
```

---

## ⚙️ Connecting to your Express Backend

When deployed separately on Vercel, this portal needs to know where your backend API server is located.

1. Open `index.html` in this folder.
2. Find the `<meta name="backend-api-url" content="...">` tag near line 15.
3. Put your live backend URL (e.g. Railway, Render, VPS, or ngrok) in the `content` attribute:
   ```html
   <meta name="backend-api-url" content="https://your-bot-backend.railway.app">
   ```
4. Save and redeploy. All payment methods, QR codes, and proof submissions will seamlessly communicate with your backend.
