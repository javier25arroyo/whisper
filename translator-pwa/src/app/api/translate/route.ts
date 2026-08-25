import { NextRequest, NextResponse } from "next/server.js";
import {
  translateAudioWithGemini,
  type TranslationResult,
} from "#lib/translator";

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "API key no configurada" }, { status: 500 });
  }

  try {
    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return NextResponse.json(
        { error: "Formato de petición inválido (se esperaba multipart/form-data)" },
        { status: 400 }
      );
    }

    const audioFile = formData.get("audio") as File | null;
    const direction = (formData.get("direction") as string) || "auto";

    if (!audioFile || typeof audioFile.size !== "number" || audioFile.size === 0) {
      return NextResponse.json({ error: "No se recibió audio" }, { status: 400 });
    }

    // Limitar a 15MB
    if (audioFile.size > 15 * 1024 * 1024) {
      return NextResponse.json(
        { error: "Audio demasiado largo. Graba menos de 30 segundos." },
        { status: 400 }
      );
    }

    const bytes = await audioFile.arrayBuffer();
    const base64Audio = Buffer.from(bytes).toString("base64");

    let translationResult: TranslationResult;
    try {
      translationResult = await translateAudioWithGemini({
        apiKey,
        audioBase64: base64Audio,
        mimeType: audioFile.type,
        direction,
      });
    } catch (translateErr) {
      const msg = translateErr instanceof Error ? translateErr.message : "Error al procesar audio con Gemini";
      console.error("Error en llamada a Gemini / traducción:", translateErr);

      if (
        msg.includes("JSON") ||
        msg.includes("incompleta") ||
        msg.includes("bloque JSON") ||
        msg.includes("vacía")
      ) {
        return NextResponse.json({ error: msg }, { status: 422 });
      }

      return NextResponse.json({ error: `Error al procesar: ${msg}` }, { status: 500 });
    }

    return NextResponse.json(translationResult, { status: 200 });
  } catch (err) {
    console.error("Error inesperado en /api/translate:", err);
    const message = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: `Error al procesar: ${message}` }, { status: 500 });
  }
}
