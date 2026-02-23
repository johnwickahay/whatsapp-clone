export type ChatPreview = {
  id: string;
  name: string;
  lastMessage: string;
  lastMessageId?: string | null;
  lastTime: string;
  avatarText: string;
  unreadCount?: number;
  lastReadAt?: string | null;
  pinned?: boolean;
  muted?: boolean;
  favorite?: boolean;
  isGroup?: boolean;
  isCreator?: boolean;
  lastReactionUser?: string | null;
  lastReactionEmoji?: string | null;
  avatarUrl?: string | null;
  contactUserId?: string | null;
  disappearingSetting?: "off" | "24h" | "7d" | "90d";
};

export interface MessageReaction {
  id: string;
  messageId: string;
  userId: string;
  emoji: string;
  createdAt: string;
}

export interface ReplyToData {
  id: string;
  content: string;
  senderName: string;
  messageType?: string | null;
}

export interface ChatMessage {
  id: string;
  content: string;
  messageType?: string | null;
  mediaUrl?: string | null;
  mediaName?: string | null;
  mediaMime?: string | null;
  mediaSize?: number | null;
  user: {
    id: string;
    name: string;
    avatarUrl?: string | null;
  };
  createdAt: string;
  reactions: MessageReaction[];
  replyTo?: ReplyToData | null;
  isForwarded?: boolean;
}

export type MockChatMessage = {
  id: string;
  chatId: string;
  author: "me" | "them";
  text: string;
  time: string;
  status?: "sent" | "delivered" | "read";
};

export type StatusRecord = {
  id: string;
  user_id: string;
  media_url: string | null;
  caption: string | null;
  created_at: string;
  expires_at: string;
  author: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
  } | null;
  status_views: Array<{
    status_id: string | null;
    viewer_id: string | null;
    viewed_at: string;
    viewer: {
      full_name: string | null;
      avatar_url: string | null;
    } | null;
  }> | null;
};

export type StatusSummary = {
  userId: string;
  name: string;
  avatarUrl: string | null;
  initials: string;
  latestTime: string;
  statuses: StatusRecord[];
  hasNew: boolean;
};

export type WallpaperOption = {
  id: string;
  name: string;
  type: "pattern" | "color" | "image";
  value: string;
};
