import { useRef, useState } from "react";

const LANG_MAP: Record<string, string> = {
  en: "en-US",
  fr: "fr-FR",
  es: "es-ES"
};

// Web Speech API — built into Chrome/Edge/Safari, free, no API key.
// Not supported in Firefox; the mic button hides itself there.
export function useSpeech(lang: string, onText: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const recRef = useRef<{ stop(): void } | null>(null);
  const onTextRef = useRef(onText);
  onTextRef.current = onText;

  const Ctor =
    typeof window !== "undefined"
      ? ((window as unknown as Record<string, unknown>).SpeechRecognition ??
        (window as unknown as Record<string, unknown>).webkitSpeechRecognition)
      : undefined;
  const supported = typeof Ctor === "function";

  const start = () => {
    if (!supported || listening) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rec: any = new (Ctor as any)();
    rec.lang = LANG_MAP[lang] ?? lang;
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e: any) => {
      const text = e.results?.[0]?.[0]?.transcript;
      if (text) onTextRef.current(text);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    rec.start();
    setListening(true);
  };

  const stop = () => {
    recRef.current?.stop();
    setListening(false);
  };

  return { supported, listening, start, stop };
}
