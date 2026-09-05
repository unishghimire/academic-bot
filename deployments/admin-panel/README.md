# Staff Admin Dashboard (Vercel Deployment)

This directory contains the standalone, private **Staff Admin Dashboard**.
It is completely decoupled from the student portal and can be hosted on its own private Vercel project or subdomain (e.g. `admin.theelitecircle.com` or `academy-staff-hub.vercel.app`).

---

## 🚀 How to Deploy to Vercel

### Option 1: Via Vercel Web Dashboard (Recommended)
1. Go to [vercel.com/new](https://vercel.com/new).
2. Import your GitHub repository: `https://github.com/unishghimire/academic-bot`.
3. In the configuration step:
   - **Project Name**: `academy-admin-portal` (or any custom private name)
   - **Framework Preset**: `Other`
   - **Root Directory**: Click **Edit** and choose `deployments/admin-panel`.
   - **Build Command**: Leave empty.
   - **Output Directory**: Leave empty.
4. Click **Deploy**!

### Option 2: Via Vercel CLI
```bash
cd deployments/admin-panel
npx vercel --prod
```

---

## 🔒 Security & Connecting to Backend

1. **No Credentials in Code**: There are no hardcoded secrets or passwords in this repository.
2. **Accessing the Dashboard**:
   - Open your deployed admin Vercel URL.
   - Enter your `ADMIN_PANEL_KEY` (configured in your backend `.env`).
   - If your backend is hosted on Railway/Render/VPS, simply type your backend URL into the **"Backend API URL (Optional)"** box (e.g. `https://your-bot-backend.railway.app`). The admin panel remembers this in your browser's secure local storage.
3. Click **Unlock Dashboard** to access the live database queue, verify payment proofs, manage QR codes, and trigger automated Discord roles.
