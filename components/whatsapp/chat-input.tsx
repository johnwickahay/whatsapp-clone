'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Mic, Pause, Play, Send, Smile, Trash2 } from 'lucide-react'
import { useDropzone } from 'react-dropzone'
import { cn } from '@/lib/utils'
import { ReplyPreview } from '@/components/whatsapp/reply-preview'
import { AttachmentsMenu } from '@/components/whatsapp/attachments-menu'
import { EmojiPicker } from '@/components/ui/emoji-picker'

function formatRecordingTime(ms: number) {
  const totalSeconds = Math.floor(ms / 1000)
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${String(m).padStart(1, '0')}:${String(s).padStart(2, '0')}`
}

interface ChatInputProps {
  isRecording: boolean
  isLoading: boolean
  replyingTo: { id: string; senderName: string; content: string } | null
  newMessage: string
  recordingMs: number
  isRecordingPaused: boolean
  emojiOpen: boolean
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
  onSetNewMessage: (v: string) => void
  onSetReplyingTo: (val: any) => void
  onStopRecordingInternal: (mode: 'send' | 'cancel') => void
  onTogglePauseRecording: () => void
  onSend: (e: React.FormEvent, explicitContent?: string) => void
  onToggleRecording: () => void
  onInsertEmoji: (emoji: string) => void
  onSetEmojiOpen: (open: boolean) => void
  onSelectFiles: (files: File[]) => void
  onSetContactModalOpen: (open: boolean) => void
  onSetPollModalOpen: (open: boolean) => void
}

export function ChatInput({
  isRecording,
  isLoading,
  replyingTo,
  newMessage,
  recordingMs,
  isRecordingPaused,
  emojiOpen,
  textareaRef,
  onSetNewMessage,
  onSetReplyingTo,
  onStopRecordingInternal,
  onTogglePauseRecording,
  onSend,
  onToggleRecording,
  onInsertEmoji,
  onSetEmojiOpen,
  onSelectFiles,
  onSetContactModalOpen,
  onSetPollModalOpen,
}: ChatInputProps) {

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px'
    }
  }, [newMessage, textareaRef])

  const onDrop = useCallback((acceptedFiles: File[]) => {
    onSelectFiles(acceptedFiles)
  }, [onSelectFiles])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    noClick: true,
    noKeyboard: true,
    accept: {
      'image/*': [],
      'video/*': [],
      'application/*': [],
      'text/*': []
    }
  })

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (newMessage.trim()) {
        onSend(e as unknown as React.FormEvent)
      }
    }
  }

  if (isRecording) {
    return (
      <div className="flex w-full items-end gap-3 border-t border-whatsapp-glass px-3 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:pb-3">
        <div className="flex-1 min-w-0 flex flex-col">
          <ReplyPreview replyTo={replyingTo} onCancel={() => onSetReplyingTo(null)} />
          <div className="flex w-full items-center gap-3">
            <button
              type="button"
              onClick={() => onStopRecordingInternal('cancel')}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-whatsapp-text-muted transition-colors hover:bg-whatsapp-panel hover:text-whatsapp-text-primary"
              aria-label="Cancelar audio"
            >
              <Trash2 className="h-5 w-5" />
            </button>

            <div className="flex flex-1 items-center justify-between gap-3 rounded-full bg-whatsapp-carbon px-4 py-2 text-whatsapp-text-primary">
              <div className="flex min-w-0 items-center gap-3">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-rose-500" />
                <span className="shrink-0 text-sm tabular-nums">{formatRecordingTime(recordingMs)}</span>
              </div>

              <div className="flex flex-1 items-center justify-center px-2">
                <div className="h-2 w-full max-w-[360px] rounded-full bg-black/10" />
              </div>

              <button
                type="button"
                onClick={onTogglePauseRecording}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-whatsapp-text-muted transition-colors hover:bg-whatsapp-panel hover:text-whatsapp-text-primary"
                aria-label={isRecordingPaused ? 'Reanudar' : 'Pausar'}
              >
                {isRecordingPaused ? <Play className="h-5 w-5" /> : <Pause className="h-5 w-5" />}
              </button>
            </div>

            <button
              type="button"
              onClick={() => onStopRecordingInternal('send')}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-whatsapp-forest text-white transition-colors hover:bg-whatsapp-deep-forest"
              aria-label="Enviar audio"
            >
              <Send className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <form
      onSubmit={onSend}
      className={cn(
        "flex w-full items-end gap-3 border-t border-whatsapp-glass px-3 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:pb-3",
        isDragActive ? "bg-whatsapp-panel/30" : ""
      )}
    >
      <div className="flex-1 min-w-0 flex flex-col">
        <ReplyPreview replyTo={replyingTo} onCancel={() => onSetReplyingTo(null)} />

        <div
          {...getRootProps()}
          className={cn(
            "flex items-end gap-2 border border-whatsapp-border-soft bg-white  dark:bg-[#242626]  px-2 py-1.5 transition-colors",
            replyingTo ? "rounded-b-3xl border-t-0" : "rounded-[24px]",
            isDragActive ? "ring-2 ring-whatsapp-forest border-transparent" : ""
          )}
        >
          <input {...getInputProps()} className="hidden" />

          <div className="mb-1">
            <AttachmentsMenu
              onSelectFiles={(_kind, files) => {
                onSelectFiles(Array.from(files))
              }}
              onSelectContact={() => onSetContactModalOpen(true)}
              onSelectPoll={() => onSetPollModalOpen(true)}
            />
          </div>

          <div className="mb-1">
            <EmojiPicker
              open={emojiOpen}
              onOpenChange={onSetEmojiOpen}
              onSelect={(emoji) => onInsertEmoji(emoji)}
              className="border-whatsapp-glass bg-whatsapp-carbon text-whatsapp-text-primary"
            >
              <button
                type="button"
                className="grid h-9 w-9 place-items-center rounded-full hover:bg-whatsapp-panel hover:text-whatsapp-text-primary text-whatsapp-text-muted"
                aria-label="Emoji"
              >
                <Smile className="h-6 w-6" />
              </button>
            </EmojiPicker>
          </div>

          <textarea
            ref={textareaRef}
            className="max-h-[120px] min-h-[2.5rem] flex-1 resize-none bg-transparent py-2 text-[15px] leading-6 text-whatsapp-text-primary outline-none placeholder:text-whatsapp-text-muted scrollbar-hide"
            value={newMessage}
            disabled={isLoading}
            onChange={(e) => onSetNewMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Escribe un mensaje"
            rows={1}
            style={{ height: 'auto' }}
          />

          <div className="mb-1 mr-1">
            {newMessage.trim() ? (
              <button
                type="submit"
                disabled={isLoading}
                className="grid h-9 w-9 place-items-center rounded-full bg-whatsapp-forest text-white transition-all hover:bg-whatsapp-deep-forest animate-in zoom-in-50 duration-200"
                aria-label="Enviar"
              >
                <Send className="h-5 w-5 pl-0.5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void onToggleRecording()}
                className="grid h-9 w-9 place-items-center rounded-full text-whatsapp-text-muted hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                aria-label="Nota de voz"
              >
                <Mic className="h-6 w-6" />
              </button>
            )}
          </div>
        </div>
      </div>
    </form>
  )
}
