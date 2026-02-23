# Future Features & Roadmap

This document outlines the planned features, potential improvements, and known technical debt for the WhatsApp Clone application.

## 🚀 Upcoming Features

### 1. Real-time Audio & Video Calls
- **Description**: Implement peer-to-peer calling using WebRTC.
- **Details**: Integrate with a service like LiveKit or Daily.co for signaling, or use Supabase Realtime for signaling and a TURN server for media.
- **UI**: Add a call overlay, ringing state, and call history in the chat list.

### 2. End-to-End Encryption (E2EE)
- **Description**: Secure messages so only the sender and receiver can read them.
- **Details**: Implement using the Web Crypto API (Signal Protocol implementation like `libsignal`).
- **Challenges**: Key exchange management, multi-device synchronization of keys.

### 3. Multi-Device Sync
- **Description**: Allow users to be logged in on multiple devices simultaneously.
- **Details**: Improve the session management in Supabase and ensure message read states sync across all active sessions.

### 4. Stickers & GIFs
- **Description**: Rich media support beyond images and videos.
- **Details**: Integrate Giphy API for GIFs. Create a custom sticker management system using Supabase Storage.

### 5. Communities & Channels
- **Description**: Large-scale broadcasting and organized group structures.
- **Details**: New database schema for "Communities" containing multiple "Channels" (conversations).

---

## 🛠️ Technical Debt & Known Issues

- **Media Upload Progress**: Currently, uploads are "fire and forget". Need to implement a progress bar UI using the Supabase Storage upload progress callback.
- **Message Retry Logic**: If a message fails to send due to network issues, it should be marked as "Failed" with a "Retry" button.
- **Virtual Scrolling**: The `MessageList` uses a standard `ScrollArea`. For conversations with thousands of messages, this will impact performance. Implement `react-virtuoso` or similar.
- **Global Error Handling**: While a toast system was added, many catch blocks still only `console.error`.

---

## 🤖 Prompt for AI Coding Tool

If you are an AI assistant taking over this project, use the following prompt to understand the context and start working on the next priority:

> **System Prompt Extension**:
> You are working on a WhatsApp Clone built with Next.js 15 (App Router), Supabase (Auth, DB, Realtime, Storage), and Tailwind CSS 4. The codebase has been recently refactored to centralize logic in `lib/` and hooks in `hooks/`.
>
> **Task**: [INSERT TASK HERE, e.g., Implement Audio Calls]
>
> **Context**:
> - Core types are in `components/whatsapp/types.ts`.
> - Realtime logic is handled in `hooks/use-realtime-chat.tsx`.
> - Message rendering logic is in `components/whatsapp/message-list.tsx`.
> - Profile and chat initialization is in `hooks/use-home-data.ts`.
>
> **Guidelines**:
> 1. Always check `AGENTS.md` in the relevant directory for specific architectural rules.
> 2. Use the `toast` utility in `lib/toast-utils.ts` for user feedback.
> 3. Ensure all new components are responsive and match the "WhatsApp Web" aesthetic.
> 4. Keep hooks small and focused; extract logic from large components into helper functions in `lib/`.
