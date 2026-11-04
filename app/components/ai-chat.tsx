"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Bot, LoaderCircle, MessageCircle, Mic, Send, X } from "lucide-react";
import ru from "../translations/ru.json";
import kk from "../translations/kk.json";

type Lang = "ru" | "kk";
type Message = { role: "user" | "assistant"; content: string };
type CartAction = { productId: number; quantity: number };
type ChatCopy = (typeof ru)["chat"];

const translations: Record<Lang, { chat: ChatCopy }> = { ru, kk };

export default function AiChat({
  lang,
  hidden,
  onAddToCart,
}: {
  lang: Lang;
  hidden: boolean;
  onAddToCart: (actions: CartAction[]) => void;
}) {
  const t = translations[lang].chat;
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  useEffect(
    () => () => {
      recorderRef.current?.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
    },
    [],
  );

  if (hidden) return null;

  const toggleVoice = async () => {
    if (recorderRef.current) {
      recorderRef.current.stop();
      recorderRef.current = null;
      setListening(false);
      setTranscribing(true);
      return;
    }

    if (transcribing) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError(t.voiceUnsupported);
      return;
    }

    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = ["audio/webm;codecs=opus", "audio/mp4"].find((type) =>
        MediaRecorder.isTypeSupported(type),
      );
      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined,
      );
      const chunks: Blob[] = [];
      let recordingFailed = false;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.onerror = () => {
        recordingFailed = true;
        setListening(false);
        setError(t.voiceError);
        recorderRef.current = null;
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      };
      recorder.onstop = async () => {
        recorderRef.current = null;
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        setListening(false);
        if (recordingFailed || chunks.length === 0) {
          setTranscribing(false);
          return;
        }

        setTranscribing(true);
        try {
          const audio = new Blob(chunks, {
            type: recorder.mimeType || chunks[0].type || "audio/webm",
          });
          const formData = new FormData();
          formData.append("audio", audio, "voice");
          formData.append("lang", lang);
          const response = await fetch("/api/transcribe", {
            method: "POST",
            body: formData,
          });
          const result: unknown = await response.json();
          if (!response.ok || !isTranscriptionResponse(result)) {
            throw new Error(getErrorCode(result) ?? "TRANSCRIPTION_ERROR");
          }
          setInput((current) =>
            `${current}${current ? " " : ""}${result.text.trim()}`,
          );
        } catch (requestError) {
          const code =
            requestError instanceof Error
              ? requestError.message
              : "TRANSCRIPTION_ERROR";
          const errorCopy: Record<string, string> = {
            AI_NOT_CONFIGURED: t.notConfigured,
            GROQ_AUTH_FAILED: t.groqAuthError,
            GROQ_RATE_LIMITED: t.groqRateLimitError,
            GROQ_REQUEST_REJECTED: t.groqRequestError,
            AUDIO_TOO_LARGE: t.voiceTooLarge,
            NO_SPEECH: t.voiceNoSpeech,
            AI_UNAVAILABLE: t.voiceError,
          };
          setError(errorCopy[code] ?? t.voiceError);
        } finally {
          setTranscribing(false);
        }
      };

      recorderRef.current = recorder;
      recorder.start();
      setListening(true);
    } catch (startError) {
      console.error("Audio recording could not start", startError);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      recorderRef.current = null;
      setListening(false);
      const name =
        startError && typeof startError === "object" && "name" in startError
          ? startError.name
          : undefined;
      setError(
        name === "NotAllowedError" || name === "SecurityError"
          ? t.voicePermission
          : t.voiceError,
      );
      setTranscribing(false);
    }
  };

  const sendMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const content = input.trim();
    if (!content || sending) return;

    const nextMessages = [...messages, { role: "user" as const, content }];
    setMessages(nextMessages);
    setInput("");
    setError("");
    setSending(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lang, messages: nextMessages }),
      });
      const result: unknown = await response.json();
      if (!response.ok || !isChatResponse(result)) {
        throw new Error(getErrorCode(result) ?? "CHAT_ERROR");
      }
      setMessages([...nextMessages, { role: "assistant", content: result.reply }]);
      if (result.cartActions.length > 0) onAddToCart(result.cartActions);
    } catch (requestError) {
      const code = requestError instanceof Error ? requestError.message : "CHAT_ERROR";
      const errorCopy: Record<string, string> = {
        AI_NOT_CONFIGURED: t.notConfigured,
        GROQ_AUTH_FAILED: t.groqAuthError,
        GROQ_RATE_LIMITED: t.groqRateLimitError,
        GROQ_REQUEST_REJECTED: t.groqRequestError,
        AI_UNAVAILABLE: t.chatError,
      };
      setMessages((current) =>
        current.at(-1)?.role === "assistant" && !current.at(-1)?.content
          ? current.slice(0, -1)
          : current,
      );
      setError(errorCopy[code] ?? t.chatError);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="ai-chat">
      {isOpen && (
        <section className="ai-chat-panel" aria-label={t.title}>
          <header className="ai-chat-header">
            <div className="ai-chat-avatar">
              <Bot size={19} />
            </div>
            <div className="ai-chat-heading">
              <strong>{t.title}</strong>
              <span>{t.subtitle}</span>
            </div>
            <button
              type="button"
              className="ai-chat-close"
              aria-label={t.close}
              onClick={() => setIsOpen(false)}
            >
              <X size={18} />
            </button>
          </header>

          <div className="ai-chat-messages" aria-live="polite">
            <div className="ai-chat-message assistant">{t.welcome}</div>
            {messages.map((message, index) => (
              <div
                className={`ai-chat-message ${message.role}`}
                key={`${index}-${message.role}`}
              >
                {message.content}
              </div>
            ))}
            {sending && (
              <div className="ai-chat-message assistant ai-chat-thinking">
                <LoaderCircle size={15} className="ai-chat-spinner" />
                {t.thinking}
              </div>
            )}
            <div ref={endRef} />
          </div>

          {messages.length === 0 && (
            <div className="ai-chat-suggestions">
              {t.suggestions.map((suggestion) => (
                <button
                  type="button"
                  key={suggestion}
                  onClick={() => setInput(suggestion)}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}

          <div className="ai-chat-compose">
            {error && <p className="ai-chat-error" role="alert">{error}</p>}
            {(listening || transcribing) && (
              <p className="ai-chat-listening">
                {transcribing ? t.transcribing : t.listening}
              </p>
            )}
            <form onSubmit={sendMessage}>
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
                placeholder={t.placeholder}
                rows={1}
                aria-label={t.placeholder}
                disabled={sending}
              />
              <button
                type="button"
                className={`ai-chat-icon-button ${listening ? "is-listening" : ""}`}
                onClick={() => void toggleVoice()}
                disabled={transcribing}
                aria-label={
                  transcribing ? t.transcribing : listening ? t.stopVoice : t.startVoice
                }
                title={
                  transcribing ? t.transcribing : listening ? t.stopVoice : t.startVoice
                }
              >
                <Mic size={17} />
              </button>
              <button
                type="submit"
                className="ai-chat-send"
                disabled={!input.trim() || sending}
                aria-label={t.send}
                title={t.send}
              >
                <Send size={16} />
              </button>
            </form>
          </div>
        </section>
      )}
      <button
        type="button"
        className="ai-chat-launcher"
        onClick={() => setIsOpen((open) => !open)}
        aria-label={isOpen ? t.close : t.open}
        title={isOpen ? t.close : t.open}
      >
        {isOpen ? <X size={21} /> : <MessageCircle size={21} />}
      </button>
    </div>
  );
}

function getErrorCode(value: unknown): string | undefined {
  if (value && typeof value === "object" && "error" in value) {
    return typeof value.error === "string" ? value.error : undefined;
  }
  return undefined;
}

function isTranscriptionResponse(value: unknown): value is { text: string } {
  return (
    value !== null &&
    typeof value === "object" &&
    "text" in value &&
    typeof value.text === "string" &&
    value.text.trim().length > 0
  );
}

function isChatResponse(
  value: unknown,
): value is { reply: string; cartActions: CartAction[] } {
  if (
    !value ||
    typeof value !== "object" ||
    !("reply" in value) ||
    typeof value.reply !== "string" ||
    !("cartActions" in value) ||
    !Array.isArray(value.cartActions)
  ) {
    return false;
  }
  return value.cartActions.every(
    (action) =>
      action !== null &&
      typeof action === "object" &&
      "productId" in action &&
      typeof action.productId === "number" &&
      "quantity" in action &&
      typeof action.quantity === "number",
  );
}
