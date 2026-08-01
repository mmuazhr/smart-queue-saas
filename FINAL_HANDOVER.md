# 🚀 Smart Queue SaaS — Final Project Handover

Congratulations! Your Smart Queue SaaS platform is now fully built, production-ready, and connected to cloud infrastructure. This document outlines everything you need for a successful "Go Live" launch.

## 🏗️ Technical Architecture
- **Framework**: Next.js 15+ (App Router)
- **Database**: Supabase PostgreSQL + Prisma ORM
- **Media**: Supabase Storage (Persistent cloud photo storage)
- **Auth**: NextAuth.js v5 (Secure merchant & admin roles)
- **Theme**: Premium Light/Dark mode system
- **PWA**: Fully installable mobile experience with offline caching for images

## 🗝️ Essential Credentials
The database has been seeded with a production-ready environment. You can immediately access the dashboard using:

- **Admin Dashboard**: `admin@smartqueue.my` / `admin123`
- **Merchant Demo**: `merchant@test.my` / `merchant123`
- **Live Storefront URL**: `http://localhost:3000/store/abang-burger`

## 💳 Payment Flow

There is no payment gateway integration — QueLess never touches customer money. Each merchant connects their own bank account via a DuitNow QR code:

1. **Merchant setup** (Settings → Payments & Charges): upload a DuitNow QR code, add optional payment instructions (e.g. "Transfer to Maybank ..."), and configure up to 5 charges (e.g. SST 6%, Service 10%) — each applied flat on the order subtotal, never compounded.
2. **Customer pays**: at checkout the customer picks Scan & Pay (QR) or Pay at Counter (cash) — both follow the same confirm flow. For QR, the customer scans the merchant's code in their own banking app, then uploads a screenshot of the payment as proof.
3. **Merchant confirms**: the order sits in an "Unconfirmed" column on the dashboard with the uploaded receipt visible. The customer's queue number is issued only once the merchant confirms the payment — never before. Cash orders go through the same confirm gate.
4. **Order lifecycle**: confirmed → accepted → preparing → ready → completed, same as before.

## 🏁 Launch Checklist (The Last 3 Steps)

To move from your computer to a live public website, do the following:

### 1. Supabase Infrastructure
Ensure you have created a **Public** storage bucket in your Supabase dashboard named exactly **`products`**. Without this, the food photo upload feature will not work.

### 2. Live Notifications
Add your `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_FROM_NUMBER` to your `.env` to enable real-time SMS alerts for customers.

### 3. Deploy to Vercel
1. Upload this folder to a GitHub repository.
2. Connect the repository to [Vercel](https://vercel.com).
3. Copy **every line** from your `.env` file into the "Environment Variables" section of your Vercel project settings.
4. Deploy!

## 🛠️ Maintenance & Scaling
- **Adding Features**: The project is modular. Payment charge logic lives in `src/lib/charges.ts`; new notification types go in `src/lib/notifications/`.
- **Database Schema**: To change your data structure, edit `prisma/schema.prisma` and run `npx prisma db push`.
- **Scaling**: Supabase and Vercel will automatically scale as you add more merchants and customers.

---

**You're all set! It's been a pleasure building this premium SaaS platform with you. Good luck with the launch!**
