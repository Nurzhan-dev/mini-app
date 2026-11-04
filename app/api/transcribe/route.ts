import { NextResponse } from "next/server";
import Groq from "groq-sdk";

const maxAudioSize = 25 * 1024 * 1024;
const audioExtensions: Record<string, string> = {
  "audio/webm": "webm",
  "audio/mp4": "mp4",
  "audio/mpeg": "mpeg",
  "audio/mpga": "mpga",
  "audio/m4a": "m4a",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/ogg": "ogg",
  "audio/flac": "flac",
  "audio/x-flac": "flac",
};

export async function POST(request: Request) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
  }

  const audio = formData.get("audio");
  const lang = formData.get("lang");
  if (
    typeof File === "undefined" ||
    !(audio instanceof File) ||
    (lang !== "ru" && lang !== "kk")
  ) {
    return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
  }
  if (audio.size === 0) {
    return NextResponse.json({ error: "INVALID_AUDIO" }, { status: 400 });
  }
  if (audio.size > maxAudioSize) {
    return NextResponse.json({ error: "AUDIO_TOO_LARGE" }, { status: 413 });
  }

  const contentType = audio.type.split(";")[0].toLowerCase();
  const extension = audioExtensions[contentType];
  if (!extension) {
    return NextResponse.json({ error: "INVALID_AUDIO" }, { status: 400 });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "AI_NOT_CONFIGURED" }, { status: 503 });
  }

  try {
    const groq = new Groq({ apiKey });
    const transcription = await groq.audio.transcriptions.create({
      file: await Groq.toFile(
        Buffer.from(await audio.arrayBuffer()),
        `voice.${extension}`,
        { type: contentType },
      ),
      model: "whisper-large-v3-turbo",
      language: lang,
      response_format: "json",
    });
    const text = transcription.text.trim();
    if (!text) {
      return NextResponse.json({ error: "NO_SPEECH" }, { status: 422 });
    }
    return NextResponse.json({ text });
  } catch (error) {
    const status = getErrorStatus(error);
    if (status === 401 || status === 403) {
      console.error("Groq rejected the API key for audio transcription");
      return NextResponse.json({ error: "GROQ_AUTH_FAILED" }, { status: 502 });
    }
    if (status === 429) {
      console.error("Groq transcription rate limit or quota reached");
      return NextResponse.json({ error: "GROQ_RATE_LIMITED" }, { status: 502 });
    }
    if (status === 400) {
      console.error("Groq rejected the audio transcription request", error);
      return NextResponse.json({ error: "GROQ_REQUEST_REJECTED" }, { status: 502 });
    }
    console.error("Groq audio transcription failed", error);
    return NextResponse.json({ error: "AI_UNAVAILABLE" }, { status: 502 });
  }
}

function getErrorStatus(error: unknown): number | undefined {
  if (
    error &&
    typeof error === "object" &&
    "status" in error &&
    typeof error.status === "number"
  ) {
    return error.status;
  }
  return undefined;
}
