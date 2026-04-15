# Premium Web App — Landing Page + Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a $50k-quality dark futuristic landing page and a fully functional dashboard for the PA MCP app. Landing page showcases all features (Habits, Tasks, Documents, Finance, Goals, Reviews). Dashboard pulls real data from Supabase. All UI built using 21st.dev Magic MCP components.

**Architecture:** All pages in the existing `devfrend-personal-assitant` Next.js 16 repo. Public routes (`/`, `/login`, `/signup`) are unauthenticated. Dashboard routes (`/dashboard/*`) are behind Supabase Auth using a layout-level auth guard. Server Components by default, `'use client'` only for interactive parts.

**Tech Stack:** Next.js 16.2.3 (existing), Supabase Auth (existing), Tailwind CSS v4, Framer Motion, 21st.dev Magic MCP (UI components), `next/font` (Geist), `next/image`

**Theme:** Dark (#0a0a0f base, #111827 surfaces, #3b82f6 blue accent, #8b5cf6 purple secondary, glassmorphism with `backdrop-blur-xl bg-white/5 border border-white/10`)

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `tailwind.config.ts` | Tailwind config with dark theme, custom colors, glassmorphism utilities |
| `app/globals.css` | Global styles, Tailwind imports, custom utilities |
| `app/page.tsx` | Landing page (replace existing placeholder) |
| `app/layout.tsx` | Root layout (update with font, Tailwind, metadata) |
| `app/(auth)/login/page.tsx` | Login page |
| `app/(auth)/signup/page.tsx` | Signup page |
| `app/(auth)/layout.tsx` | Auth layout (centered, dark bg) |
| `app/dashboard/layout.tsx` | Dashboard layout with sidebar + auth guard |
| `app/dashboard/page.tsx` | Dashboard overview |
| `app/dashboard/habits/page.tsx` | Habits module page |
| `app/dashboard/tasks/page.tsx` | Tasks module page |
| `app/dashboard/finance/page.tsx` | Finance module page |
| `app/dashboard/documents/page.tsx` | Documents module page |
| `app/dashboard/goals/page.tsx` | Goals module page |
| `lib/supabase/client.ts` | Browser-side Supabase client for dashboard |
| `components/landing/Hero.tsx` | Hero section with animated chat |
| `components/landing/Features.tsx` | Feature cards grid |
| `components/landing/HowItWorks.tsx` | 3-step flow |
| `components/landing/ReviewShowcase.tsx` | Mock review conversation |
| `components/landing/TechStrip.tsx` | Tech badges strip |
| `components/landing/FooterCTA.tsx` | Footer with CTA |
| `components/landing/Navbar.tsx` | Top navigation bar |
| `components/landing/ChatAnimation.tsx` | Typing animation for mock Claude chat |
| `components/dashboard/Sidebar.tsx` | Dashboard sidebar navigation |
| `components/dashboard/SummaryCard.tsx` | Stat summary card (reusable) |
| `components/dashboard/AuthGuard.tsx` | Client-side auth check + redirect |

### Modified Files
| File | Change |
|------|--------|
| `package.json` | Add tailwindcss, framer-motion, @tailwindcss/postcss |
| `next.config.ts` | Add image domains if needed |
| `CLAUDE.md` | Add web app section |

---

## Task 1: Install Dependencies + Tailwind Setup

**Files:**
- Modify: `package.json`
- Create: `tailwind.config.ts`
- Create: `app/globals.css`
- Create: `postcss.config.mjs`

- [ ] **Step 1: Install Tailwind CSS v4 + Framer Motion + Geist font**

```bash
cd "/Volumes/maersk/amargupta/Documents/Latest Projects/Portfolio Project/devfrend-personal-assitant"
npm install tailwindcss @tailwindcss/postcss framer-motion geist
```

- [ ] **Step 2: Create PostCSS config**

Create `postcss.config.mjs`:

```javascript
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
```

- [ ] **Step 3: Create globals.css**

Create `app/globals.css`:

```css
@import "tailwindcss";

@theme {
  --color-bg-primary: #0a0a0f;
  --color-bg-surface: #111827;
  --color-bg-card: rgba(255, 255, 255, 0.05);
  --color-accent-blue: #3b82f6;
  --color-accent-purple: #8b5cf6;
  --color-accent-cyan: #06b6d4;
  --color-text-primary: #f9fafb;
  --color-text-secondary: #9ca3af;
  --color-text-muted: #6b7280;
  --color-border-glass: rgba(255, 255, 255, 0.1);
  --font-sans: 'Geist', system-ui, -apple-system, sans-serif;
}

body {
  background-color: var(--color-bg-primary);
  color: var(--color-text-primary);
  font-family: var(--font-sans);
  -webkit-font-smoothing: antialiased;
}

/* Glassmorphism utility */
.glass {
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

/* Glow effect */
.glow-blue {
  box-shadow: 0 0 40px rgba(59, 130, 246, 0.3), 0 0 80px rgba(59, 130, 246, 0.1);
}

.glow-purple {
  box-shadow: 0 0 40px rgba(139, 92, 246, 0.3), 0 0 80px rgba(139, 92, 246, 0.1);
}

/* Gradient text */
.gradient-text {
  background: linear-gradient(135deg, #3b82f6, #8b5cf6, #06b6d4);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

/* Smooth scroll */
html {
  scroll-behavior: smooth;
}
```

- [ ] **Step 4: Commit**

```bash
git add postcss.config.mjs app/globals.css package.json package-lock.json
git commit -m "feat(web): add Tailwind CSS v4, Framer Motion, Geist font, dark theme"
```

---

## Task 2: Update Root Layout

**Files:**
- Modify: `app/layout.tsx`

- [ ] **Step 1: Update root layout with font + globals**

Replace `app/layout.tsx`:

```tsx
import type { Metadata } from 'next'
import { GeistSans } from 'geist/font/sans'
import './globals.css'

export const metadata: Metadata = {
  title: 'PA MCP — Your AI Personal Assistant',
  description: 'Track habits, manage tasks, store documents, monitor spending, set goals — and ask Claude anything about your life.',
  openGraph: {
    title: 'PA MCP — Your AI Personal Assistant',
    description: 'One MCP to rule them all. Habits, Tasks, Documents, Finance, Goals — powered by Claude.',
    type: 'website',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={GeistSans.className}>
      <body className="bg-bg-primary text-text-primary antialiased">
        {children}
      </body>
    </html>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add app/layout.tsx
git commit -m "feat(web): update root layout with Geist font, dark theme, OG metadata"
```

---

## Task 3: Browser-side Supabase Client

**Files:**
- Create: `lib/supabase/client.ts`

- [ ] **Step 1: Create browser Supabase client**

Create `lib/supabase/client.ts`:

```typescript
'use client'

import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/supabase/client.ts
git commit -m "feat(web): add browser-side Supabase client"
```

---

## Task 4: Landing Page — Navbar

**Files:**
- Create: `components/landing/Navbar.tsx`

- [ ] **Step 1: Build Navbar using Magic MCP**

Use 21st.dev Magic MCP to generate a dark, premium navigation bar component. Requirements:
- Dark glassmorphic background
- Logo text "PA MCP" on left with gradient
- Nav links: Features, How It Works, Dashboard
- CTA button: "Get Started" (glowing blue)
- Sticky top, blur backdrop on scroll

Call `mcp__magic__21st_magic_component_builder` with:
- message: "Dark premium navbar with glassmorphism, logo on left, nav links center, CTA button right, sticky with backdrop blur"
- searchQuery: "dark navbar glassmorphism"
- standaloneRequestQuery: "Create a dark themed premium navigation bar with glassmorphic background, PA MCP logo text with gradient on left, centered nav links (Features, How It Works, Dashboard), and a glowing blue Get Started CTA button on right. Should be sticky with backdrop blur on scroll. Dark futuristic aesthetic like Linear.app."
- absolutePathToCurrentFile: `components/landing/Navbar.tsx`
- absolutePathToProjectDirectory: `/Volumes/maersk/amargupta/Documents/Latest Projects/Portfolio Project/devfrend-personal-assitant`

After Magic returns the snippet, save to `components/landing/Navbar.tsx` and adapt colors to match theme.

- [ ] **Step 2: Commit**

```bash
git add components/landing/Navbar.tsx
git commit -m "feat(web): add premium glassmorphic navbar"
```

---

## Task 5: Landing Page — Hero Section with Chat Animation

**Files:**
- Create: `components/landing/ChatAnimation.tsx`
- Create: `components/landing/Hero.tsx`

- [ ] **Step 1: Build ChatAnimation component**

Create `components/landing/ChatAnimation.tsx` — a typing animation showing a mock Claude conversation:

```
User: "mera April review do"

Claude: "April kaafi productive raha! Here's your review:

🏋️ Workout streak: 21 days strong
📋 Tasks: 12 completed, 3 pending
💰 Spending: ₹32,450 — Food ₹8.2k, Transport ₹4.1k
🎯 Goals: 2 hit, 1 at 65%

Biggest spend: ₹5,000 at Croma"
```

Use Framer Motion for:
- Message bubbles appearing one by one
- Typing dots animation
- Number counters animating up
- Subtle glow on the Claude response bubble

Call `mcp__magic__21st_magic_component_builder` with:
- message: "Animated chat conversation component with typing effect, message bubbles, dark theme"
- searchQuery: "chat animation typing"
- standaloneRequestQuery: "Create an animated mock chat conversation component. Shows a user message bubble and an AI response bubble with typing dots that transition to the full response. Dark theme, glassmorphic message bubbles. The user message says 'mera April review do' and the AI response shows a formatted review with emoji stats. Use framer-motion for entrance animations and typing effect."
- absolutePathToCurrentFile: `components/landing/ChatAnimation.tsx`
- absolutePathToProjectDirectory: `/Volumes/maersk/amargupta/Documents/Latest Projects/Portfolio Project/devfrend-personal-assitant`

- [ ] **Step 2: Build Hero section**

Call `mcp__magic__21st_magic_component_builder` with:
- message: "Dark futuristic hero section with large headline, subtitle, CTA button, and animated visual on right"
- searchQuery: "dark hero section gradient"
- standaloneRequestQuery: "Create a dark futuristic hero section. Left side: large bold headline 'Your AI Personal Assistant' with gradient text, subtitle 'Track habits, manage tasks, store documents, monitor spending, set goals — and ask Claude anything about your life.', glowing blue CTA button 'Get Started' and secondary ghost button 'Learn More'. Right side: space for a ChatAnimation component. Dark gradient background #0a0a0f to #111827. Radial gradient glow behind the chat. Full viewport height."
- absolutePathToCurrentFile: `components/landing/Hero.tsx`
- absolutePathToProjectDirectory: `/Volumes/maersk/amargupta/Documents/Latest Projects/Portfolio Project/devfrend-personal-assitant`

Integrate `ChatAnimation` into the Hero's right side.

- [ ] **Step 3: Commit**

```bash
git add components/landing/ChatAnimation.tsx components/landing/Hero.tsx
git commit -m "feat(web): add hero section with animated mock Claude chat"
```

---

## Task 6: Landing Page — Features Grid

**Files:**
- Create: `components/landing/Features.tsx`

- [ ] **Step 1: Build Features grid**

Call `mcp__magic__21st_magic_component_builder` with:
- message: "Animated feature cards grid with glassmorphism, icons, hover glow effects, dark theme"
- searchQuery: "feature cards grid glassmorphism"
- standaloneRequestQuery: "Create a features section with a heading 'Everything you need. One assistant.' and 5 glassmorphic feature cards in a responsive grid (3 cols on desktop, 1 on mobile). Each card has: an emoji icon, title, 2-line description, subtle border glow on hover with framer-motion scale animation. Cards: 1) 🔥 Habit Tracking — 'Streaks, analytics, completion percentages. Never break the chain.' 2) ✅ Task Management — 'Priority-based workflows. Create, track, and complete tasks.' 3) 📄 Document Wallet — 'Upload bills, certificates. Search by content. Ask questions.' 4) 💰 Finance Tracking — 'Auto-detect UPI payments. Categorize. Ask Claude your spending.' 5) 🎯 Goals & Reviews — 'Set outcome goals. Track progress. Get comprehensive life reviews.' Dark theme, glass cards with bg-white/5 backdrop-blur-xl border-white/10."
- absolutePathToCurrentFile: `components/landing/Features.tsx`
- absolutePathToProjectDirectory: `/Volumes/maersk/amargupta/Documents/Latest Projects/Portfolio Project/devfrend-personal-assitant`

- [ ] **Step 2: Commit**

```bash
git add components/landing/Features.tsx
git commit -m "feat(web): add glassmorphic feature cards grid"
```

---

## Task 7: Landing Page — How It Works

**Files:**
- Create: `components/landing/HowItWorks.tsx`

- [ ] **Step 1: Build How It Works section**

Call `mcp__magic__21st_magic_component_builder` with:
- message: "3-step horizontal flow with connecting lines, numbered steps, icons, dark premium design"
- searchQuery: "steps flow horizontal"
- standaloneRequestQuery: "Create a 'How It Works' section with 3 horizontal steps connected by animated gradient lines. Each step is a glassmorphic card with a large number (01, 02, 03), an icon, title, and description. Step 1: icon 🔗, title 'Connect', desc 'Add PA MCP to Claude Desktop or claude.ai. One-click OAuth setup.' Step 2: icon 📊, title 'Track', desc 'Habits, tasks, documents, spending — everything flows in automatically.' Step 3: icon 💬, title 'Ask', desc 'Kitna kharch hua? My streak? April review do — Claude knows everything.' Dark theme with gradient connecting lines that animate on scroll."
- absolutePathToCurrentFile: `components/landing/HowItWorks.tsx`
- absolutePathToProjectDirectory: `/Volumes/maersk/amargupta/Documents/Latest Projects/Portfolio Project/devfrend-personal-assitant`

- [ ] **Step 2: Commit**

```bash
git add components/landing/HowItWorks.tsx
git commit -m "feat(web): add how-it-works 3-step flow section"
```

---

## Task 8: Landing Page — Review Showcase

**Files:**
- Create: `components/landing/ReviewShowcase.tsx`

- [ ] **Step 1: Build Review Showcase section**

Call `mcp__magic__21st_magic_component_builder` with:
- message: "Full-width showcase section with mock AI conversation showing data visualization, dark theme"
- searchQuery: "data showcase dark section"
- standaloneRequestQuery: "Create a full-width dark section titled 'One question. Complete life review.' Shows a mock Claude conversation where the user asks 'mera April review do' and Claude responds with a beautifully formatted review containing: 1) Habit streaks as horizontal progress bars (Workout 21/30 days, Reading 18/30 days), 2) Task stats as pill badges (12 done, 3 pending, 1 overdue), 3) Spending as a simple horizontal bar chart by category (Food ₹8.2k, Transport ₹4.1k, Shopping ₹6k), 4) Goals as circular progress rings (Save ₹20k: 65%, Learn React Native: 40%). All inside a glassmorphic container. Dark background with subtle radial gradient glow. Framer-motion scroll-triggered entrance animations."
- absolutePathToCurrentFile: `components/landing/ReviewShowcase.tsx`
- absolutePathToProjectDirectory: `/Volumes/maersk/amargupta/Documents/Latest Projects/Portfolio Project/devfrend-personal-assitant`

- [ ] **Step 2: Commit**

```bash
git add components/landing/ReviewShowcase.tsx
git commit -m "feat(web): add review showcase with mock data visualization"
```

---

## Task 9: Landing Page — Tech Strip + Footer CTA

**Files:**
- Create: `components/landing/TechStrip.tsx`
- Create: `components/landing/FooterCTA.tsx`

- [ ] **Step 1: Build Tech Strip**

Call `mcp__magic__21st_magic_component_builder` with:
- message: "Horizontal badge strip showing tech stack logos/icons, dark minimal design"
- searchQuery: "tech stack badges strip"
- standaloneRequestQuery: "Create a horizontal strip of tech/trust badges on dark background. Badges: 'MCP Protocol', 'Supabase PostgreSQL', 'OAuth 2.0 + PKCE', 'End-to-End Auth', 'IST Timezone Native', 'Next.js 16'. Each badge is a pill with subtle border, icon/emoji on left, text on right. Separated by subtle dividers. Centered layout. Dark theme matching #0a0a0f background."
- absolutePathToCurrentFile: `components/landing/TechStrip.tsx`
- absolutePathToProjectDirectory: `/Volumes/maersk/amargupta/Documents/Latest Projects/Portfolio Project/devfrend-personal-assitant`

- [ ] **Step 2: Build Footer CTA**

Call `mcp__magic__21st_magic_component_builder` with:
- message: "Dark premium footer with large CTA, gradient heading, links section"
- searchQuery: "footer CTA dark premium"
- standaloneRequestQuery: "Create a dark premium footer section. Top: large gradient heading 'Ready to take control?' with a glowing blue 'Get Started Free' CTA button. Below: footer links in columns — Product (Features, Dashboard, Pricing), Resources (Documentation, GitHub, API), Connect (Twitter/X, Discord, devfrend.com). Bottom: copyright '© 2026 devfrend. All rights reserved.' Dark background #0a0a0f, subtle top border."
- absolutePathToCurrentFile: `components/landing/FooterCTA.tsx`
- absolutePathToProjectDirectory: `/Volumes/maersk/amargupta/Documents/Latest Projects/Portfolio Project/devfrend-personal-assitant`

- [ ] **Step 3: Commit**

```bash
git add components/landing/TechStrip.tsx components/landing/FooterCTA.tsx
git commit -m "feat(web): add tech strip badges and footer CTA"
```

---

## Task 10: Assemble Landing Page

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: Replace landing page**

Replace `app/page.tsx`:

```tsx
import { Navbar } from '@/components/landing/Navbar'
import { Hero } from '@/components/landing/Hero'
import { Features } from '@/components/landing/Features'
import { HowItWorks } from '@/components/landing/HowItWorks'
import { ReviewShowcase } from '@/components/landing/ReviewShowcase'
import { TechStrip } from '@/components/landing/TechStrip'
import { FooterCTA } from '@/components/landing/FooterCTA'

export default function Home() {
  return (
    <main className="min-h-screen bg-bg-primary">
      <Navbar />
      <Hero />
      <Features />
      <HowItWorks />
      <ReviewShowcase />
      <TechStrip />
      <FooterCTA />
    </main>
  )
}
```

- [ ] **Step 2: Run dev server and verify**

```bash
npm run dev
```

Open `http://localhost:3000` — verify all sections render, animations play, responsive on mobile.

- [ ] **Step 3: Commit**

```bash
git add app/page.tsx
git commit -m "feat(web): assemble landing page with all sections"
```

---

## Task 11: Auth Pages — Login + Signup

**Files:**
- Create: `app/(auth)/layout.tsx`
- Create: `app/(auth)/login/page.tsx`
- Create: `app/(auth)/signup/page.tsx`

- [ ] **Step 1: Create auth layout**

Create `app/(auth)/layout.tsx`:

```tsx
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-bg-primary flex items-center justify-center p-4">
      {children}
    </div>
  )
}
```

- [ ] **Step 2: Build Login page**

Call `mcp__magic__21st_magic_component_builder` with:
- message: "Dark premium login form with glassmorphic card, email/password fields, social login, dark theme"
- searchQuery: "login form dark glassmorphism"
- standaloneRequestQuery: "Create a login page component. Centered glassmorphic card on dark #0a0a0f background. Card contains: 'PA MCP' logo text with gradient at top, 'Welcome back' heading, email input field, password input field, 'Sign In' button with blue gradient (#3b82f6), divider with 'or', 'Sign in with Google' button (outline style), 'Don't have an account? Sign Up' link at bottom. All inputs have dark backgrounds (#1f2937), subtle borders, focus ring blue. Glass card: bg-white/5 backdrop-blur-xl border-white/10 rounded-2xl. This is a Next.js page component using Supabase Auth — on submit call supabase.auth.signInWithPassword and redirect to /dashboard on success."
- absolutePathToCurrentFile: `app/(auth)/login/page.tsx`
- absolutePathToProjectDirectory: `/Volumes/maersk/amargupta/Documents/Latest Projects/Portfolio Project/devfrend-personal-assitant`

Make sure it uses `'use client'`, imports `createClient` from `@/lib/supabase/client`, and calls `supabase.auth.signInWithPassword({ email, password })`. On success, `router.push('/dashboard')`. On error, show error message.

- [ ] **Step 3: Build Signup page**

Call `mcp__magic__21st_magic_component_builder` with:
- message: "Dark premium signup form with glassmorphic card, matching login design"
- searchQuery: "signup form dark"
- standaloneRequestQuery: "Create a signup page component matching the login page design. Glassmorphic card with: 'Create Account' heading, email input, password input, confirm password input, 'Create Account' blue gradient button, 'Already have an account? Sign In' link. Dark theme. Uses Supabase Auth supabase.auth.signUp on submit. Shows success message after signup."
- absolutePathToCurrentFile: `app/(auth)/signup/page.tsx`
- absolutePathToProjectDirectory: `/Volumes/maersk/amargupta/Documents/Latest Projects/Portfolio Project/devfrend-personal-assitant`

- [ ] **Step 4: Commit**

```bash
git add app/\(auth\)/layout.tsx app/\(auth\)/login/page.tsx app/\(auth\)/signup/page.tsx
git commit -m "feat(web): add dark glassmorphic login and signup pages"
```

---

## Task 12: Dashboard Layout — Sidebar + Auth Guard

**Files:**
- Create: `components/dashboard/AuthGuard.tsx`
- Create: `components/dashboard/Sidebar.tsx`
- Create: `app/dashboard/layout.tsx`

- [ ] **Step 1: Create AuthGuard**

Create `components/dashboard/AuthGuard.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.replace('/login')
      } else {
        setUser(user)
      }
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!session) router.replace('/login')
        else setUser(session.user)
      }
    )

    return () => subscription.unsubscribe()
  }, [router])

  if (loading) {
    return (
      <div className="min-h-screen bg-bg-primary flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-accent-blue border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!user) return null

  return <>{children}</>
}
```

- [ ] **Step 2: Build Sidebar**

Call `mcp__magic__21st_magic_component_builder` with:
- message: "Dark glassmorphic sidebar navigation with icons, active state, user avatar at bottom"
- searchQuery: "sidebar navigation dark"
- standaloneRequestQuery: "Create a dark dashboard sidebar component. Fixed left, full height, width 256px. Glassmorphic background (bg-white/5 backdrop-blur-xl). Top: 'PA MCP' logo text with gradient. Navigation items with icons and labels: Overview (home icon), Habits (fire icon), Tasks (check icon), Finance (wallet icon), Documents (file icon), Goals (target icon). Each item: hover bg-white/10, active state with blue left border and blue text. Bottom: Settings link and user email display with Sign Out button. Use next/navigation usePathname for active state detection. Collapsible on mobile."
- absolutePathToCurrentFile: `components/dashboard/Sidebar.tsx`
- absolutePathToProjectDirectory: `/Volumes/maersk/amargupta/Documents/Latest Projects/Portfolio Project/devfrend-personal-assitant`

The Sidebar must use `'use client'`, accept a `userEmail` prop, and call `supabase.auth.signOut()` + `router.push('/login')` for sign out.

- [ ] **Step 3: Create dashboard layout**

Create `app/dashboard/layout.tsx`:

```tsx
import { AuthGuard } from '@/components/dashboard/AuthGuard'
import { Sidebar } from '@/components/dashboard/Sidebar'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <div className="min-h-screen bg-bg-primary flex">
        <Sidebar />
        <main className="flex-1 ml-64 p-8 overflow-auto">
          {children}
        </main>
      </div>
    </AuthGuard>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add components/dashboard/AuthGuard.tsx components/dashboard/Sidebar.tsx app/dashboard/layout.tsx
git commit -m "feat(web): add dashboard layout with auth guard and glassmorphic sidebar"
```

---

## Task 13: Dashboard — Overview Page

**Files:**
- Create: `components/dashboard/SummaryCard.tsx`
- Create: `app/dashboard/page.tsx`

- [ ] **Step 1: Build SummaryCard**

Call `mcp__magic__21st_magic_component_builder` with:
- message: "Stat card with icon, label, large number, trend indicator, dark glassmorphism"
- searchQuery: "stat card dark"
- standaloneRequestQuery: "Create a reusable stat summary card component. Props: icon (emoji string), label (string), value (string), trend (string like '+12%' or '-5%', optional), trendUp (boolean). Glassmorphic card (bg-white/5 backdrop-blur-xl border-white/10 rounded-2xl). Icon top-left, label below in text-secondary, large bold value, trend badge in green (up) or red (down) at top-right. Framer-motion number counter animation on mount. Dark theme."
- absolutePathToCurrentFile: `components/dashboard/SummaryCard.tsx`
- absolutePathToProjectDirectory: `/Volumes/maersk/amargupta/Documents/Latest Projects/Portfolio Project/devfrend-personal-assitant`

- [ ] **Step 2: Build Overview page**

Create `app/dashboard/page.tsx` — a `'use client'` page that:

1. Calls `supabase.auth.getUser()` to get `userId`
2. Fetches data from Supabase using service-role or client queries:
   - Best habit streak (from `habit_logs`)
   - Tasks completed this week (from `tasks`)
   - Total spending this month (from `transactions`)
   - Active goals count (from `goals`)
3. Renders 4 `SummaryCard` components in a 2x2 grid
4. Below: recent activity section showing last 10 items across modules

Call `mcp__magic__21st_magic_component_builder` with:
- message: "Dashboard overview page with 4 stat cards grid and recent activity list, dark theme"
- searchQuery: "dashboard overview stats"
- standaloneRequestQuery: "Create a dashboard overview page. Top: greeting 'Welcome back' with current date in IST. Below: 4 stat cards in a 2x2 responsive grid using SummaryCard component — 1) 🔥 Best Streak (number of days), 2) ✅ Tasks This Week (completed count), 3) 💰 Spent This Month (₹ amount), 4) 🎯 Active Goals (count). Below cards: 'Recent Activity' section with a list of recent items showing icon, description, and timestamp. Dark theme. This is a 'use client' Next.js page that fetches real data from Supabase tables (habits, habit_logs, tasks, transactions, goals) using the browser Supabase client."
- absolutePathToCurrentFile: `app/dashboard/page.tsx`
- absolutePathToProjectDirectory: `/Volumes/maersk/amargupta/Documents/Latest Projects/Portfolio Project/devfrend-personal-assitant`

- [ ] **Step 3: Commit**

```bash
git add components/dashboard/SummaryCard.tsx app/dashboard/page.tsx
git commit -m "feat(web): add dashboard overview with stat cards and real Supabase data"
```

---

## Task 14: Dashboard — Habits Page

**Files:**
- Create: `app/dashboard/habits/page.tsx`

- [ ] **Step 1: Build Habits page**

Call `mcp__magic__21st_magic_component_builder` with:
- message: "Habits dashboard with streak badges, completion percentage bars, log button, analytics, dark theme"
- searchQuery: "habits tracker dashboard dark"
- standaloneRequestQuery: "Create a habits dashboard page. Header: 'Habits' title with 'Create Habit' button. Main content: list of habit cards, each showing: habit name, color dot, current streak as a badge (🔥 21 days), completion percentage as a horizontal progress bar (with percentage label), last logged date, and a 'Log Today' button. Below the list: analytics section with a simple grid showing completion % for last 30 days (like a GitHub contribution graph). Dark glassmorphic cards. This is a 'use client' Next.js page that fetches from Supabase 'habits' and 'habit_logs' tables. Log Today calls supabase insert into habit_logs. Show toast on success."
- absolutePathToCurrentFile: `app/dashboard/habits/page.tsx`
- absolutePathToProjectDirectory: `/Volumes/maersk/amargupta/Documents/Latest Projects/Portfolio Project/devfrend-personal-assitant`

- [ ] **Step 2: Commit**

```bash
git add app/dashboard/habits/page.tsx
git commit -m "feat(web): add habits dashboard with streaks, progress bars, log today"
```

---

## Task 15: Dashboard — Tasks Page

**Files:**
- Create: `app/dashboard/tasks/page.tsx`

- [ ] **Step 1: Build Tasks page**

Call `mcp__magic__21st_magic_component_builder` with:
- message: "Task management page with kanban columns or list view, filters, priority badges, dark theme"
- searchQuery: "task list kanban dark"
- standaloneRequestQuery: "Create a task management dashboard page. Header: 'Tasks' title with filter pills (All, Pending, In Progress, Completed) and 'New Task' button. Main content: list view of task cards. Each card shows: title, priority badge (high=red, medium=yellow, low=green), status badge, due date, tags as small pills. Cards are glassmorphic (bg-white/5). Click status badge to cycle status. New Task opens a modal with title, description, due date, priority select, tags input. Dark theme. Fetches from Supabase 'tasks' table. Supports creating, updating status, and filtering."
- absolutePathToCurrentFile: `app/dashboard/tasks/page.tsx`
- absolutePathToProjectDirectory: `/Volumes/maersk/amargupta/Documents/Latest Projects/Portfolio Project/devfrend-personal-assitant`

- [ ] **Step 2: Commit**

```bash
git add app/dashboard/tasks/page.tsx
git commit -m "feat(web): add task management page with filters, priorities, status updates"
```

---

## Task 16: Dashboard — Finance Page

**Files:**
- Create: `app/dashboard/finance/page.tsx`

- [ ] **Step 1: Build Finance page**

Call `mcp__magic__21st_magic_component_builder` with:
- message: "Finance dashboard with spending summary card, category breakdown, transaction list, dark theme"
- searchQuery: "finance dashboard spending"
- standaloneRequestQuery: "Create a finance dashboard page. Top: large spending summary card showing total spent this month as a big number with period label, and top 4 categories as icon + amount below. Below: two columns — left is 'By Category' showing category bars (horizontal bar chart with emoji icon, name, amount, percentage of total), right is 'Recent Transactions' list showing amount, merchant, category icon, date, and note. Bottom: 'Add Expense' button that opens a modal with amount input, merchant input, category picker grid (emojis), note input, and save button. Dark glassmorphic theme. Fetches from Supabase 'transactions' and 'spending_categories' tables."
- absolutePathToCurrentFile: `app/dashboard/finance/page.tsx`
- absolutePathToProjectDirectory: `/Volumes/maersk/amargupta/Documents/Latest Projects/Portfolio Project/devfrend-personal-assitant`

- [ ] **Step 2: Commit**

```bash
git add app/dashboard/finance/page.tsx
git commit -m "feat(web): add finance dashboard with spending summary and category breakdown"
```

---

## Task 17: Dashboard — Documents Page

**Files:**
- Create: `app/dashboard/documents/page.tsx`

- [ ] **Step 1: Build Documents page**

Call `mcp__magic__21st_magic_component_builder` with:
- message: "Document vault page with grid of document cards, upload button, search bar, dark theme"
- searchQuery: "document grid upload dark"
- standaloneRequestQuery: "Create a document vault dashboard page. Header: 'Documents' title with search bar (dark input with search icon) and 'Upload' button. Main content: responsive grid of document cards. Each card shows: document type icon (📄 PDF, 🖼️ image), document name, tags as small pills, file size, upload date, and a 'Download' button. Cards are glassmorphic with hover glow. Upload button opens a modal with: file drop zone (drag & drop area with dashed border), name input, tags input, description textarea, and upload button. Filter tabs: All, PDFs, Images. Dark theme. Fetches from Supabase 'wallet_documents' table. Download generates a signed URL from Supabase Storage."
- absolutePathToCurrentFile: `app/dashboard/documents/page.tsx`
- absolutePathToProjectDirectory: `/Volumes/maersk/amargupta/Documents/Latest Projects/Portfolio Project/devfrend-personal-assitant`

- [ ] **Step 2: Commit**

```bash
git add app/dashboard/documents/page.tsx
git commit -m "feat(web): add document vault with grid, search, upload, download"
```

---

## Task 18: Dashboard — Goals Page

**Files:**
- Create: `app/dashboard/goals/page.tsx`

- [ ] **Step 1: Build Goals page**

Call `mcp__magic__21st_magic_component_builder` with:
- message: "Goals dashboard with progress rings, milestone checklists, review button, dark theme"
- searchQuery: "goals progress rings dark"
- standaloneRequestQuery: "Create a goals dashboard page. Header: 'Goals' title with filter tabs (Active, Completed, Failed) and 'New Goal' button. Main content: grid of goal cards. Outcome goal card shows: title, circular progress ring (SVG) with percentage in center, metric type badge, current vs target value, date range. Milestone goal card shows: title, progress bar, checklist of milestones with toggle checkboxes, completed/total count. Special section at top: 'Get Review' card — a prominent glassmorphic card with gradient border saying 'Get your comprehensive review' with period selector (This Week, Last Week, This Month, Last Month) and a 'Generate Review' button. When clicked, it fetches from the get_review data and displays habit streaks, task stats, spending breakdown, and goal progress beautifully formatted. Dark theme with glassmorphic cards."
- absolutePathToCurrentFile: `app/dashboard/goals/page.tsx`
- absolutePathToProjectDirectory: `/Volumes/maersk/amargupta/Documents/Latest Projects/Portfolio Project/devfrend-personal-assitant`

- [ ] **Step 2: Commit**

```bash
git add app/dashboard/goals/page.tsx
git commit -m "feat(web): add goals dashboard with progress rings, milestones, review generator"
```

---

## Task 19: Build Verification + Polish

- [ ] **Step 1: Run type check**

```bash
cd "/Volumes/maersk/amargupta/Documents/Latest Projects/Portfolio Project/devfrend-personal-assitant"
npm run type-check
```

- [ ] **Step 2: Run lint**

```bash
npm run lint
```

- [ ] **Step 3: Run build**

```bash
npm run build
```

- [ ] **Step 4: Run dev server and verify all pages**

```bash
npm run dev
```

Test checklist:
- [ ] Landing page: all 6 sections render, animations play, responsive
- [ ] Navbar: sticky, links scroll to sections, CTA links to /signup
- [ ] Login: email/password works, redirects to /dashboard
- [ ] Signup: creates account, shows confirmation
- [ ] Dashboard overview: 4 stat cards show real data
- [ ] Habits: list loads, log today works, streaks display
- [ ] Tasks: list/filter works, create task works, status update works
- [ ] Finance: spending summary loads, transactions list, add expense works
- [ ] Documents: grid loads, upload works, download generates signed URL
- [ ] Goals: progress rings render, milestones toggle, review generates

- [ ] **Step 5: Fix any issues, then commit**

```bash
git add -A
git commit -m "fix(web): resolve build issues and polish UI"
```

---

## Task 20: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add web app section to CLAUDE.md**

Add under a new "Web App" section:

```markdown
## Web App

### Public Pages
- `/` — Premium landing page (hero, features, how it works, review showcase, tech strip, footer)
- `/login` — Supabase Auth login (email/password, Google)
- `/signup` — Account creation

### Dashboard Pages (authenticated)
- `/dashboard` — Overview with stat cards (best streak, tasks this week, spending this month, active goals)
- `/dashboard/habits` — Habit list, streaks, completion bars, log today, analytics
- `/dashboard/tasks` — Task list with filters, priority badges, create/update
- `/dashboard/finance` — Spending summary, category breakdown, transaction list, add expense
- `/dashboard/documents` — Document grid, upload, search, download
- `/dashboard/goals` — Goal progress rings, milestones, comprehensive review generator

### Styling
- Dark theme (#0a0a0f base, glassmorphism)
- Tailwind CSS v4 + Framer Motion
- 21st.dev Magic MCP components
- Geist font
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add web app pages to CLAUDE.md"
```

---

## Summary

| # | What | Details |
|---|------|---------|
| 1 | Tailwind + deps | Tailwind v4, Framer Motion, Geist font, PostCSS config, dark theme globals |
| 2 | Root layout | Geist font, OG metadata, dark body |
| 3 | Supabase client | Browser-side client for dashboard data fetching |
| 4 | Navbar | Glassmorphic sticky nav with gradient logo + CTA |
| 5 | Hero | Bold headline + animated mock Claude chat conversation |
| 6 | Features | 5 glassmorphic cards: Habits, Tasks, Documents, Finance, Goals |
| 7 | How It Works | 3-step flow: Connect → Track → Ask |
| 8 | Review Showcase | Mock Claude review with progress bars, charts, rings |
| 9 | Tech Strip + Footer | Badge strip + CTA footer with links |
| 10 | Landing assembly | Wire all sections into `page.tsx` |
| 11 | Auth pages | Dark glassmorphic login + signup with Supabase Auth |
| 12 | Dashboard layout | Sidebar nav + AuthGuard redirect |
| 13 | Dashboard overview | 4 stat cards + recent activity (real Supabase data) |
| 14 | Habits page | Streak badges, completion bars, log today, analytics grid |
| 15 | Tasks page | List/filter, priorities, create, status cycling |
| 16 | Finance page | Spending summary, category bars, transaction list, add expense |
| 17 | Documents page | Grid, upload drop zone, search, signed URL download |
| 18 | Goals page | Progress rings, milestone checklists, review generator |
| 19 | Build verification | Type check, lint, build, manual test all pages |
| 20 | Docs | CLAUDE.md updated |

**All UI components built with 21st.dev Magic MCP.** Each task calls the Magic component builder with specific dark-theme, glassmorphic requirements.
