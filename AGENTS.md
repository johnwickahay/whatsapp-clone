# WhatsApp Clone - Root AGENTS.md

This project is a modern WhatsApp Web clone built with Next.js 15+ and Supabase.

## Tech Stack
- **Framework**: Next.js 15+ (App Router)
- **Language**: TypeScript
- **Backend**: Supabase (Auth, PostgreSQL, Realtime, Storage)
- **Styling**: Tailwind CSS 4
- **UI Components**: Radix UI & Lucide React
- **Validation**: Zod

## Core Directory Structure
- `app/`: Contains the main routes and API handlers.
- `components/`: UI components, organized into generic UI, icons, and WhatsApp-specific logic.
- `hooks/`: Custom React hooks for global state and realtime functionality.
- `lib/`: Shared utilities, Supabase clients, and middleware.
- `supabase/`: Database migrations and configuration.

## Key Conventions
- **Realtime**: Heavy use of Supabase Realtime for messaging, presence (typing indicators), and state synchronization.
- **Database Operations**: Complex operations like group creation or direct chat initialization are handled via PostgreSQL RPCs defined in migrations.
- **UI Architecture**: The application is shell-based (`WhatsAppHomeShell`), with side panels and a main chat view.

## Guidelines for Agents
- When modifying realtime logic, ensure that channel subscriptions are properly cleaned up in `useEffect` returns.
- Prefer using Tailwind 4 utility classes for styling.
- Maintain strict TypeScript interfaces for database rows and message objects.
- Refer to `OPTIMIZATIONS.md` for a list of implemented features and pending improvements.
