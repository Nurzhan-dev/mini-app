"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Bot, LoaderCircle, MessageCircle, Mic, Send, X } from "lucide-react";
import ru from "../translations/ru.json";
import kk from "../translations/kk.json";

type Lang = "ru" | "kk";
type Message = { role: "user" | "assistant"; content: string };
type CartAction = { productId: number; quantity: number };
type ChatCopy = (typeof ru)["chat"];
type SpeechResultEvent = {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
};
type SpeechErrorEvent = { error: string };
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: ((event: SpeechErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

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
  const [error, setError] = useState("");
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const inputRef = useRef(input);
  const voiceBaseRef = useRef("");
  const voiceTranscriptRef = useRef("");
  const autoSendVoiceRef = useRef(false);
  const sendingRef = useRef(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  useEffect(
    () => () => {
      autoSendVoiceRef.current = false;
      recognitionRef.current?.stop();
    },
    [],
  );

  if (hidden) return null;

  const updateInput = (value: string) => {
    inputRef.current = value;
    setInput(value);
  };

  const submitMessage = async (value: string) => {
    const content = value.trim();
    if (!content || sendingRef.current) return;

    const nextMessages = [...messages, { role: "user" as const, content }];
    setMessages(nextMessages);
    updateInput("");
    setError("");
    sendingRef.current = true;
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
      sendingRef.current = false;
      setSending(false);
    }
  };

  const sendMessage = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void submitMessage(inputRef.current);
  };

  const toggleVoice = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      return;
    }

    if (sendingRef.current) return;
    const SpeechRecognition =
      window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError(t.voiceUnsupported);
      return;
    }

    setError("");
    const recognition = new SpeechRecognition();
    recognition.lang = lang === "ru" ? "ru-RU" : "kk-KZ";
    recognition.interimResults = false;
    voiceBaseRef.current = inputRef.current.trim();
    voiceTranscriptRef.current = "";
    autoSendVoiceRef.current = true;
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? "")
        .join(" ")
        .trim();
      if (transcript) {
        voiceTranscriptRef.current = transcript;
        const base = voiceBaseRef.current;
        updateInput(`${base}${base ? " " : ""}${transcript}`);
      }
    };
    recognition.onerror = (event) => {
      setListening(false);
      recognitionRef.current = null;
      autoSendVoiceRef.current = false;
      setError(
        event.error === "not-allowed" || event.error === "service-not-allowed"
          ? t.voicePermission
          : event.error === "no-speech"
            ? t.voiceNoSpeech
            : t.voiceError,
      );
    };
    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
      const transcript = voiceTranscriptRef.current;
      if (autoSendVoiceRef.current && transcript) {
        const base = voiceBaseRef.current;
        void submitMessage(`${base}${base ? " " : ""}${transcript}`);
      }
      autoSendVoiceRef.current = false;
    };
    recognitionRef.current = recognition;
    setListening(true);
    try {
      recognition.start();
    } catch (startError) {
      console.error("Speech recognition could not start", startError);
      recognitionRef.current = null;
      setListening(false);
      autoSendVoiceRef.current = false;
      setError(t.voiceError);
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
                  onClick={() => updateInput(suggestion)}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}

          <div className="ai-chat-compose">
            {error && <p className="ai-chat-error" role="alert">{error}</p>}
            {listening && <p className="ai-chat-listening">{t.listening}</p>}
            <form onSubmit={sendMessage}>
              <textarea
                value={input}
                onChange={(event) => updateInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
                placeholder={t.placeholder}
                rows={1}
                aria-label={t.placeholder}
                disabled={sending || listening}
              />
              <button
                type="button"
                className={`ai-chat-icon-button ${listening ? "is-listening" : ""}`}
                onClick={toggleVoice}
                disabled={sending && !listening}
                aria-label={listening ? t.stopVoice : t.startVoice}
                title={listening ? t.stopVoice : t.startVoice}
              >
                <Mic size={17} />
              </button>
              <button
                type="submit"
                className="ai-chat-send"
                disabled={!input.trim() || sending || listening}
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
