# Bullet Journal

Personal analog-inspired digital bullet journal. Daily logs, collections, meal tracking, and multi-view calendar — all in one place.

## Features

- **Daily view** — tasks, events, notes, priorities with drag-to-reorder
- **Weekly view** — 7-day overview with optional meal overlay
- **Monthly view** — list layout with entry text
- **Yearly view** — event-focused, month-by-month
- **Collections** — custom lists with icons
- **Meal tracking** — breakfast, lunch, snack, dinner per day
- **Entry filters** — filter by type across all views
- **Dark mode** — auto-detects system preference
- **Mobile responsive** — hamburger sidebar on small screens
- **Password auth** — single-user, cookie-based session

## Stack

- Next.js 16 (App Router)
- Prisma + PostgreSQL (Supabase)
- No UI library — custom CSS

## Local Setup

1. Clone and install:
   ```bash
   npm install
   ```

2. Create `.env`:
   ```env
   DATABASE_URL="postgresql://..."
   DIRECT_URL="postgresql://..."
   AUTH_PASSWORD="your-password"
   AUTH_SECRET="your-secret-token"
   ```

3. Run migrations:
   ```bash
   npx prisma migrate deploy
   ```

4. Start dev server:
   ```bash
   npm run dev
   ```

