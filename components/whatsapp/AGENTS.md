# WhatsApp Components - AGENTS.md

The heart of the WhatsApp clone's UI and logic.

## Key Components
- `home-shell.tsx`: Main application container (Layout & Navigation).
- `chat-list-panel.tsx`: Sidebar for selecting and searching chats.
- `chat-view-panel.tsx`: Main chat interface (Container for MessageList and ChatInput).
- `message-list.tsx`: Scrolled list of messages with auto-scroll logic.
- `chat-input.tsx`: Complex input area with voice, emojis, and attachments.
- `group-create-panel.tsx`: Dedicated flow for creating new groups.
- `status-panel.tsx`: Stories/Status functionality.
- `profile-panel.tsx`: User profile management.

## Guidelines
- This directory is highly coupled with Supabase Realtime.
- Be careful with large component files; consider refactoring into sub-components or hooks.
