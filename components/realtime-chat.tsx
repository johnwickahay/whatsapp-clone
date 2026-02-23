'use client'

import { useRealtimeChat, formatMessagePreview } from '@/hooks/use-realtime-chat'
import { type ChatMessage } from '@/components/whatsapp/types'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { AttachmentPreviewOverlay } from '@/components/whatsapp/attachment-preview-overlay'
import { SendContactModal, type SendableContact } from '@/components/whatsapp/send-contact-modal'
import { PollCreateModal } from '@/components/whatsapp/poll-create-modal'
import { ForwardMessageModal } from '@/components/whatsapp/forward-message-modal'
import { createClient } from '@/lib/supabase/client'
import type { GroupIntroCardProps } from '@/components/whatsapp/group-intro-card'
import { MediaViewer, type MediaItem } from '@/components/whatsapp/media-viewer'
import { MessageList } from './whatsapp/message-list'
import { ChatInput } from './whatsapp/chat-input'

interface RealtimeChatProps {
  conversationId: string;
  userId: string;
  username: string;
  isGroup?: boolean;
  onOpenContactChat?: (contact: { id: string; fullName: string }) => void;
  onOpenContactInfo?: () => void;
  onMessage?: (messages: ChatMessage[]) => void;
  messages?: ChatMessage[];
  unreadMarker?: { unreadCount: number; lastReadAt: string | null } | null;
  scrollToMessageId?: string | null;
  selectionMode?: boolean;
  selectedMessageIds?: string[];
  onToggleMessageSelect?: (messageId: string) => void;
  onExitSelectionMode?: () => void;
  onDeleteSelectedMessages?: (id?: string) => void;
  hiddenMessageIds?: string[];
  onDeleteChat?: () => void;
  chatName?: string;
  chatAvatarUrl?: string | null;
  groupIntroCardProps?: Pick<
    GroupIntroCardProps,
    "title" | "meta" | "descriptionHint" | "photoUrl" | "onAddDescription" | "onOpenInfo"
  >;
  creationNoticeText?: string | null;
}

export default function RealtimeChat({
  conversationId,
  userId,
  username,
  isGroup = false,
  onOpenContactChat,
  onOpenContactInfo,
  onMessage,
  messages: providedMessages = [],
  unreadMarker,
  scrollToMessageId = null,
  selectionMode = false,
  selectedMessageIds = [],
  onToggleMessageSelect,
  onExitSelectionMode,
  onDeleteSelectedMessages,
  hiddenMessageIds = [],
  onDeleteChat,
  chatName,
  chatAvatarUrl,
  groupIntroCardProps,
  creationNoticeText,
}: RealtimeChatProps) {
  const messageInputRef = useRef<HTMLInputElement | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [isRecordingPaused, setIsRecordingPaused] = useState(false)
  const [recordingMs, setRecordingMs] = useState(0)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const recorderChunksRef = useRef<BlobPart[]>([])
  const recorderStreamRef = useRef<MediaStream | null>(null)
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const recordingStartedAtRef = useRef<number>(0)
  const recordingAccumulatedMsRef = useRef<number>(0)
  const recordingShouldSendRef = useRef<boolean>(false)
  const recordingCanceledRef = useRef<boolean>(false)

  const {
    messages: hookMessages,
    sendMessage,
    sendAttachment,
    sendContacts,
    sendPoll,
    isLoading,
    isSomeoneTyping,
    typingUsers,
    sendTyping,
    toggleReaction,
  } = useRealtimeChat({
    conversationId,
    userId,
    username,
  })
  const [replyingTo, setReplyingTo] = useState<{ id: string; senderName: string; content: string } | null>(null)
  const [newMessage, setNewMessage] = useState('')
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [contactModalOpen, setContactModalOpen] = useState(false)
  const [pollModalOpen, setPollModalOpen] = useState(false)
  const [forwardModalOpen, setForwardModalOpen] = useState(false)
  const [isForwarding, setIsForwarding] = useState(false)
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isTypingRef = useRef(false)
  const lastTypingSentAtRef = useRef<number>(0)

  const [mediaViewerOpen, setMediaViewerOpen] = useState(false)
  const [mediaViewerIndex, setMediaViewerIndex] = useState(0)

  const mediaItems = useMemo<MediaItem[]>(() => {
    return hookMessages
      .filter((m) => m.messageType === 'image' || m.messageType === 'video')
      .map((m) => ({
        id: m.id,
        url: m.mediaUrl || '',
        type: m.messageType as 'image' | 'video',
        name: m.mediaName,
        senderName: m.user.id === userId ? 'Tú' : m.user.name,
        timestamp: new Date(m.createdAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
        mime: m.mediaMime,
        size: m.mediaSize,
      }))
  }, [hookMessages, userId])

  const handleOpenMedia = useCallback((messageId: string) => {
    const idx = mediaItems.findIndex((m) => m.id === messageId)
    if (idx !== -1) {
      setMediaViewerIndex(idx)
      setMediaViewerOpen(true)
    }
  }, [mediaItems])

  const allMessages = useMemo(() => {
    const base = Array.isArray(providedMessages) ? providedMessages : []
    const mergedMessages = [...base, ...hookMessages]
    const uniqueMessages = mergedMessages.filter(
      (message, index, self) => index === self.findIndex((m) => m.id === message.id)
    )
    return uniqueMessages.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }, [providedMessages, hookMessages])

  useEffect(() => {
    if (onMessage) {
      onMessage(allMessages)
    }
  }, [allMessages, onMessage])

  const filteredVisibleMessages = useMemo(() => {
    if (!hiddenMessageIds || hiddenMessageIds.length === 0) return allMessages
    const hidden = new Set(hiddenMessageIds)
    return allMessages.filter((m) => !hidden.has(m.id))
  }, [hiddenMessageIds, allMessages])

  const stopRecordingInternal = useCallback(
    (mode: 'send' | 'cancel') => {
      recordingShouldSendRef.current = mode === 'send'
      recordingCanceledRef.current = mode === 'cancel'
      const recorder = recorderRef.current
      if (recorder && recorder.state !== 'inactive') {
        try { recorder.stop() } catch { }
      }
      setIsRecording(false)
      setIsRecordingPaused(false)
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current)
        recordingTimerRef.current = null
      }
    },
    []
  )

  const toggleRecording = useCallback(async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) return
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      recorderStreamRef.current = stream
      recorderChunksRef.current = []
      recordingShouldSendRef.current = false
      recordingCanceledRef.current = false
      recordingAccumulatedMsRef.current = 0
      recordingStartedAtRef.current = Date.now()
      setRecordingMs(0)
      setIsRecordingPaused(false)
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current)
      recordingTimerRef.current = setInterval(() => {
        const base = recordingAccumulatedMsRef.current
        const delta = isRecordingPaused ? 0 : Date.now() - recordingStartedAtRef.current
        setRecordingMs(base + delta)
      }, 250)
      const preferred = 'audio/webm;codecs=opus'
      const mimeType = typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(preferred) ? preferred : 'audio/webm'
      const recorder = new MediaRecorder(stream, { mimeType })
      recorderRef.current = recorder
      recorder.ondataavailable = (ev) => { if (ev.data && ev.data.size > 0) recorderChunksRef.current.push(ev.data) }
      recorder.onstop = () => {
        const chunks = recorderChunksRef.current
        recorderChunksRef.current = []
        if (recordingTimerRef.current) { clearInterval(recordingTimerRef.current); recordingTimerRef.current = null }
        const blob = new Blob(chunks, { type: mimeType })
        if (blob.size === 0) return
        if (recordingCanceledRef.current || !recordingShouldSendRef.current) {
          if (recorderStreamRef.current) { for (const t of recorderStreamRef.current.getTracks()) t.stop(); recorderStreamRef.current = null }
          return
        }
        const ext = mimeType.includes('ogg') ? 'ogg' : 'webm'
        const file = new File([blob], `audio_${Date.now()}.${ext}`, { type: mimeType })
        void sendAttachment(file)
        if (recorderStreamRef.current) { for (const t of recorderStreamRef.current.getTracks()) t.stop(); recorderStreamRef.current = null }
      }
      recorder.start()
      setIsRecording(true)
    } catch (err) {
      console.error('Audio recording error:', err)
      setIsRecording(false)
      if (recorderStreamRef.current) { for (const t of recorderStreamRef.current.getTracks()) t.stop(); recorderStreamRef.current = null }
    }
  }, [isRecordingPaused, sendAttachment])

  const togglePauseRecording = useCallback(() => {
    const recorder = recorderRef.current
    if (!recorder) return
    if (recorder.state === 'recording') {
      try { recorder.pause() } catch { return }
      const elapsed = Date.now() - recordingStartedAtRef.current
      recordingAccumulatedMsRef.current += elapsed
      recordingStartedAtRef.current = Date.now()
      setIsRecordingPaused(true)
      setRecordingMs(recordingAccumulatedMsRef.current)
      return
    }
    if (recorder.state === 'paused') {
      try { recorder.resume() } catch { return }
      recordingStartedAtRef.current = Date.now()
      setIsRecordingPaused(false)
    }
  }, [])

  const handleSendMessage = useCallback(
    async (e: React.FormEvent, explicitContent?: string) => {
      e.preventDefault()
      const trimmed = (explicitContent !== undefined ? explicitContent : newMessage).trim()
      if (pendingFiles.length > 0) {
        const files = pendingFiles
        if (files.length === 1) {
          await sendAttachment(files[0], trimmed)
        } else {
          for (const f of files) await sendAttachment(f)
          if (trimmed) await sendMessage(trimmed, replyingTo?.id)
        }
        setPendingFiles([])
        setNewMessage('')
        setReplyingTo(null)
      } else {
        if (!trimmed) return
        await sendMessage(trimmed, replyingTo?.id)
        setNewMessage('')
        setReplyingTo(null)
      }
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
      if (isTypingRef.current) { isTypingRef.current = false; void sendTyping(false) }
    },
    [newMessage, pendingFiles, replyingTo?.id, sendAttachment, sendTyping, sendMessage]
  )

  const handleChange = useCallback(
    (v: string) => {
      setNewMessage(v)
      const hasText = Boolean(v.trim())
      if (!hasText) {
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
        if (isTypingRef.current) { isTypingRef.current = false; void sendTyping(false) }
        return
      }
      if (!isTypingRef.current) {
        isTypingRef.current = true
        lastTypingSentAtRef.current = Date.now()
        void sendTyping(true)
      } else {
        const now = Date.now()
        if (now - lastTypingSentAtRef.current >= 1000) {
          lastTypingSentAtRef.current = now
          void sendTyping(true)
        }
      }
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
      typingTimeoutRef.current = setTimeout(() => {
        if (!isTypingRef.current) return
        isTypingRef.current = false
        lastTypingSentAtRef.current = 0
        void sendTyping(false)
      }, 2000)
    },
    [sendTyping]
  )

  const insertEmoji = useCallback(
    (emoji: string) => {
      const el = messageInputRef.current as any
      const current = newMessage
      const start = el?.selectionStart ?? current.length
      const end = el?.selectionEnd ?? current.length
      const next = current.slice(0, start) + emoji + current.slice(end)
      handleChange(next)
      requestAnimationFrame(() => {
        const input = messageInputRef.current as any
        if (!input) return
        input.focus()
        const pos = start + emoji.length
        input.setSelectionRange(pos, pos)
      })
    },
    [handleChange, newMessage]
  )

  return (
    <div className="relative flex h-full flex-col">
      <AttachmentPreviewOverlay
        files={pendingFiles}
        onFilesChange={(next) => setPendingFiles(next)}
        onSend={(caption) => {
          const ev = { preventDefault: () => { } } as unknown as React.FormEvent
          handleSendMessage(ev, caption)
        }}
      />
      <SendContactModal
        open={contactModalOpen}
        onOpenChange={setContactModalOpen}
        userId={userId}
        onSend={(contacts: SendableContact[]) => {
          void sendContacts(contacts.map((c) => ({ id: c.id, fullName: c.fullName, email: c.email ?? null, avatarUrl: c.avatarUrl })))
        }}
      />
      <PollCreateModal
        open={pollModalOpen}
        onOpenChange={setPollModalOpen}
        onSend={(payload) => { void sendPoll(payload) }}
      />
      <ForwardMessageModal
        open={forwardModalOpen}
        onOpenChange={setForwardModalOpen}
        userId={userId}
        messageCount={selectedMessageIds.length}
        currentConversationId={conversationId}
        onForward={async (recipientConversationIds) => {
          if (selectedMessageIds.length === 0) return
          setIsForwarding(true)
          try {
            const supabase = createClient()
            const { data: messagesToForward } = await supabase.from('messages').select('body, message_type, media_url, media_name, media_mime, media_size').in('id', selectedMessageIds).eq('conversation_id', conversationId)
            if (!messagesToForward) return
            for (const recipientConvoId of recipientConversationIds) {
              for (const msg of messagesToForward) {
                await supabase.from('messages').insert({ conversation_id: recipientConvoId, sender_id: userId, body: msg.body, message_type: msg.message_type || 'text', media_url: msg.media_url, media_name: msg.media_name, media_mime: msg.media_mime, media_size: msg.media_size, is_forwarded: true })
              }
            }
            onExitSelectionMode?.()
          } finally { setIsForwarding(false) }
        }}
      />

      <MessageList
        messages={filteredVisibleMessages}
        userId={userId}
        isGroup={isGroup}
        isLoading={isLoading}
        unreadMarker={unreadMarker}
        scrollToMessageId={scrollToMessageId}
        selectionMode={selectionMode}
        selectedMessageIds={selectedMessageIds}
        onToggleMessageSelect={onToggleMessageSelect}
        onOpenContactChat={onOpenContactChat}
        onOpenContactInfo={onOpenContactInfo}
        onOpenMedia={handleOpenMedia}
        onReply={(msg) => {
          setReplyingTo({ id: msg.id, senderName: msg.user.name, content: formatMessagePreview(msg.content, msg.messageType || null) })
          if (messageInputRef.current) (messageInputRef.current as any).focus()
        }}
        onForward={(msg) => {
          if (!selectedMessageIds.includes(msg.id)) onToggleMessageSelect?.(msg.id)
          setForwardModalOpen(true)
        }}
        onDelete={(id) => onDeleteSelectedMessages?.(id)}
        onReact={toggleReaction}
        isSomeoneTyping={isSomeoneTyping}
        typingUsers={typingUsers}
        groupIntroCardProps={groupIntroCardProps}
        creationNoticeText={creationNoticeText}
        chatName={chatName}
        username={username}
        chatAvatarUrl={chatAvatarUrl}
        onDeleteChat={onDeleteChat}
        conversationId={conversationId}
      />

      {selectionMode ? (
        <div className="border-t border-whatsapp-glass dark:bg-[#161717] bg-white px-3 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => onExitSelectionMode?.()} className="grid h-10 w-10 place-items-center rounded-full text-whatsapp-text-muted hover:bg-[#F7F5F3] dark:hover:bg-whatsapp-panel hover:text-whatsapp-text-primary" aria-label="Cancelar">
                <XIcon className="h-5 w-5" />
              </button>
              <div className="text-sm font-medium text-whatsapp-text-primary">{selectedMessageIds.length} seleccionados</div>
            </div>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => setForwardModalOpen(true)} disabled={selectedMessageIds.length === 0 || isForwarding} className="grid h-10 w-10 place-items-center rounded-full text-whatsapp-text-muted transition-colors hover:bg-whatsapp-panel hover:text-whatsapp-text-primary disabled:opacity-50" aria-label="Reenviar"><ForwardIcon className="h-5 w-5" /></button>
              <button type="button" onClick={() => onDeleteSelectedMessages?.()} disabled={selectedMessageIds.length === 0} className="grid h-10 w-10 place-items-center rounded-full text-whatsapp-text-muted transition-colors hover:bg-whatsapp-panel hover:text-rose-500 disabled:opacity-50" aria-label="Eliminar"><Trash2Icon className="h-5 w-5" /></button>
            </div>
          </div>
        </div>
      ) : (
        <ChatInput
          isRecording={isRecording}
          isLoading={isLoading}
          replyingTo={replyingTo}
          newMessage={newMessage}
          recordingMs={recordingMs}
          isRecordingPaused={isRecordingPaused}
          emojiOpen={emojiOpen}
          textareaRef={messageInputRef as any}
          onSetNewMessage={handleChange}
          onSetReplyingTo={setReplyingTo}
          onStopRecordingInternal={stopRecordingInternal}
          onTogglePauseRecording={togglePauseRecording}
          onSend={handleSendMessage}
          onToggleRecording={toggleRecording}
          onInsertEmoji={insertEmoji}
          onSetEmojiOpen={setEmojiOpen}
          onSelectFiles={(files) => setPendingFiles((prev) => [...prev, ...files])}
          onSetContactModalOpen={setContactModalOpen}
          onSetPollModalOpen={setPollModalOpen}
        />
      )}

      <MediaViewer
        items={mediaItems}
        initialIndex={mediaViewerIndex}
        isOpen={mediaViewerOpen}
        onClose={() => setMediaViewerOpen(false)}
        onReply={(id) => {
          const msg = hookMessages.find((m) => m.id === id)
          if (msg) {
            setReplyingTo({ id: msg.id, senderName: msg.user.name, content: formatMessagePreview(msg.content, msg.messageType || null) })
            setMediaViewerOpen(false)
            if (messageInputRef.current) (messageInputRef.current as any).focus()
          }
        }}
        onForward={(id) => {
          if (!selectedMessageIds.includes(id)) onToggleMessageSelect?.(id)
          setForwardModalOpen(true)
          setMediaViewerOpen(false)
        }}
        onDelete={(id) => {
          onDeleteSelectedMessages?.(id)
          setMediaViewerOpen(false)
        }}
        onReact={(id, emoji) => { void toggleReaction(id, emoji) }}
      />
    </div>
  )
}

function XIcon(props: any) {
  return (
    <svg {...props} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}

function ForwardIcon(props: any) {
  return (
    <svg {...props} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
    </svg>
  )
}

function Trash2Icon(props: any) {
  return (
    <svg {...props} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  )
}
