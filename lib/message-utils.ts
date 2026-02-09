/**
 * Utilities for formatting and parsing message content.
 */

export function getContactCountFromBody(body: string): number {
    if (!body) return 0;
    try {
        const parsed = JSON.parse(body);
        if (!parsed || typeof parsed !== "object") return 0;
        const contacts = parsed.contacts;
        if (!Array.isArray(contacts)) return 0;
        return contacts.length;
    } catch {
        return 0;
    }
}

export function looksLikePollBody(body: string): boolean {
    if (!body) return false;
    try {
        const parsed = JSON.parse(body);
        if (!parsed || typeof parsed !== "object") return false;
        const question = typeof parsed.question === "string" ? parsed.question.trim() : "";
        const options = Array.isArray(parsed.options) ? parsed.options : [];
        if (!question) return false;
        if (options.length < 2) return false;
        return true;
    } catch {
        return false;
    }
}

export function tryParseLegacyPoll(content: string | null | undefined): string | null {
    if (!content) return null;
    try {
        const parsed = JSON.parse(content);
        if (!parsed || typeof parsed !== "object") return null;
        const question = typeof parsed.question === "string" ? parsed.question.trim() : "";
        const options = Array.isArray(parsed.options) ? parsed.options : [];
        if (!question) return null;
        const optionsText = options.length > 0 ? ` (${options.join(", ")})` : "";
        return `📊 Encuesta: ${question}${optionsText}`;
    } catch {
        return null;
    }
}

export function formatMessagePreview(input: {
    body: string | null | undefined;
    messageType?: string | null | undefined;
    mediaName?: string | null | undefined;
    senderId?: string | null | undefined;
    currentUserId?: string | null | undefined;
}): string {
    const body = (input.body ?? "").trim();
    const messageType = (input.messageType ?? "").trim().toLowerCase();

    const pollSummary = tryParseLegacyPoll(body);
    if (pollSummary && messageType !== 'text') return pollSummary;

    if (messageType === "poll") {
        try {
            const parsed = JSON.parse(body);
            return parsed.question ? `📊 Encuesta: ${parsed.question}` : "📊 Encuesta";
        } catch {
            return "📊 Encuesta";
        }
    }

    if (messageType === "contact") {
        const count = getContactCountFromBody(body);
        if (count >= 2) return `👤 ${count} contactos`;
        return "👤 Contacto";
    }

    if (messageType === "document") {
        const name = (input.mediaName ?? "").trim();
        return name ? `📄 Documento: ${name}` : "📄 Documento";
    }

    if (messageType === "image") return body ? `📷 Foto: ${body}` : "📷 Foto";
    if (messageType === "video") return body ? `🎥 Video: ${body}` : "🎥 Video";
    if (messageType === "audio") return "🎤 Audio";

    if (messageType === "status_reply") {
        try {
            const parsed = JSON.parse(body);
            const text = parsed.replyText || "";
            const isMe = input.senderId && input.currentUserId && input.senderId === input.currentUserId;
            const prefix = isMe ? "✨ Respondiste a un estado" : "✨ Respondió a un estado";
            return text ? `${prefix}: ${text}` : prefix;
        } catch {
            return "✨ Respondió a un estado";
        }
    }

    // Fallbacks for initial load (RPC only returns body)
    if (looksLikePollBody(body)) {
        try {
            const parsed = JSON.parse(body);
            return parsed.question ? `📊 Encuesta: ${parsed.question}` : "📊 Encuesta";
        } catch {
            return "📊 Encuesta";
        }
    }

    const contactCount = getContactCountFromBody(body);
    if (contactCount > 0) {
        if (contactCount >= 2) return `👤 ${contactCount} contactos`;
        return "👤 Contacto";
    }

    return body || "Mensaje";
}
