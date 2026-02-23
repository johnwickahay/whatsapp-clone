import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ChatPreview } from "../types";

export function useTypingIndicators(chats: ChatPreview[], userId: string, isGroupByChatId: Record<string, boolean>) {
    const [typingLabelByChatId, setTypingLabelByChatId] = useState<Record<string, string>>({});
    const typingTimersRef = useRef<Record<string, Record<string, ReturnType<typeof setTimeout>>>>({});
    const typingNamesRef = useRef<Record<string, string>>({});

    const ensureTypingNames = useCallback(async (ids: string[]) => {
        const unique = Array.from(new Set(ids.filter(Boolean)));
        const missing = unique.filter((id) => !typingNamesRef.current[id]);
        if (missing.length === 0) return;

        const supabase = createClient();
        const { data, error } = await supabase
            .from("profiles")
            .select("id, full_name, email")
            .in("id", missing);
        if (error) return;

        for (const row of data ?? []) {
            const name = (row.full_name ?? "").trim();
            const email = (row.email ?? "").trim();
            typingNamesRef.current[row.id] = name || email || "Usuario";
        }
    }, []);

    const formatGroupTypingLabel = useCallback((names: string[]) => {
        const unique = Array.from(new Set(names.map((n) => n.trim()).filter(Boolean)));
        if (unique.length === 0) return "Escribiendo…";
        if (unique.length === 1) return `${unique[0]} está escribiendo…`;
        if (unique.length === 2) return `${unique[0]} y ${unique[1]} están escribiendo…`;
        return `${unique[0]}, ${unique[1]} y ${unique.length - 2} más están escribiendo…`;
    }, []);

    useEffect(() => {
        if (!userId) return;
        const supabase = createClient();
        const channels: Array<ReturnType<typeof supabase.channel>> = [];

        function recomputeLabel(conversationId: string, ch: ReturnType<typeof supabase.channel>) {
            const state = ch.presenceState() as Record<
                string,
                Array<{ user_id?: string; name?: string; typing?: boolean; typing_at?: number }>
            >;

            const now = Date.now();
            const typingUserIds: string[] = [];

            for (const entries of Object.values(state)) {
                for (const p of entries ?? []) {
                    const id = p.user_id;
                    if (!id || id === userId) continue;
                    if (!p.typing) continue;
                    const ts = typeof p.typing_at === "number" ? p.typing_at : 0;
                    if (ts && now - ts > 4500) continue;
                    typingUserIds.push(id);

                    const incomingName = (p.name ?? "").trim();
                    if (incomingName && (!typingNamesRef.current[id] || typingNamesRef.current[id] === "Usuario")) {
                        typingNamesRef.current[id] = incomingName;
                    }
                }
            }

            const uniqueIds = Array.from(new Set(typingUserIds));
            if (uniqueIds.length === 0) {
                setTypingLabelByChatId((prev) => {
                    if (!prev[conversationId]) return prev;
                    const next = { ...prev };
                    delete next[conversationId];
                    return next;
                });
                return;
            }

            if (!typingTimersRef.current[conversationId]) typingTimersRef.current[conversationId] = {};
            const heartbeatKey = "__presence__";
            const existing = typingTimersRef.current[conversationId][heartbeatKey];
            if (existing) clearTimeout(existing);
            typingTimersRef.current[conversationId][heartbeatKey] = setTimeout(() => {
                recomputeLabel(conversationId, ch);
            }, 1200);

            const isGroup = Boolean(isGroupByChatId[conversationId]);
            if (!isGroup) {
                const firstId = uniqueIds[0];
                const firstName = (firstId ? typingNamesRef.current[firstId] : "") ?? "";
                setTypingLabelByChatId((prev) => ({
                    ...prev,
                    [conversationId]: firstName ? `${firstName} está escribiendo…` : "Escribiendo…",
                }));
                void ensureTypingNames([firstId]).then(() => recomputeLabel(conversationId, ch));
                return;
            }

            const names = uniqueIds.map((id) => typingNamesRef.current[id] ?? "Usuario");
            setTypingLabelByChatId((prev) => ({ ...prev, [conversationId]: formatGroupTypingLabel(names) }));
            void ensureTypingNames(uniqueIds).then(() => recomputeLabel(conversationId, ch));
        }

        for (const chat of chats) {
            const conversationId = chat.id;
            if (!conversationId) continue;

            const ch = supabase.channel(`typing:${conversationId}`, {
                config: {
                    presence: {
                        key: userId,
                    },
                },
            });

            ch.on("presence", { event: "sync" }, () => recomputeLabel(conversationId, ch))
                .on("presence", { event: "join" }, () => recomputeLabel(conversationId, ch))
                .on("presence", { event: "leave" }, () => recomputeLabel(conversationId, ch))
                .subscribe(async (status: string) => {
                    if (status !== "SUBSCRIBED") return;
                    await ch.track({ user_id: userId, name: "", typing: false, typing_at: 0 });
                    recomputeLabel(conversationId, ch);
                });

            channels.push(ch);
        }

        return () => {
            setTypingLabelByChatId({});
            for (const ch of channels) supabase.removeChannel(ch);
            for (const convoTimers of Object.values(typingTimersRef.current)) {
                for (const t of Object.values(convoTimers)) clearTimeout(t);
            }
            typingTimersRef.current = {};
        };
    }, [chats, ensureTypingNames, formatGroupTypingLabel, isGroupByChatId, userId]);

    return { typingLabelByChatId };
}
