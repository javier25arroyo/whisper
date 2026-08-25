import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 30;

const PROMPTS: Record<string, string> = {
  auto: `Escucha este audio con atención.
1. Transcribe exactamente lo que se dijo.
2. Detecta si el idioma es Español o Japonés.
3. Traduce al idioma contrario (Español→Japonés o Japonés→Español).

Responde ÚNICAMENTE con JSON válido, sin markdown, sin explicaciones:
{"detected_language":"es","original_text":"...","translation":"..."}

Si el idioma detectado es japonés, usa "ja" en detected_language.`,

  "es-ja": `Escucha este audio en Español.
1. Transcribe exactamente lo que se dijo en español.
2. Tradúcelo al Japonés de forma natural.

Responde ÚNICAMENTE con JSON válido:
{"detected_language":"es","original_text":"...","translation":"..."}`,

  "ja-es": `このオーディオを日本語で聞いてください。
1. 話された内容を正確に文字起こしをしてください。
2. スペイン語に自然に翻訳してください。

有効なJSONのみで返答してください:
{"detected_language":"ja","original_text":"...","translation":"..."}`,
};

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "API key no configurada" }, { status: 500 });
  }

  try {
    const formData = await req.formData();
    const audioFile = formData.get("audio") as File | null;
    const direction = (formData.get("direction") as string) || "auto";

    if (!audioFile || audioFile.size === 0) {
      return NextResponse.json({ error: "No se recibió audio" }, { status: 400 });
    }

    // Limitar a 15MB
    if (audioFile.size > 15 * 1024 * 1024) {
      return NextResponse.json({ error: "Audio demasiado largo. Graba menos de 30 segundos." }, { status: 400 });
    }

    const bytes = await audioFile.arrayBuffer();
    const base64Audio = Buffer.from(bytes).toString("base64");

    // Detectar el MIME type correcto
    let mimeType = audioFile.type || "audio/webm";
    // iOS Safari graba en audio/mp4
    if (!mimeType || mimeType === "application/octet-stream") {
      mimeType = "audio/mp4";
    }
    // Normalizar variantes
    if (mimeType.includes("webm")) mimeType = "audio/webm";
    if (mimeType.includes("mp4") || mimeType.includes("m4a")) mimeType = "audio/mp4";
    if (mimeType.includes("ogg")) mimeType = "audio/ogg";

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    const prompt = PROMPTS[direction] || PROMPTS["auto"];

    const result = await model.generateContent([
      {
        inlineData: {
          mimeType: mimeType as "audio/webm" | "audio/mp4" | "audio/ogg",
          data: base64Audio,
        },
      },
      { text: prompt },
    ]);

    const responseText = result.response.text().trim();

    // Extraer JSON de la respuesta (por si Gemini agrega texto extra)
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("Respuesta de Gemini:", responseText);
      return NextResponse.json({ error: "No se pudo procesar el audio. Intenta de nuevo." }, { status: 422 });
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Validar campos requeridos
    if (!parsed.original_text || !parsed.translation) {
      return NextResponse.json({ error: "Respuesta incompleta. Habla más claro e intenta de nuevo." }, { status: 422 });
    }

    return NextResponse.json({
      detected_language: parsed.detected_language || "es",
      original_text: parsed.original_text,
      translation: parsed.translation,
    });
  } catch (err) {
    console.error("Error en /api/translate:", err);
    const message = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: `Error al procesar: ${message}` }, { status: 500 });
  }
}
