# WhatsApp Components - AGENTS.md

The heart of the WhatsApp clone's UI and logic.

## Key Components
- `home-shell.tsx`: Main application container.
- `chat-list-panel.tsx`: Sidebar for selecting and searching chats.
- `chat-view-panel.tsx`: Main chat interface.
- `chat-header.tsx`: Header for the active chat.
- `status-panel.tsx`: Stories/Status functionality.
- `profile-panel.tsx`: User profile management.

## Guidelines
- This directory is highly coupled with Supabase Realtime.
- Be careful with large component files; consider refactoring into sub-components or hooks.
