"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Camera, Check, Loader2, Smile, X } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { EmojiPicker } from "@/components/ui/emoji-picker";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

const ENCRYPTION_NOTICE_TEXT =
  'Los mensajes y las llamadas están cifrados de extremo a extremo. Solo las personas en este chat pueden leerlos, escucharlos o compartirlos. Haz clic para obtener más información.';

type PersonRow = {
  id: string;
  fullName: string;
  email: string;
  avatarUrl: string | null;
};

type ProfileSelectRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
};

type Props = {
  userId: string;
  onClose: () => void;
  onGroupCreated: (next: { conversationId: string; title: string }) => void;
};

export function GroupCreatePanel({ userId, onClose, onGroupCreated }: Props) {
  const [groupStep, setGroupStep] = useState<1 | 2>(1);
  const [groupStep2View, setGroupStep2View] = useState<"main" | "temporales">("main");
  const [groupQuery, setGroupQuery] = useState("");
  const [groupTitle, setGroupTitle] = useState("");
  const [isGroupEmojiOpen, setIsGroupEmojiOpen] = useState(false);
  const [groupPhotoFile, setGroupPhotoFile] = useState<File | null>(null);
  const [groupPhotoPreview, setGroupPhotoPreview] = useState<string | null>(null);
  const [disappearing, setDisappearing] = useState<"off" | "24h" | "7d" | "90d">("off");
  const [people, setPeople] = useState<PersonRow[]>([]);
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});
  const [isLoadingPeople, setIsLoadingPeople] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [groupError, setGroupError] = useState<string | null>(null);

  const selectedMemberIds = useMemo(
    () => Object.entries(selectedIds).filter(([, v]) => v).map(([k]) => k),
    [selectedIds],
  );

  useEffect(() => {
    let active = true;

    async function loadPeople() {
      if (!userId) return;
      setIsLoadingPeople(true);
      setGroupError(null);

      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("profiles")
          .select("id, full_name, email, avatar_url")
          .neq("id", userId)
          .order("full_name", { ascending: true });
        if (error) throw error;

        if (!active) return;

        const rows = (data ?? []) as ProfileSelectRow[];
        const next: PersonRow[] = rows.map((p) => ({
          id: p.id,
          fullName: (p.full_name ?? "").trim() || "Usuario",
          email: (p.email ?? "").trim(),
          avatarUrl: p.avatar_url ?? null,
        }));
        setPeople(next);
      } catch (e: unknown) {
        if (!active) return;
        setGroupError(e instanceof Error ? e.message : "No se pudieron cargar usuarios");
      } finally {
        if (!active) return;
        setIsLoadingPeople(false);
      }
    }

    void loadPeople();

    return () => {
      active = false;
    };
  }, [userId]);

  const filteredPeople = useMemo(() => {
    const q = groupQuery.trim().toLowerCase();
    if (!q) return people;
    return people.filter((p) => {
      return (
        p.fullName.toLowerCase().includes(q) ||
        (p.email ?? "").toLowerCase().includes(q)
      );
    });
  }, [groupQuery, people]);

  const selectedPeople = useMemo(() => {
    const selectedSet = new Set(selectedMemberIds);
    return people.filter((p) => selectedSet.has(p.id));
  }, [people, selectedMemberIds]);

  const toggleMember = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = { ...prev };
      if (next[id]) {
        delete next[id];
      } else {
        next[id] = true;
      }
      return next;
    });
  }, []);

  const removeSelected = useCallback((id: string) => {
    setSelectedIds((prev) => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const createGroup = useCallback(async () => {
    if (!userId) return;
    const title = groupTitle.trim() || "Nuevo grupo";
    if (selectedMemberIds.length < 1) return;

    setIsCreating(true);
    setGroupError(null);
    try {
      const supabase = createClient();

      let photoUrl: string | null = null;
      if (groupPhotoFile) {
        const ext = groupPhotoFile.name.includes(".")
          ? groupPhotoFile.name.split(".").pop() || "bin"
          : "bin";
        const path = `avatar/${userId}/group/${Date.now()}.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from("avatars")
          .upload(path, groupPhotoFile, {
            upsert: true,
            contentType: groupPhotoFile.type || undefined,
          });
        if (uploadError) throw uploadError;

        const { data } = supabase.storage.from("avatars").getPublicUrl(path);
        photoUrl = data.publicUrl;
      }

      const { data, error } = await supabase.rpc("create_group_conversation", {
        p_title: title,
        p_member_ids: selectedMemberIds,
        p_photo_url: photoUrl,
        p_group_settings: { disappearing },
      });
      if (error) throw error;
      const conversationId = data as string;

      const now = new Date();
      const stamp = now.toLocaleString("es-ES", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });

      await supabase.from("messages").insert([
        {
          conversation_id: conversationId,
          sender_id: userId,
          body: `Nuevo grupo creado\n${stamp}`,
          message_type: "system",
        },
        {
          conversation_id: conversationId,
          sender_id: userId,
          body: ENCRYPTION_NOTICE_TEXT,
          message_type: "system",
        },
      ]);

      onGroupCreated({ conversationId, title });
      onClose();
    } catch (e: unknown) {
      setGroupError(e instanceof Error ? e.message : "No se pudo crear el grupo");
    } finally {
      setIsCreating(false);
    }
  }, [onClose, disappearing, groupPhotoFile, groupTitle, onGroupCreated, selectedMemberIds, userId]);

  const insertEmojiInGroupName = useCallback(
    (emoji: string) => {
      setGroupTitle((prev) => `${prev}${emoji}`);
    },
    [],
  );

  const selectGroupPhoto = useCallback((file: File | null) => {
    setGroupPhotoFile(file);
    setGroupPhotoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return file ? URL.createObjectURL(file) : null;
    });
  }, []);

  useEffect(() => {
    return () => {
      if (groupPhotoPreview) URL.revokeObjectURL(groupPhotoPreview);
    };
  }, [groupPhotoPreview]);

  return (
    <div className="absolute inset-0 z-50 flex flex-col dark:bg-[#161717] bg-white">
      <div className="flex items-center gap-2  px-4 py-3">
        {groupStep === 2 ? (
          <button
            type="button"
            onClick={() => {
              if (groupStep2View !== "main") {
                setGroupStep2View("main");
                return;
              }
              setGroupStep(1);
            }}
            className="grid h-9 w-9 place-items-center rounded-full text-whatsapp-text-primary hover:bg-[#F7F5F3] dark:hover:bg-whatsapp-panel"
            aria-label="Atrás"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        ) : (
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-full text-whatsapp-text-primary hover:bg-[#F7F5F3] dark:hover:bg-whatsapp-panel"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        )}
        <div className="min-w-0">
          <div className="text-sm font-semibold text-whatsapp-text-primary">
            {groupStep === 1
              ? "Añade miembros al grupo"
              : groupStep2View === "temporales"
                ? "Mensajes temporales"
                : "Nuevo grupo"}
          </div>
        </div>
      </div>

      {groupStep === 1 ? (
        <>
          <div className="px-4 pb-4">
            <div className="rounded-2xl  bg-transparent px-3 py-2">
              {selectedPeople.length > 0 ? (
                <div className="mb-3 flex flex-wrap gap-2">
                  {selectedPeople.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => removeSelected(p.id)}
                      className="inline-flex items-center gap-2 rounded-full  px-3 py-1 text-xs text-whatsapp-text-primary"
                    >
                      <span className="flex items-center gap-2">
                        <span className="grid h-6 w-6 place-items-center overflow-hidden rounded-full  text-[0.85rem] font-semibold">
                          {p.avatarUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={p.avatarUrl}
                              alt={p.fullName}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            (p.fullName[0] ?? '?').toUpperCase()
                          )}
                        </span>
                        <span className="max-w-[140px] truncate">{p.fullName}</span>
                      </span>
                      <X className="h-3.5 w-3.5" />
                    </button>
                  ))}
                </div>
              ) : null}

              <div>
                <input
                  value={groupQuery}
                  onChange={(e) => setGroupQuery(e.target.value)}
                  className="h-9 w-full bg-transparent text-sm text-whatsapp-text-primary outline-none placeholder:text-whatsapp-text-muted border-b border-white/20 focus:border-whatsapp-forest/70 transition-colors"
                  placeholder="Buscar por nombre o email"
                />
              </div>
            </div>
          </div>

          {groupError ? (
            <div className="px-4 pt-2 text-sm text-red-500">{groupError}</div>
          ) : null}

          <ScrollArea className="min-h-0 flex-1">
            <div className="px-2 pb-2">
              {isLoadingPeople ? (
                <div className="px-3 py-4 text-sm text-whatsapp-text-muted">Cargando…</div>
              ) : null}

              {!isLoadingPeople && filteredPeople.length === 0 ? (
                <div className="px-3 py-4 text-sm text-whatsapp-text-muted">
                  No se encontraron usuarios.
                </div>
              ) : null}

              <div className="flex flex-col gap-3">
                {filteredPeople.map((p) => {
                  const checked = Boolean(selectedIds[p.id]);

                  return (
                    <div
                      key={p.id}
                      onClick={() => toggleMember(p.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          toggleMember(p.id);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-2xl  px-4 py-3 text-left transition-colors hover:bg-[#F7F5F3] dark:hover:bg-whatsapp-panel"
                      )}
                    >
                      <div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full bg-whatsapp-carbon text-whatsapp-text-primary">
                        {p.avatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={p.avatarUrl}
                            alt="Avatar"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <span className="text-sm font-semibold">
                            {(p.fullName[0] ?? "?").toUpperCase()}
                          </span>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium text-whatsapp-text-primary">
                          {p.fullName}
                        </div>
                        {p.email ? (
                          <div className="mt-1 truncate text-sm text-whatsapp-text-muted">
                            {p.email}
                          </div>
                        ) : null}
                      </div>

                      <div className="shrink-0">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => toggleMember(p.id)}
                          className={cn(
                            "h-5 w-5 rounded-full border-2 border-white/20 bg-transparent transition-colors",
                            "data-[state=checked]:border-whatsapp-forest data-[state=checked]:bg-whatsapp-forest data-[state=checked]:text-white"
                          )}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </ScrollArea>

          <div className="pointer-events-none absolute bottom-4 right-4">
            <button
              type="button"
              disabled={selectedMemberIds.length < 1}
              onClick={() => setGroupStep(2)}
              className={cn(
                "pointer-events-auto grid h-12 w-12 place-items-center rounded-full bg-whatsapp-forest text-white shadow-lg",
                "disabled:opacity-60",
              )}
              aria-label="Siguiente"
            >
              <ArrowRight className="h-6 w-6" />
            </button>
          </div>
        </>
      ) : groupStep2View === "temporales" ? (
        <>
          <div className="px-4 pt-4">
            <div className="text-sm font-semibold text-whatsapp-text-primary">
              Mensajes temporales
            </div>
            <div className="mt-1 text-sm text-whatsapp-text-muted">
              Los mensajes nuevos desaparecen después del tiempo seleccionado.
            </div>
          </div>

          <div className="px-2 pt-4">
            <RadioRow
              title="Desactivados"
              active={disappearing === "off"}
              onClick={() => setDisappearing("off")}
            />
            <RadioRow
              title="24 horas"
              active={disappearing === "24h"}
              onClick={() => setDisappearing("24h")}
            />
            <RadioRow
              title="7 días"
              active={disappearing === "7d"}
              onClick={() => setDisappearing("7d")}
            />
            <RadioRow
              title="90 días"
              active={disappearing === "90d"}
              onClick={() => setDisappearing("90d")}
            />
          </div>

          <div className="mt-auto border-t border-whatsapp-glass p-4">
            <button
              type="button"
              onClick={() => setGroupStep2View("main")}
              className="h-11 w-full rounded-xl bg-whatsapp-forest px-4 text-sm font-semibold text-white"
            >
              Listo
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="px-4 pt-6">
            <div className="flex justify-center">
              <label className="group relative grid h-40 w-40 cursor-pointer place-items-center overflow-hidden rounded-full bg-muted text-muted-foreground">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    selectGroupPhoto(f);
                  }}
                />

                {groupPhotoPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={groupPhotoPreview}
                    alt="Grupo"
                    className="h-full w-full object-cover"
                  />
                ) : null}

                <div
                  className={cn(
                    "absolute inset-0 flex flex-col items-center justify-center text-center text-white",
                    groupPhotoPreview ? "bg-black/40 opacity-0 group-hover:opacity-100" : "bg-black/40 opacity-100",
                  )}
                >
                  <Camera className="h-7 w-7" />
                  <div className="mt-2 text-sm font-medium leading-tight">
                    Añadir
                    <br />
                    imagen del
                    <br />
                    grupo
                  </div>
                </div>
              </label>
            </div>

            <div className="mt-6 flex items-end gap-3 border-b-2 border-whatsapp-forest pb-2">
              <input
                value={groupTitle}
                onChange={(e) => setGroupTitle(e.target.value)}
                className="h-9 w-full bg-transparent text-sm text-whatsapp-text-primary outline-none placeholder:text-whatsapp-text-muted"
                placeholder="Asunto del grupo (opcional)"
              />

              <EmojiPicker
                open={isGroupEmojiOpen}
                onOpenChange={setIsGroupEmojiOpen}
                onSelect={insertEmojiInGroupName}
              >
                <button
                  type="button"
                  className="grid h-9 w-9 place-items-center rounded-full text-whatsapp-text-muted hover:bg-[#F7F5F3] dark:hover:bg-whatsapp-panel hover:text-whatsapp-text-primary"
                  aria-label="Emojis"
                >
                  <Smile className="h-5 w-5" />
                </button>
              </EmojiPicker>
            </div>
          </div>

          <div className="px-2 pt-8">
            <MenuRow
              title="Mensajes temporales"
              subtitle={
                disappearing === "off"
                  ? "Desactivados"
                  : disappearing === "24h"
                    ? "24 horas"
                    : disappearing === "7d"
                      ? "7 días"
                      : "90 días"
              }
              onClick={() => setGroupStep2View("temporales")}
            />
          </div>

          {groupError ? (
            <div className="px-4 pt-2 text-sm text-red-500">{groupError}</div>
          ) : null}

          <div className="mt-auto border-t border-whatsapp-glass px-4 py-6">
            <button
              type="button"
              disabled={isCreating || selectedMemberIds.length < 1}
              onClick={() => void createGroup()}
              className={cn(
                "mx-auto grid h-14 w-14 place-items-center rounded-full bg-whatsapp-forest text-white shadow-lg transition hover:bg-whatsapp-forest/90",
                "disabled:opacity-60 disabled:hover:bg-whatsapp-forest"
              )}
              aria-label="Crear grupo"
            >
              {isCreating ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                <Check className="h-7 w-7" />
              )}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function RadioRow({
  title,
  active,
  onClick,
}: {
  title: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between gap-3 rounded-xl px-4 py-3 text-left hover:bg-[#F7F5F3] dark:hover:bg-whatsapp-panel"
    >
      <div className="font-medium text-whatsapp-text-primary">{title}</div>
      <div
        className={cn(
          "grid h-6 w-6 place-items-center rounded-full border-2 transition-colors",
          active
            ? "border-whatsapp-forest bg-whatsapp-forest text-white"
            : "border-whatsapp-text-muted/40 text-whatsapp-text-muted",
        )}
      >
        {active ? <Check className="h-3 w-3" /> : null}
      </div>
    </button>
  );
}

function MenuRow({
  title,
  subtitle,
  onClick,
}: {
  title: string;
  subtitle?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between gap-3 rounded-xl px-4 py-4 text-left hover:bg-[#F7F5F3] dark:hover:bg-whatsapp-panel"
    >
      <div className="min-w-0">
        <div className="font-medium text-whatsapp-text-primary">{title}</div>
        {subtitle ? (
          <div className="mt-1 text-sm text-whatsapp-text-muted">{subtitle}</div>
        ) : null}
      </div>
      <div className="h-5 w-5 shrink-0 text-whatsapp-text-muted">
        <ArrowRight className="h-5 w-5" />
      </div>
    </button>
  );
}
