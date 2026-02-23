"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";

import { IconSidebar } from "./icon-sidebar";
import { ChatListPanel } from "./chat-list-panel";
import { ChatViewPanel } from "./chat-view-panel";
import { StatusPanel, StatusViewer } from "./status-panel";
import { type StatusSummary, type StatusRecord } from "./types";
import { SettingsPanel } from "./settings-panel";
import { ProfilePanel } from "./profile-panel";
import { PeoplePanel } from "./people-panel";
import { MessageHome } from "../icons/message-home";
import { WallpaperModal } from "./wallpaper-modal";
import { useHomeData } from "./hooks/use-home-data";
import { toast, type Toast } from "@/lib/toast-utils";

export function WhatsAppHomeShell() {
  const [section, setSection] = useState<
    "chats" | "people" | "status" | "settings" | "profile"
  >("chats");
  const [selectedChatId, setSelectedChatId] = useState<string>("");
  const [activeSummary, setActiveSummary] = useState<StatusSummary | null>(null);
  const [isWallpaperModalOpen, setIsWallpaperModalOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    return toast.subscribe(setToasts);
  }, []);

  const {
    userId,
    username,
    onlineUserIds,
    chats,
    isLoadingChats,
    profileFullName,
    profileAvatarUrl,
    profileInitials,
    wallpaper,
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
  } = useHomeData(selectedChatId, setSelectedChatId);

  const handleOpenStatus = (summary: StatusSummary) => {
    setActiveSummary(summary);
    if (summary.userId !== userId) {
      summary.statuses.forEach((s: StatusRecord) => markAsViewed(s.id));
    }
  };

  const selectedChat = useMemo(
    () => (selectedChatId ? chats.find((c) => c.id === selectedChatId) ?? null : null),
    [chats, selectedChatId],
  );

  const handleStartChat = (next: { conversationId: string; title: string; avatarUrl?: string | null }) => {
    // This is handled by the hook's subscription to conversation_members
    // but we still want to select it immediately
    setSelectedChatId(next.conversationId);
    setSection("chats");
  };

  const router = useRouter();

  useEffect(() => {
    if (!isLoadingChats && !userId) {
      router.push('/auth/login');
    }
  }, [isLoadingChats, userId, router]);

  if (!isLoadingChats && !userId) {
    return null;
  }

  return (
    <main className="h-[100svh] w-full bg-background">
      <div className="mx-auto flex h-full w-full max-w-[1400px] overflow-hidden rounded-none bg-whatsapp-carbon">
        <div className="flex h-full w-full overflow-hidden rounded-none pb-16 md:pb-0">
          <IconSidebar
            active={section}
            onNavigate={setSection}
            profileInitials={profileInitials}
            profileAvatarUrl={profileAvatarUrl}
          />

          {section === "status" ? (
            <StatusPanel
              userId={userId}
              profileInitials={profileInitials}
              profileAvatarUrl={profileAvatarUrl}
              profileName={profileFullName}
            />
          ) : section === "settings" ? (
            <SettingsPanel onOpenWallpaper={() => setIsWallpaperModalOpen(true)} />
          ) : section === "people" ? (
            <PeoplePanel userId={userId} onStartChat={handleStartChat} />
          ) : section === "profile" ? (
            <ProfilePanel onProfileUpdated={handleProfileUpdated} />
          ) : (
            <>
              <ChatListPanel
                chats={chats}
                selectedChatId={selectedChatId}
                onSelectChat={setSelectedChatId}
                userId={userId}
                onGroupCreated={handleStartChat}
                onMarkAllRead={handleMarkAllRead}
                onBulkDelete={handleBulkDelete}
                onBulkClear={handleBulkClear}
                allSummaries={allSummaries}
                onOpenStatus={handleOpenStatus}
                findStatusSummary={findStatusSummary}
                isLoading={isLoadingChats}
                onNavigateToPeople={() => setSection("people")}
                className={selectedChatId ? "hidden md:flex" : "flex"}
              />
              {selectedChat ? (
                <ChatViewPanel
                  chat={selectedChat}
                  userId={userId}
                  username={username}
                  onlineUserIds={onlineUserIds}
                  onBack={() => setSelectedChatId("")}
                  onToggleFavorite={handleToggleFavorite}
                  onDeleteChat={handleDeleteChat}
                  onLeaveGroup={handleLeaveGroup}
                  allSummaries={allSummaries}
                  onOpenStatus={handleOpenStatus}
                  statusSummary={findStatusSummary(selectedChat?.contactUserId, selectedChat?.name)}
                  wallpaper={wallpaper}
                  className={selectedChatId ? "flex" : "hidden md:flex"}
                />
              ) : (
                <div className="hidden min-w-0 flex-1 items-center justify-center  md:flex">
                  <div className="mx-auto w-full max-w-5xl px-8">
                    <div className="flex flex-col items-center gap-6  p-10 text-center  items-center justify-center text-center md:gap-12">
                      <MessageHome className="h-auto w-full max-w-[280px] drop-shadow-lg md:max-w-[320px]" />

                      <div className="w-full space-y-4">
                        <div>
                          <h2 className="text-3xl font-semibold text-whatsapp-text-primary">Descarga WhatsApp para Windows</h2>
                          <p className="mt-2 text-base text-whatsapp-text-muted">
                            Descarga la aplicación para Windows y haz llamadas, comparte pantalla y disfruta de una experiencia más rápida.
                          </p>
                        </div>

                        <button
                          type="button"
                          className="inline-flex rounded-full bg-whatsapp-forest px-8 py-3 text-sm font-semibold text-white transition hover:bg-whatsapp-forest/90"
                        >
                          Descargar
                        </button>

                        <div className="text-sm flex gap-2 justify-center items-center  text-whatsapp-text-muted">
                          <Lock className="w-5 h-5" />
                          Tus mensajes personales están cifrados de extremo a extremo.
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {activeSummary && (
        <StatusViewer
          summary={activeSummary}
          isOwn={activeSummary.userId === userId}
          currentUserId={userId}
          onClose={() => setActiveSummary(null)}
          onRefresh={reloadStatuses}
        />
      )}

      <WallpaperModal
        open={isWallpaperModalOpen}
        onOpenChange={setIsWallpaperModalOpen}
        currentValue={wallpaper.id}
        onConfirm={handleWallpaperConfirm}
      />

      {/* Toast Container */}
      <div className="fixed bottom-20 left-1/2 z-[100] flex -translate-x-1/2 flex-col gap-2 md:bottom-10">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "flex items-center gap-3 rounded-lg px-4 py-2 text-sm font-medium text-white shadow-lg animate-in fade-in slide-in-from-bottom-2",
              t.type === 'success' ? 'bg-whatsapp-forest' :
              t.type === 'error' ? 'bg-rose-500' :
              t.type === 'warning' ? 'bg-amber-500' : 'bg-gray-800'
            )}
          >
            {t.message}
            <button onClick={() => toast.remove(t.id)} className="ml-2 opacity-70 hover:opacity-100">
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </main>
  );
}

function X({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}
