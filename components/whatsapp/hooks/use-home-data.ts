import { useCallback, useEffect, useMemo, useState, Dispatch, SetStateAction } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ChatPreview, StatusRecord, StatusSummary, WallpaperOption } from "../types";
import { useStatuses } from "./use-statuses";
import { getProfileName, getInitials } from "../status-panel";
import { formatMessagePreview } from "@/lib/message-utils";

type ChatSummaryRow = {
  conversation_id: string;
  title: string | null;
  last_message: string | null;
  last_time: string | null;
  unread_count: number | null;
  last_read_at: string | null;
  is_group: boolean | null;
  photo_url: string | null;
  last_message_id: string | null;
  message_type: string | null;
  media_name: string | null;
  last_reaction_user: string | null;
  last_reaction_emoji: string | null;
  last_message_sender_id: string | null;
};

type MessagesInsertPayload = {
  new: {
    conversation_id: string;
    body: string | null;
    message_type?: string | null;
    media_name?: string | null;
    created_at: string;
    sender_id: string;
  };
};

type ConversationMembersInsertPayload = {
  new: {
    conversation_id: string;
    user_id: string;
  };
};

type ConversationMembersDeletePayload = {
  old: {
    conversation_id: string;
    user_id: string;
  };
};

function lastReadStorageKey(userId: string) {
  return `wa:last_read_at:${userId}`;
}

function getLocalLastReadAt(userId: string, conversationId: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(lastReadStorageKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed[conversationId] ?? null;
  } catch {
    return null;
  }
}

function setLocalLastReadAt(userId: string, conversationId: string, iso: string) {
  if (typeof window === "undefined") return;
  try {
    const key = lastReadStorageKey(userId);
    const raw = window.localStorage.getItem(key);
    const parsed = (raw ? (JSON.parse(raw) as Record<string, string>) : {}) as Record<string, string>;
    parsed[conversationId] = iso;
    window.localStorage.setItem(key, JSON.stringify(parsed));
  } catch {
    // ignore
  }
}

export function useHomeData(selectedChatId: string, setSelectedChatId: Dispatch<SetStateAction<string>>) {
  const [userId, setUserId] = useState<string>("");
  const [username, setUsername] = useState<string>("");
  const [onlineUserIds, setOnlineUserIds] = useState<string[]>([]);
  const [chats, setChats] = useState<ChatPreview[]>([]);
  const [isLoadingChats, setIsLoadingChats] = useState(true);
  const [profileFullName, setProfileFullName] = useState<string>("");
  const [profileAvatarUrl, setProfileAvatarUrl] = useState<string | null>(null);
  const [wallpaper, setWallpaper] = useState<WallpaperOption>({
    id: "default",
    name: "Predeterminado",
    type: "pattern",
    value: "default",
  });

  const { groups, reload: reloadStatuses, markAsViewed } = useStatuses(userId || null);

  const allSummaries = useMemo(() => {
    const map = new Map<string, StatusRecord[]>();
    const buckets = [...groups.own, ...groups.recent, ...groups.seen];
    for (const item of buckets) {
      if (!map.has(item.user_id)) {
        map.set(item.user_id, []);
      }
      map.get(item.user_id)?.push(item);
    }
    const summaries: StatusSummary[] = [];
    for (const [id, statuses] of map.entries()) {
      statuses.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      const name = getProfileName(statuses[0]);
      summaries.push({
        userId: id,
        name,
        avatarUrl: statuses[0]?.author?.avatar_url ?? null,
        initials: getInitials(name),
        latestTime: statuses[statuses.length - 1]?.created_at ?? "",
        statuses,
        hasNew: groups.recent.some((s) => s.user_id === id),
      });
    }
    return summaries;
  }, [groups]);

  const findStatusSummary = useCallback((targetUserId: string | null | undefined, name: string | null | undefined) => {
    if (!allSummaries || allSummaries.length === 0) return undefined;
    let found = allSummaries.find(s => targetUserId && String(s.userId) === String(targetUserId));
    if (!found && name) {
      const searchName = name.trim().toLowerCase();
      found = allSummaries.find(s => s.name?.trim().toLowerCase() === searchName);
    }
    return found;
  }, [allSummaries]);

  const profileInitials = useMemo(() => {
    const v = (profileFullName || "").trim();
    if (!v) return "?";
    const parts = v.split(/\s+/).filter(Boolean);
    const first = parts[0]?.[0] ?? "?";
    const second = parts.length > 1 ? parts[1]?.[0] ?? "" : "";
    return `${first}${second}`;
  }, [profileFullName]);

  useEffect(() => {
    let active = true;

    async function loadProfile() {
      const supabase = createClient();
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) return;

      if (!active) return;
      setUserId(uid);

      const { data } = await supabase
        .from("profiles")
        .select("full_name, avatar_url, settings")
        .eq("id", uid)
        .maybeSingle();

      if (!active) return;
      setProfileFullName(data?.full_name ?? "");
      setProfileAvatarUrl(data?.avatar_url ?? null);

      if (data?.settings?.wallpaper) {
        setWallpaper(data.settings.wallpaper);
      }

      const nextUsername = (data?.full_name ?? "").trim() || userData.user?.email || "Yo";
      setUsername(nextUsername);

      const { data: summaries } = await supabase.rpc("get_chat_summaries");
      if (!active) return;
      const summaryRows = (summaries ?? []) as ChatSummaryRow[];
      const conversationIds = summaryRows.map((r) => r.conversation_id);

      const conversationMetadataMap = new Map<string, { isGroup: boolean; createdBy: string | null; disappearing: "off" | "24h" | "7d" | "90d" }>();
      if (conversationIds.length > 0) {
        const { data: conversationRows } = await supabase
          .from("conversations")
          .select("id, group_settings, is_group, created_by")
          .in("id", conversationIds);

        if (conversationRows) {
          for (const row of conversationRows) {
            const disappearing = row?.group_settings?.disappearing || "off";
            conversationMetadataMap.set(row.id, {
              isGroup: !!row.is_group,
              createdBy: row.created_by ?? null,
              disappearing
            });
          }
        }
      }

      let favoriteSet = new Set<string>();
      try {
        const { data: favoriteRows } = await supabase
          .from("user_favorite_conversations")
          .select("conversation_id")
          .eq("user_id", uid);

        if (favoriteRows) {
          favoriteSet = new Set(
            (favoriteRows ?? [])
              .map((r: { conversation_id: string | null }) => r.conversation_id)
              .filter(Boolean) as string[],
          );
        }
      } catch {
        // ignore
      }

      const directConversationIds = summaryRows
        .filter(r => !r.is_group)
        .map(r => r.conversation_id);

      const { data: allMembers } = await supabase
        .from("conversation_members")
        .select("conversation_id, user_id, profiles(full_name, email, avatar_url)")
        .in("conversation_id", directConversationIds);

      if (!active) return;

      const directChatDetails: Record<string, { name: string; avatarUrl: string | null; userId: string }> = {};

      for (const member of (allMembers ?? [])) {
        if (member.user_id !== uid) {
          const profile = member.profiles as { full_name: string | null; email: string | null; avatar_url: string | null } | null;
          const name = (profile?.full_name ?? "").trim() || (profile?.email ?? "").trim() || "Usuario";
          const rawAvatar = profile?.avatar_url;
          directChatDetails[member.conversation_id] = {
            name,
            avatarUrl: rawAvatar && rawAvatar.trim() ? rawAvatar : null,
            userId: member.user_id
          };
        }
      }

      const nextChats: ChatPreview[] = summaryRows.map((r) => {
        const serverLastReadAt = (r.last_read_at as string | null | undefined) ?? null;
        const localLastReadAt = uid ? getLocalLastReadAt(uid, r.conversation_id) : null;
        const effectiveLastReadAt =
          serverLastReadAt && localLastReadAt
            ? (new Date(serverLastReadAt) > new Date(localLastReadAt) ? serverLastReadAt : localLastReadAt)
            : (serverLastReadAt ?? localLastReadAt);

        let name: string = "Chat";
        let avatarUrl: string | null = null;

        if (r.is_group) {
          name = (r.title ?? "Grupo").trim() || "Grupo";
          avatarUrl = r.photo_url;
        } else {
          const details = directChatDetails[r.conversation_id];
          if (details) {
            name = details.name;
            avatarUrl = details.avatarUrl;
          } else {
            const myMember = (allMembers ?? []).find((m: { conversation_id: string; user_id: string }) => m.conversation_id === r.conversation_id && m.user_id === uid);
            if (myMember) {
              name = "Yo (Tú)";
            } else {
              name = "Usuario";
            }
            avatarUrl = data?.avatar_url ?? null;
          }
        }

        const avatarText = name[0]?.toUpperCase() ?? "?";
        const lastMessage = formatMessagePreview({
          body: r.last_message,
          messageType: r.message_type,
          mediaName: r.media_name,
          senderId: r.last_message_sender_id,
          currentUserId: uid
        });

        const lastTime = r.last_time
          ? new Date(r.last_time).toLocaleTimeString("es-ES", {
            hour: "2-digit",
            minute: "2-digit",
          })
          : "";

        const shouldOverrideUnread =
          Boolean(localLastReadAt) &&
          (!r.last_time || new Date(localLastReadAt as string) >= new Date(r.last_time as string));

        return {
          id: r.conversation_id,
          name,
          lastMessage,
          lastMessageId: r.last_message_id ?? null,
          lastTime,
          avatarText,
          unreadCount: shouldOverrideUnread ? 0 : (r.unread_count ?? 0),
          lastReadAt: effectiveLastReadAt,
          favorite: favoriteSet.has(r.conversation_id),
          lastReactionUser: r.last_reaction_user ?? null,
          lastReactionEmoji: r.last_reaction_emoji ?? null,
          avatarUrl,
          contactUserId: r.is_group ? null : directChatDetails[r.conversation_id]?.userId ?? null,
          isGroup: conversationMetadataMap.get(r.conversation_id)?.isGroup ?? !!r.is_group,
          isCreator: conversationMetadataMap.get(r.conversation_id)?.createdBy === uid,
          disappearingSetting: conversationMetadataMap.get(r.conversation_id)?.disappearing ?? "off",
        };
      });

      setChats(nextChats);
    }

    void loadProfile().finally(() => {
      if (active) setIsLoadingChats(false);
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!userId || !selectedChatId) return;
    const supabase = createClient();
    const now = new Date().toISOString();

    void (async () => {
      const { error } = await supabase
        .from("conversation_members")
        .update({ last_read_at: now })
        .eq("user_id", userId)
        .eq("conversation_id", selectedChatId);

      if (error) return;

      setLocalLastReadAt(userId, selectedChatId, now);

      setChats((prev) =>
        prev.map((c) =>
          c.id === selectedChatId ? { ...c, unreadCount: 0, lastReadAt: now } : c,
        ),
      );
    })();
  }, [selectedChatId, userId]);

  useEffect(() => {
    if (!userId) return;
    const supabase = createClient();

    const channel = supabase.channel("presence:global", {
      config: {
        presence: {
          key: userId,
        },
      },
    });

    const syncOnline = () => {
      const state = channel.presenceState() as Record<string, unknown[]>;
      const ids = Object.keys(state);
      setOnlineUserIds(ids);
    };

    channel
      .on("presence", { event: "sync" }, syncOnline)
      .on("presence", { event: "join" }, syncOnline)
      .on("presence", { event: "leave" }, syncOnline)
      .subscribe(async (status: string) => {
        if (status !== "SUBSCRIBED") return;
        await channel.track({ user_id: userId, online_at: new Date().toISOString() });
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    const supabase = createClient();
    const channel = supabase.channel(`conversation_members:user:${userId}:delete`);

    channel
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "conversation_members",
          filter: `user_id=eq.${userId}`,
        },
        async (payload: ConversationMembersDeletePayload) => {
          const row = payload.old;
          const conversationId = row.conversation_id;
          if (!conversationId) return;

          setChats((prev) => prev.filter((c) => c.id !== conversationId));
          setSelectedChatId((prev) => (prev === conversationId ? "" : prev));
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, setSelectedChatId]);

  useEffect(() => {
    if (!userId) return;
    const supabase = createClient();
    const channel = supabase.channel(`messages:sidebar:${userId}`);

    channel
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
        },
        async (payload: MessagesInsertPayload) => {
          const row = payload.new;
          if (!row.conversation_id) return;

          setChats((prev) => {
            const idx = prev.findIndex((c) => c.id === row.conversation_id);
            if (idx === -1) return prev;

            const next = [...prev];
            const current = next[idx];
            const lastTime = row.created_at
              ? new Date(row.created_at).toLocaleTimeString("es-ES", {
                hour: "2-digit",
                minute: "2-digit",
              })
              : current.lastTime;

            const isActiveChat = selectedChatId === row.conversation_id;
            const nextUnread = isActiveChat
              ? 0
              : Math.max(0, (current.unreadCount ?? 0) + (row.sender_id === userId ? 0 : 1));

            next[idx] = {
              ...current,
              lastMessage: formatMessagePreview({
                body: row.body,
                messageType: row.message_type,
                mediaName: row.media_name,
                senderId: row.sender_id,
                currentUserId: userId
              }),
              lastTime,
              unreadCount: nextUnread,
            };

            if (isActiveChat) {
              const now = new Date().toISOString();
              void supabase
                .from("conversation_members")
                .update({ last_read_at: now })
                .eq("user_id", userId)
                .eq("conversation_id", row.conversation_id);

              setLocalLastReadAt(userId, row.conversation_id, now);

              next[idx] = {
                ...next[idx],
                lastReadAt: now,
              };
            }

            return [next[idx], ...next.filter((_, i) => i !== idx)];
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedChatId, userId]);

  useEffect(() => {
    if (!userId) return;
    const supabase = createClient();
    const channel = supabase.channel(`reactions:sidebar:${userId}`);

    channel
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "message_reactions",
        },
        async (payload: any) => {
          const eventType = payload.eventType;
          const newRow = payload.new;
          const oldRow = payload.old;

          const messageId = newRow?.message_id || oldRow?.message_id;
          if (!messageId) return;

          if (eventType === 'INSERT') {
            const { data: userData } = await supabase
              .from('profiles')
              .select('full_name')
              .eq('id', newRow.user_id)
              .single();

            const userName = (userData?.full_name ?? 'Alguien').trim() || 'Alguien';
            const emoji = newRow.emoji;

            setChats(prev => prev.map(c => {
              if (c.lastMessageId === messageId) {
                return {
                  ...c,
                  lastReactionUser: userName,
                  lastReactionEmoji: emoji
                }
              }
              return c;
            }));
          } else if (eventType === 'DELETE') {
            const { data: latest } = await supabase
              .from('message_reactions')
              .select('emoji, user_id, profiles(full_name)')
              .eq('message_id', messageId)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();

            setChats(prev => prev.map(c => {
              if (c.lastMessageId === messageId) {
                if (latest) {
                  const uName = (latest.profiles?.full_name ?? 'Alguien').trim() || 'Alguien';
                  return { ...c, lastReactionUser: uName, lastReactionEmoji: latest.emoji };
                } else {
                  return { ...c, lastReactionUser: null, lastReactionEmoji: null };
                }
              }
              return c;
            }));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    const supabase = createClient();

    const channel = supabase.channel(`conversation_members:user:${userId}`);

    channel
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "conversation_members",
          filter: `user_id=eq.${userId}`,
        },
        async (payload: ConversationMembersInsertPayload) => {
          const row = payload.new;
          const conversationId = row.conversation_id;
          if (!conversationId) return;

          const { data } = await supabase
            .from("conversations")
            .select("id, title, is_group")
            .eq("id", conversationId)
            .maybeSingle();

          if (!data?.id) return;

          let name: string;
          let avatarUrl: string | null = null;
          if (data.is_group) {
            name = (data.title ?? "Grupo").trim() || "Grupo";
          } else {
            await new Promise(resolve => setTimeout(resolve, 100));

            const { data: members } = await supabase
              .from("conversation_members")
              .select("user_id, profiles(full_name, email, avatar_url)")
              .eq("conversation_id", conversationId)
              .neq("user_id", userId);

            if (members && members.length > 0) {
              const otherMember = members[0];
              const profile = otherMember.profiles as { full_name: string | null; email: string | null; avatar_url: string | null } | null;
              name = (profile?.full_name ?? "").trim() || (profile?.email ?? "").trim() || "Usuario";
              avatarUrl = profile?.avatar_url ?? null;
            } else {
              name = (data.title ?? "").trim() || "Usuario";
            }
          }

          const avatarText = name[0]?.toUpperCase() ?? "?";

          setChats((prev) => {
            if (prev.some((c) => c.id === data.id)) return prev;
            return [
              {
                id: data.id,
                name,
                lastMessage: "",
                lastTime: "",
                avatarText,
                avatarUrl,
              },
              ...prev,
            ];
          });

          setSelectedChatId((prev) => prev || data.id);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, setSelectedChatId]);

  const handleProfileUpdated = useCallback(
    (next: { fullName?: string; avatarUrl?: string | null }) => {
      if (typeof next.fullName === "string") setProfileFullName(next.fullName);
      if ("avatarUrl" in next) setProfileAvatarUrl(next.avatarUrl ?? null);
    },
    [],
  );

  const handleToggleFavorite = useCallback(
    async (chatId: string, nextFavorite: boolean) => {
      if (!userId || !chatId) return;
      const supabase = createClient();

      setChats((prev) => prev.map((c) => (c.id === chatId ? { ...c, favorite: nextFavorite } : c)));

      if (nextFavorite) {
        const { error } = await supabase
          .from("user_favorite_conversations")
          .insert({ user_id: userId, conversation_id: chatId });
        if (error) {
          if (process.env.NODE_ENV !== "production") {
            console.warn("[favorites] insert failed", error);
          }
        }
        return;
      }

      const { error } = await supabase
        .from("user_favorite_conversations")
        .delete()
        .eq("user_id", userId)
        .eq("conversation_id", chatId);
      if (error) {
        if (process.env.NODE_ENV !== "production") {
          console.warn("[favorites] delete failed", error);
        }
      }
    },
    [userId],
  );

  const handleDeleteChat = useCallback(
    async (chatId: string, opts?: { isGroup: boolean; isCreator: boolean }) => {
      if (!userId || !chatId) return;
      const supabase = createClient();

      const chat = chats.find((c) => c.id === chatId);
      const isGroup = opts?.isGroup ?? chat?.isGroup ?? false;
      const isCreator = opts?.isCreator ?? chat?.isCreator ?? false;

      if (isGroup) {
        if (!isCreator) return;
        const { error } = await supabase.from("conversations").delete().eq("id", chatId);
        if (error) {
          if (process.env.NODE_ENV !== "production") {
            console.error("[chat] delete conversation failed", error);
          }
          return;
        }
      } else {
        const { error } = await supabase
          .from("conversation_members")
          .delete()
          .eq("conversation_id", chatId)
          .eq("user_id", userId);
        if (error) {
          if (process.env.NODE_ENV !== "production") {
            console.error("[chat] leave conversation failed", error);
          }
          return;
        }
      }

      setChats((prev) => prev.filter((c) => c.id !== chatId));
      setSelectedChatId((prev) => (prev === chatId ? "" : prev));
    },
    [userId, chats, setSelectedChatId],
  );

  const handleLeaveGroup = useCallback(
    async (chatId: string) => {
      if (!userId || !chatId) return;
      const supabase = createClient();

      const { data: userData } = await supabase.auth.getUser();
      const email = (userData.user?.email ?? '').trim();
      const displayName = (username ?? '').trim() || email.split('@')[0] || 'Usuario';
      const who = email ? `${displayName} (${email})` : displayName;

      await supabase.from('messages').insert({
        conversation_id: chatId,
        sender_id: userId,
        body: `${who} se salió del grupo`,
        message_type: 'system',
      });

      const { error } = await supabase
        .from("conversation_members")
        .delete()
        .eq("conversation_id", chatId)
        .eq("user_id", userId);

      if (error) {
        if (process.env.NODE_ENV !== "production") {
          console.error("[chat] leave group failed", error);
        }
        return;
      }

      setChats((prev) => prev.filter((c) => c.id !== chatId));
      setSelectedChatId((prev) => (prev === chatId ? "" : prev));
    },
    [userId, username, setSelectedChatId],
  );

  const handleMarkAllRead = useCallback(async () => {
    if (!userId) return;

    const unreadIds = chats
      .filter((c) => (c.unreadCount ?? 0) > 0)
      .map((c) => c.id);

    if (unreadIds.length === 0) return;

    const supabase = createClient();
    const now = new Date().toISOString();

    setChats((prev) =>
      prev.map((c) => {
        if ((c.unreadCount ?? 0) > 0) {
          return { ...c, unreadCount: 0, lastReadAt: now };
        }
        return c;
      })
    );

    for (const id of unreadIds) {
      setLocalLastReadAt(userId, id, now);
    }

    const { error } = await supabase
      .from("conversation_members")
      .update({ last_read_at: now })
      .eq("user_id", userId)
      .in("conversation_id", unreadIds);

    if (error) {
      if (process.env.NODE_ENV !== "production") {
        console.error("[mark-all-read] failed", error);
      }
    }
  }, [chats, userId]);

  const handleBulkDelete = useCallback(
    async (chatIds: string[], opts: { forAll: boolean }) => {
      if (!userId || chatIds.length === 0) return;
      const supabase = createClient();

      if (opts.forAll) {
        const { error } = await supabase.from("conversations").delete().in("id", chatIds);
        if (error && process.env.NODE_ENV !== "production") {
          console.error("[bulk-delete] all failed", error);
        }
      } else {
        const { error } = await supabase
          .from("conversation_members")
          .delete()
          .eq("user_id", userId)
          .in("conversation_id", chatIds);
        if (error && process.env.NODE_ENV !== "production") {
          console.error("[bulk-delete] me failed", error);
        }
      }

      setChats((prev) => prev.filter((c) => !chatIds.includes(c.id)));
      if (chatIds.includes(selectedChatId)) setSelectedChatId("");
    },
    [userId, selectedChatId, setSelectedChatId],
  );

  const handleBulkClear = useCallback(
    async (chatIds: string[], opts: { forAll: boolean }) => {
      if (!userId || chatIds.length === 0) return;
      const supabase = createClient();

      if (opts.forAll) {
        const now = new Date().toISOString();
        await supabase.from("conversations").update({ cleared_at: now }).in("id", chatIds);
        const { error } = await supabase.from("messages").delete().in("conversation_id", chatIds);
        if (error && process.env.NODE_ENV !== "production") console.error("bulk clear all failed", error);
      } else {
        const { data: messages } = await supabase
          .from("messages")
          .select("id, conversation_id")
          .in("conversation_id", chatIds);

        if (!messages) return;

        const byChat: Record<string, string[]> = {};
        for (const m of messages) {
          if (!byChat[m.conversation_id]) byChat[m.conversation_id] = [];
          byChat[m.conversation_id].push(m.id);
        }

        for (const chatId of Object.keys(byChat)) {
          try {
            const key = `hidden:${userId}:${chatId}`;
            const raw = localStorage.getItem(key);
            const prev = raw ? (JSON.parse(raw) as string[]) : [];
            const next = Array.from(new Set([...prev, ...byChat[chatId]]));
            localStorage.setItem(key, JSON.stringify(next));
          } catch {
            // ignore
          }
        }
      }
    },
    [userId]
  );

  const handleWallpaperConfirm = useCallback(async (selected: WallpaperOption) => {
    setWallpaper(selected);
    if (!userId) return;

    const supabase = createClient();
    const { data: profile } = await supabase
      .from("profiles")
      .select("settings")
      .eq("id", userId)
      .single();

    const existingSettings = profile?.settings || {};
    await supabase
      .from("profiles")
      .update({
        settings: {
          ...existingSettings,
          wallpaper: selected,
        },
      })
      .eq("id", userId);
  }, [userId]);

  return {
    userId,
    username,
    onlineUserIds,
    chats,
    setChats,
    isLoadingChats,
    profileFullName,
    profileAvatarUrl,
    profileInitials,
    wallpaper,
    setWallpaper,
    allSummaries,
    reloadStatuses,
    markAsViewed,
    findStatusSummary,
    handleProfileUpdated,
    handleToggleFavorite,
    handleDeleteChat,
    handleLeaveGroup,
    handleMarkAllRead,
    handleBulkDelete,
    handleBulkClear,
    handleWallpaperConfirm,
  };
}
