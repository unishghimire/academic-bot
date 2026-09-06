# 🎓 Custom Academy Bot & Management System

> The central management system for the **Premium AI Video Ads Academy**. Automates the complete student journey: account linking, payment verification, tier unlocking, Discord role/channel synchronization, interactive quizzes, assignments, AI video ads commands, and administrative operations.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-green.svg)](https://nodejs.org/)
[![Discord.js](https://img.shields.io/badge/Discord.js-v14-5865F2.svg)](https://discord.js.org/)
[![Prisma](https://img.shields.io/badge/Prisma-ORM-2D3748.svg)](https://www.prisma.io/)
[![Tests](https://img.shields.io/badge/Tests-22%20Passed-success.svg)](https://vitest.dev/)

---

## 🏛️ Core Architectural Principle

> **Discord role ≠ source of truth. The database is.**
>
> • The bot never trusts a Discord command or user claim as proof of payment.  
> • Payment state comes exclusively from signature-verified webhooks or reviewed manual payments.  
> • Tier progression is calculated by one central rule evaluator, never manual bot actions.  
> • Discord roles are a presentation cache of the database state. If a role is wrong or tampered with, the periodic role reconciler strips or restores it within minutes.

---

## ⚡ Tech Stack

- **Bot Runtime:** Node.js 20+, TypeScript, discord.js v14
- **Database:** PostgreSQL (Neon / Supabase), accessed via Prisma ORM
- **Backend API & Webhooks:** Express.js (raw Stripe webhook signature verification, watch progress ingestion, account linking)
- **Admin Panel & Student Portal:** HTML5, Vanilla CSS (dark-mode glassmorphism), Vanilla JavaScript — now maintained as standalone repositories (see below)
- **Payments:** Stripe Subscriptions + Manual/Offline Payment Verification Queue
- **Gamification:** Append-only XP ledger, streaks, and milestone achievements
- **Testing:** Vitest (100% pass across 22 test suites)

---

## 📦 Repository Structure

This monolith has been split into three repositories:

| Repository | Purpose |
|---|---|
| `academic-bot` (this repo) | Discord bot, Express API & webhooks, Prisma database, tier engine, jobs |
| `academic-student-portal` | Public student payment & proof submission portal (Vercel) |
| `academic-admin-panel` | Private staff dashboard for payment verification (Vercel) |

> The `public/` directory still contains bundled copies of both portals so the Express server can serve them locally / from a single origin. The standalone repositories are the source of truth for the deployed portals — set the `backend-api-url` meta tag in their `index.html` to point them at this backend's API.

---

## 🚀 Features

### 1. 🛡️ Admin Panel Web Dashboard (`/admin`)
- Accessible at `http://localhost:3000/admin` (secured with `ADMIN_PANEL_KEY`).
- **Live Metrics:** Real-time counters for pending verifications, active subscribers, verified manual revenue, and student tier breakdown.
- **Manual Payment Verification Queue:**
  - Review student payment proofs with Name, Phone Number, Transaction ID, Amount, Payment Method, and Receipt Link.
  - One-click **Approve** (with custom duration and tier) ➔ activates database subscription, writes audit entry, and syncs Discord roles immediately.
  - **Reject** modal with mandatory reason note.
  - **Record Direct Payment** to log offline cash/wire payments on the spot.
- **Student Directory:** Search students, view linked Discord IDs, edit tier levels with audited reasons.
- **Audit Trail:** Live chronological inspection of all privileged actions.

### 2. 🧾 Student Payment Proof Portal (`/submit-proof.html`)
- Accessible at `http://localhost:3000/submit-proof.html`.
- Responsive form capturing student full name, phone number, email, Discord username, payment method, transaction reference ID, and receipt URL.
- Instant submission feedback and automated staff alerts on Discord.

### 3. 🎯 Central Tier Unlock Engine
- **Tier 1:** Unlocked immediately with active subscription.
- **Tier 2:** Requires 100% of Tier 1 lessons (video watched ≥ 90% + quiz passed + assignment approved) **AND** an approved Tier 1 final capstone project.
- **Tier 3:** Requires 100% of Tier 2 requirements **AND** approved Tier 2 capstone project.
- **Graduate:** Requires 100% of Tier 3 requirements.
- Admin overrides are recorded in the immutable audit log and evaluated with full traceability.

### 4. 🔄 Idempotent Role Reconciler
- Sweeps linked Discord members periodically (every 10 minutes) and on-demand.
- Compares database state against Discord roles.
- Grants missing roles (`@Premium`, `@Tier-1`, etc.) and strips rogue assignments (e.g. manually added `@Tier-3`).

### 5. 🤖 Discord Slash Commands
- **Student:** `/link`, `/subscription`, `/progress`, `/continue`
- **Coursework & Submissions:** `/submit assignment`, `/submit project`
- **Course Navigation:** `/course lesson`, `/course quiz`, `/course next`, `/course assignment`, `/course project`
- **Gamification:** `/xp`, `/rank`, `/leaderboard`, `/challenge`
- **Support:** `/support` (automatically provisions private ticket channels)
- **Instructor Review:** `/assignment-review`, `/project-review`, `/student-progress`
- **Admin:** `/setup-server`, `/admin-dashboard`, `/grant-premium`, `/revoke-premium`, `/unlock-tier`, `/add-xp`, `/broadcast`, `/server-stats`, `/reset-progress`

---

## 🛠️ Quickstart & Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env` and fill in your credentials:
```bash
cp .env.example .env
```
Key variables:
- `DATABASE_URL`: PostgreSQL connection string (Neon or Supabase).
- `DISCORD_TOKEN`: Bot token from Discord Developer Portal.
- `DISCORD_CLIENT_ID`: Bot Application ID.
- `DISCORD_GUILD_ID`: Your Discord Server ID.
- `ADMIN_PANEL_KEY`: Password to unlock `/admin` dashboard.

### 3. Automatically Provision Discord Server Structure
Run the 1-click server provisioner to create all roles, categories, and channels with locked permissions:
```bash
npm run setup:server
```
*(This automatically updates your `.env` with all created role and channel IDs!)*

### 4. Push Database Schema
```bash
npx prisma db push
```

### 5. Deploy Slash Commands to Discord
```bash
npm run deploy:commands
```

### 6. Start the Application
```bash
npm run dev
# or for production:
npm run build && npm start
```

---

## 🧪 Testing

Run the automated test suite with Vitest:
```bash
npm test
```
Validates tier evaluation prerequisites, subscription lifecycle, role sync idempotency, rogue role stripping, linking TTL, and manual payment workflows.

---

## 📄 License
MIT License. Built for the **Premium AI Video Ads Academy**.
