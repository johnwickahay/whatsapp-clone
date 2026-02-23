"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import {
  Search,
  Pin,
  BellOff,
  X,
  ChevronRight,
  Trash2,
  Eraser,
  Check,
  Clock,
} from "lucide-react";

import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import type { ChatPreview } from "./types";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { ChatListOptionsMenu } from "./chat-list-options-menu";
import { GroupAvatar } from "./group-avatar";
import { MessagePlus } from "../icons/message-plus";
import { useTypingIndicators } from "./hooks/use-typing-indicators";
import { GroupCreatePanel } from "./group-create-panel";
import { ClearChatDialog } from "./clear-chat-dialog";
import { DeleteChatsDialog } from "./delete-chats-dialog";
import type { StatusSummary } from "./types";

const ENCRYPTION_NOTICE_TEXT =
  'Los mensajes y las llamadas están cifrados de extremo a extremo. Solo las personas en este chat pueden leerlos, escucharlos o compartirlos. Haz clic para obtener más información.';

type Props = {
  chats: ChatPreview[];
  selectedChatId: string;
  onSelectChat: (chatId: string) => void;
  userId: string;
  onGroupCreated: (next: { conversationId: string; title: string }) => void;
  onMarkAllRead?: () => void;
  onBulkDelete?: (chatIds: string[], opts: { forAll: boolean }) => void;
  onBulkClear?: (chatIds: string[], opts: { forAll: boolean }) => void;
  allSummaries?: StatusSummary[];
  onOpenStatus?: (summary: StatusSummary) => void;
  findStatusSummary?: (targetUserId: string | null | undefined, name: string | null | undefined) => StatusSummary | undefined;
  isLoading?: boolean;
  onNavigateToPeople?: () => void;
  className?: string;
};


export function ChatListPanel({
  chats,
  selectedChatId,
  onSelectChat,
  userId,
  onGroupCreated,
  onMarkAllRead,
  onBulkDelete,
  onBulkClear,
  allSummaries = [],
  onOpenStatus,
  findStatusSummary,
  isLoading = false,
  onNavigateToPeople,
  className,
}: Props) {
  const [tab, setTab] = useState<'all' | 'unread' | 'favorites' | 'groups'>('all')
  const [query, setQuery] = useState('')
  const [isGroupOpen, setIsGroupOpen] = useState(false);

  // Selection Mode State
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedChatIds, setSelectedChatIds] = useState<string[]>([]);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [isCreatorByChatId, setIsCreatorByChatId] = useState<Record<string, boolean>>({});
  const [photoUrlByChatId, setPhotoUrlByChatId] = useState<Record<string, string | null>>({});

  const [isGroupByChatId, setIsGroupByChatId] = useState<Record<string, boolean>>({});
  const { typingLabelByChatId } = useTypingIndicators(chats, userId, isGroupByChatId);

  const filteredChats = useMemo(() => {
    const q = query.trim().toLowerCase()
    return chats.filter((c) => {
      if (tab === 'unread' && !(c.unreadCount && c.unreadCount > 0)) return false
      if (tab === 'favorites' && !c.favorite) return false
      if (tab === 'groups' && !isGroupByChatId[c.id]) return false

      if (!q) return true
      return (
        (c.name ?? '').toLowerCase().includes(q) ||
        (c.lastMessage ?? '').toLowerCase().includes(q)
      )
    })
  }, [chats, isGroupByChatId, query, tab]);

  const emptyState = useMemo(() => {
    const hasQuery = Boolean(query.trim());
    if (hasQuery) {
      return {
        title: "No se encontraron chats",
        subtitle: "Prueba con otro nombre o mensaje.",
      };
    }

    if (tab === "favorites") {
      return {
        title: "No tienes chats favoritos",
        subtitle: "Marca un chat como favorito para verlo aquí.",
      };
    }

    if (tab === "unread") {
      return {
        title: "No hay chats sin leer",
        subtitle: "Cuando tengas mensajes nuevos, aparecerán aquí.",
      };
    }

    if (tab === "groups") {
      return {
        title: "No tienes grupos",
        subtitle: "Crea un grupo para empezar a chatear.",
      };
    }

    return {
      title: "No hay chats para mostrar",
      subtitle: "Crea un chat o espera a recibir un mensaje.",
    };
  }, [query, tab]);

  useEffect(() => {
    let active = true;
    if (!userId) return;
    const chatIds = chats.map((c) => c.id).filter(Boolean);
    if (chatIds.length === 0) return;

    async function loadGroupFlags() {
      const supabase = createClient();
      const { data } = await supabase
        .from("conversations")
        .select("id, is_group, created_by, photo_url")
        .in("id", chatIds);

      if (!active) return;
      const nextGroup: Record<string, boolean> = {};
      const nextCreator: Record<string, boolean> = {};
      const nextPhoto: Record<string, string | null> = {};

      for (const row of data ?? []) {
        nextGroup[row.id] = Boolean(row.is_group);
        nextCreator[row.id] = row.created_by === userId;
        nextPhoto[row.id] = row.photo_url ?? null;
      }
      setIsGroupByChatId(nextGroup);
      setIsCreatorByChatId(nextCreator);
      setPhotoUrlByChatId(nextPhoto);
    }

    void loadGroupFlags();

    return () => {
      active = false;
    };
  }, [chats, userId]);



  // Handlers for Selection Mode
  const handleChatClick = useCallback((chatId: string) => {
    if (isSelectionMode) {
      setSelectedChatIds(prev =>
        prev.includes(chatId) ? prev.filter(id => id !== chatId) : [...prev, chatId]
      );
    } else {
      onSelectChat(chatId);
    }
  }, [isSelectionMode, onSelectChat]);

  const enterSelectionMode = useCallback(() => {
    setIsSelectionMode(true);
    setSelectedChatIds([]);
  }, []);

  const exitSelectionMode = useCallback(() => {
    setIsSelectionMode(false);
    setSelectedChatIds([]);
  }, []);

  const canActionForAll = useMemo(() => {
    if (selectedChatIds.length === 0) return false;
    // Must be ALL groups and I must be creator of ALL of them
    return selectedChatIds.every(id => isGroupByChatId[id] && isCreatorByChatId[id]);
  }, [selectedChatIds, isGroupByChatId, isCreatorByChatId]);

  const handleConfirmDeleteForMe = useCallback(() => {
    onBulkDelete?.(selectedChatIds, { forAll: false });
    setDeleteConfirmOpen(false);
    exitSelectionMode();
  }, [onBulkDelete, selectedChatIds, exitSelectionMode]);

  const handleConfirmDeleteForAll = useCallback(() => {
    onBulkDelete?.(selectedChatIds, { forAll: true });
    setDeleteConfirmOpen(false);
    exitSelectionMode();
  }, [onBulkDelete, selectedChatIds, exitSelectionMode]);

  const handleConfirmClearForMe = useCallback(() => {
    onBulkClear?.(selectedChatIds, { forAll: false });
    setClearConfirmOpen(false);
    exitSelectionMode();
  }, [onBulkClear, selectedChatIds, exitSelectionMode]);

  const handleConfirmClearForAll = useCallback(() => {
    onBulkClear?.(selectedChatIds, { forAll: true });
    setClearConfirmOpen(false);
    exitSelectionMode();
  }, [onBulkClear, selectedChatIds, exitSelectionMode]);

  return (
    <section
      className={cn(
        "relative flex h-full w-full min-w-0 flex-col overflow-hidden bg-white border-r border-border dark:bg-[#161717] md:w-[420px] md:shrink-0",
        className,
      )}
    >
      <header className="flex items-center justify-between px-4 py-3 min-h-[64px]">
        {isSelectionMode ? (
          <div className="flex w-full items-center justify-between animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex items-center gap-4">
              <button onClick={exitSelectionMode} className="text-whatsapp-text-primary hover:bg-[#F7F5F3] dark:hover:bg-whatsapp-panel rounded-full p-2">
                <X className="h-5 w-5" />
              </button>
              <span className="font-semibold text-lg">{selectedChatIds.length}</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setClearConfirmOpen(true)}
                disabled={selectedChatIds.length === 0}
                className="p-2 text-whatsapp-text-primary hover:bg-[#F7F5F3] dark:hover:bg-whatsapp-panel rounded-full disabled:opacity-50"
                title="Vaciar chats"
              >
                <Eraser className="h-5 w-5" />
              </button>
              <button
                onClick={() => setDeleteConfirmOpen(true)}
                disabled={selectedChatIds.length === 0}
                className="p-2 text-whatsapp-text-primary hover:bg-[#F7F5F3] dark:hover:bg-whatsapp-panel rounded-full disabled:opacity-50"
                title="Eliminar chats"
              >
                <Trash2 className="h-5 w-5" />
              </button>
            </div>
          </div>
        ) : (
          <>
            <h1 className="text-lg font-semibold text-whatsapp-text-primary">
              WhatsApp
            </h1>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onNavigateToPeople?.()}
                className="grid h-10 w-10 place-items-center rounded-full  text-whatsapp-text-primary hover:bg-[#F7F5F3] dark:hover:bg-whatsapp-panel"
                aria-label="Nuevo chat"
              >
                <MessagePlus className="h-6 w-6" />
              </button>
              <ChatListOptionsMenu
                onNewGroup={() => setIsGroupOpen(true)}
                onMarkAllRead={onMarkAllRead}
                onEnterSelectionMode={enterSelectionMode}
              />
            </div>
          </>
        )}
      </header>

      <div className="px-4 pb-3">
        <div className="flex h-11 items-center gap-2 rounded-xl bg-whatsapp-panel px-3 text-whatsapp-text-muted">
          <Search className="h-4 w-4" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-full w-full bg-transparent text-sm text-whatsapp-text-primary outline-none placeholder:text-whatsapp-text-muted"
            placeholder={tab === 'favorites' ? 'Buscar chats favoritos' : 'Pregunta a Meta AI o busca'}
          />
        </div>

        <div className="mt-3 flex gap-2">
          <Pill active={tab === 'all'} onClick={() => setTab('all')}>Todos</Pill>
          <Pill active={tab === 'unread'} onClick={() => setTab('unread')}>No leídos</Pill>
          <Pill active={tab === 'favorites'} onClick={() => setTab('favorites')}>Favoritos</Pill>
          <Pill active={tab === 'groups'} onClick={() => setTab('groups')}>Grupos</Pill>
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="px-2 pb-2 flex flex-col gap-2">
          {isLoading ? (
            <div className="flex flex-col gap-0.5">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-[#F7F5F3] dark:hover:bg-whatsapp-panel">
                  <div className="relative">
                    <Skeleton className="h-12 w-12 rounded-full bg-black/5 dark:bg-white/10" />
                  </div>
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex justify-between">
                      <Skeleton className="h-4 w-24 bg-black/5 dark:bg-white/10" />
                      <Skeleton className="h-3 w-12 bg-black/5 dark:bg-white/10" />
                    </div>
                    <div className="flex gap-2">
                      <Skeleton className="h-3 w-48 bg-black/5 dark:bg-white/10" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : filteredChats.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <div className="text-sm font-semibold text-whatsapp-text-primary">
                {emptyState.title}
              </div>
              <div className="mt-1 text-sm text-whatsapp-text-muted">{emptyState.subtitle}</div>
            </div>
          ) : (
            filteredChats.map((chat) => {
              const resolvedPhotoUrl = photoUrlByChatId[chat.id] ?? chat.avatarUrl ?? null

              return (
                <ChatRow
                  key={chat.id}
                  chat={chat}
                  selected={chat.id === selectedChatId}
                  onClick={() => handleChatClick(chat.id)}
                  typingLabel={typingLabelByChatId[chat.id]}
                  isGroup={isGroupByChatId[chat.id]}
                  selectionMode={isSelectionMode}
                  isSelected={selectedChatIds.includes(chat.id)}
                  photoUrl={resolvedPhotoUrl}
                  statusSummary={findStatusSummary ? findStatusSummary(chat.contactUserId, chat.name) : allSummaries.find(s =>
                    (chat.contactUserId && s.userId === chat.contactUserId) ||
                    (s.userId === chat.id)
                  )}
                  onOpenStatus={onOpenStatus}
                  disabled={isSelectionMode && chat.contactUserId === userId}
                />
              )
            })
          )}
        </div>
      </ScrollArea>

      {isGroupOpen && (
        <GroupCreatePanel
          userId={userId}
          onClose={() => setIsGroupOpen(false)}
          onGroupCreated={onGroupCreated}
        />
      )}

      <SelectionDialogs
        deleteOpen={deleteConfirmOpen}
        onDeleteOpenChange={setDeleteConfirmOpen}
        clearOpen={clearConfirmOpen}
        onClearOpenChange={setClearConfirmOpen}
        count={selectedChatIds.length}
        canActionForAll={canActionForAll}
        onConfirmDeleteForMe={handleConfirmDeleteForMe}
        onConfirmDeleteForAll={handleConfirmDeleteForAll}
        onConfirmClearForMe={handleConfirmClearForMe}
        onConfirmClearForAll={handleConfirmClearForAll}
      />
    </section>
  );
}

function Pill({
  children,
  active,
  onClick,
  disabled,
}: {
  children: ReactNode;
  active?: boolean;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={cn(
        "h-8 rounded-full px-3 text-xs font-medium transition-colors",
        active
          ? "bg-whatsapp-forest text-[#d9fdd3]"
          : "hover:bg-[#F7F5F3] dark:hover:bg-whatsapp-panel border-border border text-whatsapp-text-muted hover:text-whatsapp-text-primary",
      )}
    >
      {children}
    </button>
  );
}


// Dialogs Rendering Helper relative to render root or inside main
function SelectionDialogs({
  deleteOpen,
  onDeleteOpenChange,
  clearOpen,
  onClearOpenChange,
  count,
  canActionForAll,
  onConfirmDeleteForMe,
  onConfirmDeleteForAll,
  onConfirmClearForMe,
  onConfirmClearForAll
}: any) {
  return (
    <>
      <DeleteChatsDialog
        open={deleteOpen}
        onOpenChange={onDeleteOpenChange}
        count={count}
        canDeleteForAll={canActionForAll}
        onConfirmForMe={onConfirmDeleteForMe}
        onConfirmForAll={onConfirmDeleteForAll}
      />
      <ClearChatDialog
        open={clearOpen}
        onOpenChange={onClearOpenChange}
        canClearForAll={canActionForAll}
        onConfirmForMe={onConfirmClearForMe}
        onConfirmForAll={onConfirmClearForAll}
      />
    </>
  )
}

function ChatRow({
  chat,
  selected,
  onClick,
  typingLabel,
  isGroup,
  selectionMode,
  isSelected,
  photoUrl,
  statusSummary,
  onOpenStatus,
  disabled,
}: {
  chat: ChatPreview;
  selected: boolean;
  onClick: () => void;
  typingLabel?: string;
  isGroup?: boolean;
  selectionMode?: boolean;
  isSelected?: boolean;
  photoUrl?: string | null;
  statusSummary?: StatusSummary;
  onOpenStatus?: (summary: StatusSummary) => void;
  disabled?: boolean;
}) {
  const unread = chat.unreadCount ?? 0;

  const groupAvatarItems = useMemo(() => {
    if (photoUrl) {
      return [{ label: chat.name, src: photoUrl }];
    }
    const words = (chat.name ?? "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    const labels = words.length > 0 ? words : [chat.avatarText];
    return labels.slice(0, 3).map((label) => ({ label }));
  }, [chat.avatarText, chat.name, photoUrl]);

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      onClick={() => !disabled && onClick()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          if (!disabled) onClick();
        }
      }}
      className={cn(
        "flex w-full cursor-pointer items-center gap-3 overflow-hidden rounded-2xl px-3 py-3 text-left transition-all duration-150 outline-none focus-visible:ring-2 focus-visible:ring-whatsapp-forest/80",
        selectionMode
          ? isSelected
            ? "bg-[#F7F5F3] dark:bg-whatsapp-panel ring-1 ring-black/5 dark:ring-white/10 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]"
            : "bg-transparent hover:bg-[#F7F5F3]/80 dark:hover:bg-whatsapp-panel/70"
          : selected
            ? "bg-[#F7F5F3] dark:bg-whatsapp-panel"
            : "hover:bg-[#F7F5F3] dark:hover:bg-whatsapp-panel",
        disabled && "opacity-50 cursor-default hover:bg-transparent dark:hover:bg-transparent"
      )}
    >
      {selectionMode ? (
        <div className="flex h-11 w-11 shrink-0 items-center justify-center">
          {!disabled && (
            <span
              aria-hidden
              className={cn(
                "grid h-5 w-5 place-items-center rounded-full border-2 transition-colors",
                isSelected
                  ? " bg-whatsapp-forest text-white "
                  : "border-white/20 text-transparent",
              )}
            >
              <Check className="h-3 w-3" />
            </span>
          )}
        </div>
      ) : isGroup ? (
        <div className="relative">
          <GroupAvatar items={groupAvatarItems} size="md" />
          {chat.disappearingSetting && chat.disappearingSetting !== "off" ? (
            <span className="absolute -bottom-1 -right-1 grid h-5 w-5 place-items-center rounded-full bg-gray-100 text-gray-900 dark:bg-[#111b21] dark:text-white ring-2 ring-white dark:ring-[#0b141a]">
              <Clock className="h-3 w-3" />
            </span>
          ) : null}
        </div>
      ) : (
        <div
          className="relative h-12 w-12 shrink-0 flex items-center justify-center cursor-pointer group/avatar"
          onClick={(e) => {
            if (statusSummary && onOpenStatus) {
              e.stopPropagation();
              onOpenStatus(statusSummary);
            }
          }}
        >
          {statusSummary && (
            <svg className="absolute inset-0 h-full w-full -rotate-90 transform">
              {statusSummary.statuses.map((s, i) => {
                const total = statusSummary.statuses.length;
                const gap = total > 1 ? 4 : 0;
                const angle = 360 / total;
                const dashArray = (2 * Math.PI * 22);
                const segmentLength = (dashArray / total) - gap;

                return (
                  <circle
                    key={s.id}
                    cx="24"
                    cy="24"
                    r="22"
                    fill="none"
                    stroke={statusSummary.hasNew ? "#25D366" : "#8696a0"}
                    strokeWidth="2.5"
                    strokeDasharray={`${segmentLength} ${dashArray - segmentLength}`}
                    strokeDashoffset={-(angle * i * dashArray / 360)}
                    className="transition-all duration-500"
                  />
                );
              })}
            </svg>
          )}
          <div className={cn(
            "relative h-10 w-10 overflow-hidden rounded-full bg-whatsapp-carbon transition-transform group-hover/avatar:scale-95",
            statusSummary && "ring-2 ring-transparent"
          )}>
            {chat.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={chat.avatarUrl} alt={chat.name} className="absolute inset-0 h-full w-full object-cover" />
            ) : (
              <div className="grid h-full w-full place-items-center text-sm font-semibold text-whatsapp-text-primary">
                {chat.avatarText}
              </div>
            )}
          </div>
          {chat.disappearingSetting && chat.disappearingSetting !== "off" ? (
            <span className="absolute -bottom-1 -right-1 grid h-5 w-5 place-items-center rounded-full bg-gray-100 text-gray-900 dark:bg-[#111b21] dark:text-white ring-2 ring-white dark:ring-[#0b141a]">
              <Clock className="h-3 w-3" />
            </span>
          ) : null}
        </div>
      )}

      <div className="min-w-0 flex-1 overflow-hidden">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate font-medium text-whatsapp-text-primary">
              {chat.name}
            </div>
          </div>
          <div className="shrink-0 text-xs text-whatsapp-text-muted">
            {chat.lastTime}
          </div>
        </div>
        <div className="mt-1  flex items-center justify-between gap-3">
          <div
            className={cn(
              "w-0 min-w-0 flex-1 pr-1 text-sm truncate",
              typingLabel ? "text-whatsapp-forest" : "text-whatsapp-text-muted",
            )}
          >
            {typingLabel ?? (chat.lastReactionEmoji ? `${chat.lastReactionUser || 'Alguien'} reaccionó ${chat.lastReactionEmoji}` : chat.lastMessage)}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {unread > 0 ? (
              <div className="grid h-5 min-w-[20px] place-items-center rounded-full bg-whatsapp-forest px-1.5 text-[11px] font-semibold leading-none text-white">
                {unread > 99 ? "99+" : unread}
              </div>
            ) : null}
            <div className="flex items-center gap-2 text-whatsapp-text-muted">
              {chat.pinned ? <Pin className="h-4 w-4" /> : null}
              {chat.muted ? <BellOff className="h-4 w-4" /> : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
