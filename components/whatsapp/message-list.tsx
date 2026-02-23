'use client'

import { type ReactNode, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Check, Square } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ChatMessageItem } from '@/components/chat-message'
import { useChatScroll } from '@/hooks/use-chat-scroll'
import { type ChatMessage } from './types'
import { Skeleton } from '@/components/ui/skeleton'
import { GroupIntroCard } from '@/components/whatsapp/group-intro-card'
import { ChatIntroSection } from '@/components/whatsapp/chat-intro-section'

const ENCRYPTION_NOTICE_TEXT =
  'Los mensajes y las llamadas están cifrados de extremo a extremo. Solo las personas en este chat pueden leerlos, escucharlos o compartirlos. Haz clic para obtener más información.'

function isEncryptionNoticeMessage(message: ChatMessage) {
  const type = (message.messageType ?? '').trim().toLowerCase()
  if (type !== 'system') return false
  const body = (message.content ?? '').trim()
  return body === ENCRYPTION_NOTICE_TEXT
}

interface MessageListProps {
  messages: ChatMessage[]
  userId: string
  isGroup: boolean
  isLoading: boolean
  unreadMarker?: { unreadCount: number; lastReadAt: string | null } | null
  scrollToMessageId?: string | null
  selectionMode?: boolean
  selectedMessageIds?: string[]
  onToggleMessageSelect?: (id: string) => void
  onOpenContactChat?: (contact: { id: string; fullName: string }) => void
  onOpenContactInfo?: () => void
  onOpenMedia: (id: string) => void
  onReply: (msg: ChatMessage) => void
  onForward: (msg: ChatMessage) => void
  onDelete: (id: string) => void
  onReact: (id: string, emoji: string) => void
  isSomeoneTyping: boolean
  typingUsers: Array<{ id: string; name: string; avatarUrl?: string | null }>
  groupIntroCardProps?: any
  creationNoticeText?: string | null
  chatName?: string
  username?: string
  chatAvatarUrl?: string | null
  onDeleteChat?: () => void
  conversationId: string
}

export function MessageList({
  messages,
  userId,
  isGroup,
  isLoading,
  unreadMarker,
  scrollToMessageId,
  selectionMode,
  selectedMessageIds = [],
  onToggleMessageSelect,
  onOpenContactChat,
  onOpenContactInfo,
  onOpenMedia,
  onReply,
  onForward,
  onDelete,
  onReact,
  isSomeoneTyping,
  typingUsers,
  groupIntroCardProps,
  creationNoticeText,
  chatName,
  username,
  chatAvatarUrl,
  onDeleteChat,
  conversationId,
}: MessageListProps) {
  const { containerRef, scrollToBottom } = useChatScroll()
  const hasInitialScrolledRef = useRef(false)
  const initialStickUntilRef = useRef<number>(0)
  const interruptedInitialStickRef = useRef(false)
  const [showUnreadMarker, setShowUnreadMarker] = useState(false)
  const [showOnlyUnread, setShowOnlyUnread] = useState(false)
  const [highlightMessageId, setHighlightMessageId] = useState<string | null>(null)
  const lastScrollRequestRef = useRef<string | null>(null)
  const suppressAutoScrollUntilRef = useRef<number>(0)
  const [showScrollToLatest, setShowScrollToLatest] = useState(false)

  const handleScrollToMessage = useCallback((messageId: string) => {
    const el = document.getElementById(`message-${messageId}`)
    if (el) {
      suppressAutoScrollUntilRef.current = Date.now() + 1000
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setHighlightMessageId(messageId)
      setTimeout(() => setHighlightMessageId((prev) => (prev === messageId ? null : prev)), 2000)
    }
  }, [])

  useEffect(() => {
    if (!unreadMarker || !unreadMarker.unreadCount) return
    setShowUnreadMarker(true)
    setShowOnlyUnread(true)
    const t = setTimeout(() => setShowUnreadMarker(false), 6000)
    return () => clearTimeout(t)
  }, [unreadMarker])

  useEffect(() => {
    setShowOnlyUnread(false)
    setShowUnreadMarker(false)
  }, [conversationId])

  useEffect(() => {
    let cancelled = false
    let el: HTMLDivElement | null = null

    const attach = () => {
      if (cancelled) return
      el = containerRef.current
      if (!el) {
        requestAnimationFrame(attach)
        return
      }

      const update = () => {
        const distanceFromBottom = el!.scrollHeight - el!.scrollTop - el!.clientHeight
        const isScrollable = el!.scrollHeight - el!.clientHeight > 1
        const threshold = Math.min(240, Math.max(120, Math.floor(el!.clientHeight * 0.25)))
        setShowScrollToLatest(isScrollable && distanceFromBottom > threshold)
      }

      update()
      el.addEventListener('scroll', update, { passive: true })
      window.addEventListener('resize', update)
      const ro = new ResizeObserver(() => update())
      ro.observe(el)

      return () => {
        el?.removeEventListener('scroll', update)
        window.removeEventListener('resize', update)
        ro.disconnect()
      }
    }

    const cleanup = attach()
    return () => {
      cancelled = true
      if (cleanup) cleanup()
    }
  }, [containerRef, conversationId, messages.length])

  useEffect(() => {
    if (!scrollToMessageId) return
    suppressAutoScrollUntilRef.current = Date.now() + 2000
    const requestKey = `${scrollToMessageId}:${Date.now()}`
    lastScrollRequestRef.current = requestKey

    let attempts = 0
    const maxAttempts = 20
    const intervalMs = 50

    const tryScroll = () => {
      if (lastScrollRequestRef.current !== requestKey) return
      const el = document.getElementById(`message-${scrollToMessageId}`)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        setHighlightMessageId(scrollToMessageId)
        const t = setTimeout(
          () => setHighlightMessageId((prev) => (prev === scrollToMessageId ? null : prev)),
          1800
        )
        return () => clearTimeout(t)
      }
      attempts += 1
      if (attempts >= maxAttempts) return
      setTimeout(tryScroll, intervalMs)
    }
    tryScroll()
  }, [scrollToMessageId])

  useEffect(() => {
    hasInitialScrolledRef.current = false
    initialStickUntilRef.current = 0
    interruptedInitialStickRef.current = false
  }, [conversationId])

  useLayoutEffect(() => {
    if (hasInitialScrolledRef.current) return
    if (messages.length === 0) return
    if (scrollToMessageId) return
    scrollToBottom('auto')
    hasInitialScrolledRef.current = true
    initialStickUntilRef.current = Date.now() + 1500
    interruptedInitialStickRef.current = false
  }, [messages.length, scrollToBottom, scrollToMessageId])

  useEffect(() => {
    if (!hasInitialScrolledRef.current) return
    if (scrollToMessageId) return
    const el = containerRef.current
    if (!el) return
    const threshold = 120
    const shouldStick = () => !interruptedInitialStickRef.current && Date.now() < initialStickUntilRef.current
    const stickToBottomIfNeeded = () => {
      if (!shouldStick()) return
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
      if (distanceFromBottom > threshold) return
      scrollToBottom('auto')
    }
    const onScroll = () => {
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
      if (distanceFromBottom > threshold) interruptedInitialStickRef.current = true
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    const ro = new ResizeObserver(() => stickToBottomIfNeeded())
    ro.observe(el)
    const onLoadCapture = (event: Event) => {
      const target = event.target as HTMLElement | null
      if (target?.tagName === 'IMG' || target?.tagName === 'VIDEO') stickToBottomIfNeeded()
    }
    el.addEventListener('load', onLoadCapture, true)
    const raf = requestAnimationFrame(() => stickToBottomIfNeeded())
    return () => {
      cancelAnimationFrame(raf)
      el.removeEventListener('scroll', onScroll)
      el.removeEventListener('load', onLoadCapture, true)
      ro.disconnect()
    }
  }, [containerRef, scrollToBottom, scrollToMessageId])

  useEffect(() => {
    if (!hasInitialScrolledRef.current) return
    if (scrollToMessageId) return
    if (Date.now() < suppressAutoScrollUntilRef.current) return
    const el = containerRef.current
    if (!el) return
    const threshold = 120
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    if (distanceFromBottom > threshold) return
    scrollToBottom('smooth')
  }, [messages, scrollToBottom, scrollToMessageId, containerRef])

  const unreadIndex = useMemo(() => {
    if (!showUnreadMarker || !unreadMarker?.unreadCount) return -1
    if (!unreadMarker.lastReadAt) return Math.max(0, messages.length - unreadMarker.unreadCount)
    const ts = Date.parse(unreadMarker.lastReadAt)
    if (!Number.isFinite(ts)) return Math.max(0, messages.length - unreadMarker.unreadCount)
    return messages.findIndex((m) => Date.parse(m.createdAt) > ts)
  }, [messages, showUnreadMarker, unreadMarker])

  const visibleMessages = useMemo(() => {
    if (!showOnlyUnread) return messages
    if (!unreadMarker?.unreadCount) return messages
    const idx = unreadIndex >= 0 ? unreadIndex : Math.max(0, messages.length - unreadMarker.unreadCount)
    return messages.slice(idx)
  }, [messages, showOnlyUnread, unreadIndex, unreadMarker])

  const skeletonMessages = [
    { width: 'w-3/5', alignRight: false },
    { width: 'w-2/5', alignRight: true },
    { width: 'w-4/6', alignRight: false },
    { width: 'w-1/2', alignRight: true },
  ]

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      {showScrollToLatest && (
        <button
          type="button"
          onClick={() => scrollToBottom('smooth')}
          className="absolute bottom-4 right-4 z-20 grid h-10 w-10 place-items-center rounded-full bg-background/90 text-whatsapp-text-primary shadow-lg ring-1 ring-border hover:bg-background"
          aria-label="Ir al último mensaje"
        >
          <ChevronDown className="h-5 w-5" />
        </button>
      )}

      <div
        ref={containerRef}
        className="relative flex-1 overflow-y-auto px-4 py-6"
      >
        {isLoading && (
          <div className="mx-auto w-full px-2 py-10 space-y-8">
            <div className="space-y-5">
              {skeletonMessages.map(({ width, alignRight }, idx) => (
                <div key={idx} className={cn('flex items-start gap-3', alignRight ? 'justify-end pl-10' : 'justify-start pr-10')}>
                  {!alignRight && <Skeleton className="h-10 w-10 shrink-0 rounded-full bg-black/20 dark:bg-white/10 self-start" />}
                  <div className={cn('w-full max-w-[70%] space-y-2 rounded-3xl border px-4 py-3 backdrop-blur-sm', alignRight ? 'border-whatsapp-border-soft/40 bg-whatsapp-panel/70' : 'border-white/10 bg-black/10 dark:bg-white/5')}>
                    <Skeleton className="h-3 w-16 rounded-full bg-white/30 dark:bg-white/20" />
                    <Skeleton className={cn('h-4 rounded-full mb-10 bg-white/40 dark:bg-white/30', width)} />
                    <Skeleton className="h-3 w-14 rounded-full bg-white/30/70 dark:bg-white/20/50" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <ChatIntroSection
          isGroup={Boolean(isGroup)}
          encryptionNoticeText={ENCRYPTION_NOTICE_TEXT}
          creationNoticeText={creationNoticeText && !isGroup ? creationNoticeText : undefined}
          unreadCount={unreadMarker?.unreadCount ?? 0}
          showOnlyUnread={showOnlyUnread}
          onShowAllUnread={() => setShowOnlyUnread(false)}
          showNewChatActions={!isGroup && !isLoading && chatName !== "Yo (Tú)"}
          newChatActions={!isGroup && !isLoading && chatName !== "Yo (Tú)" ? {
            phoneNumber: chatName || username || '',
            avatarUrl: chatAvatarUrl,
            fallbackInitial: (chatName || username || '?').trim().charAt(0).toUpperCase() || '?',
            onDelete: onDeleteChat,
            onOpenContactInfo,
          } : null}
          className="mb-2"
        />

        <div className={cn("space-y-1", isLoading ? "pointer-events-none opacity-0" : "")}>
          {(() => {
            const shouldRenderGroupIntro = Boolean(groupIntroCardProps);
            let groupIntroInserted = false;
            const nodes: ReactNode[] = [];

            visibleMessages.forEach((message, index) => {
              if (isGroup && isEncryptionNoticeMessage(message)) return;
              const prevMessage = index > 0 ? visibleMessages[index - 1] : null;
              const showHeader = !prevMessage || prevMessage.user.id !== message.user.id;
              const isSelected = selectedMessageIds.includes(message.id);
              const isSystemMessage = (message.messageType ?? "").trim().toLowerCase() === "system";

              if (shouldRenderGroupIntro && !groupIntroInserted && isSystemMessage && message.content.toLowerCase().startsWith("nuevo grupo creado")) {
                groupIntroInserted = true;
                nodes.push(
                  <div key={`group-intro-${message.id}`} className="mb-6 mt-4 flex justify-center px-4 sm:px-6">
                    <GroupIntroCard {...groupIntroCardProps} className="w-full max-w-md" />
                  </div>
                );
              }

              nodes.push(
                <div id={`message-${message.id}`} key={message.id} className={cn("animate-in fade-in slide-in-from-bottom-4 duration-300", highlightMessageId === message.id ? "rounded-xl ring-2 ring-whatsapp-forest/70" : "")}>
                  {selectionMode && !isSystemMessage ? (
                    <div role="button" tabIndex={0} onClick={() => onToggleMessageSelect?.(message.id)} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onToggleMessageSelect?.(message.id))} className={cn("group relative -mx-2 rounded-2xl px-2 text-left transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-whatsapp-forest/60", isSelected ? "bg-whatsapp-panel/80 dark:bg-white/10" : "hover:bg-whatsapp-panel/60 dark:hover:bg-white/5")}>
                      <span className={cn("pointer-events-none absolute left-2 top-2 grid h-6 w-6 place-items-center rounded-full border-2", isSelected ? "border-whatsapp-forest bg-whatsapp-forest text-white" : "border-white/30 bg-black/10 text-transparent")}>
                        {isSelected ? <Check className="h-4 w-4" /> : <Square className="h-3.5 w-3.5" />}
                      </span>
                      <div className="pl-10">
                        <ChatMessageItem message={message} isOwnMessage={message.user.id === userId} showHeader={showHeader} isGroup={isGroup} onOpenContactChat={onOpenContactChat} currentUserId={userId} onOpenMedia={onOpenMedia} onScrollToMessage={handleScrollToMessage} />
                      </div>
                    </div>
                  ) : (
                    <div className={selectionMode ? "pl-4" : undefined}>
                      <ChatMessageItem message={message} isOwnMessage={message.user.id === userId} showHeader={showHeader} isGroup={isGroup} onOpenContactChat={onOpenContactChat} currentUserId={userId} onReact={onReact} onForward={() => onForward(message)} onReply={() => onReply(message)} onOpenMedia={onOpenMedia} onScrollToMessage={handleScrollToMessage} onDelete={onDelete} />
                    </div>
                  )}
                </div>
              );
            });

            if (shouldRenderGroupIntro && !groupIntroInserted) {
              nodes.unshift(<div key="group-intro-fallback" className="mb-6 mt-4 flex justify-center px-4 sm:px-6"><GroupIntroCard {...groupIntroCardProps} className="w-full max-w-md" /></div>);
            }
            return nodes;
          })()}

          {isSomeoneTyping && typingUsers.length > 0 && (
            <div className="group mt-4 flex gap-2 items-start animate-in fade-in slide-in-from-bottom-2 duration-200">
              {isGroup && (
                <div className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-full bg-whatsapp-carbon text-xs font-semibold text-whatsapp-text-primary">
                  {typingUsers[0].avatarUrl ? <img src={typingUsers[0].avatarUrl} alt={typingUsers[0].name} className="h-full w-full object-cover" /> : <span>{typingUsers[0].name.trim().slice(0, 1).toUpperCase() || 'U'}</span>}
                </div>
              )}
              <div className="relative flex w-fit max-w-[55%] flex-col">
                {isGroup && <div className="mb-0.5 ml-3 text-xs font-semibold text-whatsapp-text-green">{typingUsers[0].name}</div>}
                <div className={cn('relative w-fit px-4 py-3 text-sm leading-snug shadow-sm rounded-r-lg rounded-bl-lg bg-white dark:bg-[#202c33] rounded-tl-none')}>
                  <span className="absolute top-0 h-3 w-3 -left-2 bg-white dark:bg-[#202c33] [clip-path:polygon(100%_0,100%_100%,0_0)]" />
                  <div className="flex items-center gap-1" aria-label="Escribiendo">
                    <span className="h-2 w-2 animate-bounce rounded-full bg-[#8696a0] [animation-delay:-0.3s] [animation-duration:1.4s]" />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-[#8696a0] [animation-delay:-0.15s] [animation-duration:1.4s]" />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-[#8696a0] [animation-duration:1.4s]" />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
