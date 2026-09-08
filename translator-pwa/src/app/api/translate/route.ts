import { NextRequest, NextResponse } from "next/server.js";
import { getProvider, DEFAULT_PROVIDER_ID } from "#lib/providers/index";
import type { AudioTranslator, ProviderConfig, TranslationResult } from "#lib/providers/types";

export const maxDuration = 30;

type Resolution =
  | { ok: true; adapter: AudioTranslator; cfg: ProviderConfig }
  | { ok: false; error: string; status: number };

/**
 * Resuelve el proveedor a usar. Prioridad: cabeceras del cliente, luego entorno.
 * baseUrl procede siempre del preset del servidor, nunca del cliente (prevención de SSRF).
 */
function resolveProvider(req: NextRequest): Resolution {
  const headerId = req.headers.get("x-provider-id");
  const headerKey = req.headers.get("x-provider-key");

  if (headerId) {
    const entry = getProvider(headerId);
    if (!entry) {
      return { ok: false, error: "Proveedor no reconocido.", status: 400 };
    }
    if (!headerKey) {
      return { ok: false, error: "Falta la clave del proveedor seleccionado.", status: 400 };
    }
    return {
      ok: true,
      adapter: entry.adapter,
      cfg: {
        apiKey: headerKey,
        model: req.headers.get("x-provider-model") || entry.preset.defaultModel,
        baseUrl: entry.preset.baseUrl,
      },
    };
  }

  const envId = process.env.PROVIDER_ID || DEFAULT_PROVIDER_ID;
  const entry = getProvider(envId);
  if (!entry) {
    return { ok: false, error: "Proveedor del servidor mal configurado.", status: 500 };
  }
  const envKey = process.env.PROVIDER_API_KEY || process.env.GEMINI_API_KEY;
  if (!envKey) {
    return { ok: false, error: "API key no configurada", status: 500 };
  }
  return {
    ok: true,
    adapter: entry.adapter,
    cfg: {
      apiKey: envKey,
      model: process.env.PROVIDER_MODEL || entry.preset.defaultModel,
      baseUrl: entry.preset.baseUrl,
    },
  };
}

export async function POST(req: NextRequest) {
  const resolution = resolveProvider(req);
  if (!resolution.ok) {
    return NextResponse.json({ error: resolution.error }, { status: resolution.status });
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

    if (!resolution.adapter.acceptsMimeType(audioFile.type)) {
      return NextResponse.json(
        { error: "El proveedor seleccionado no admite este formato de audio." },
        { status: 415 }
      );
    }

    const bytes = await audioFile.arrayBuffer();
    const base64Audio = Buffer.from(bytes).toString("base64");

    let translationResult: TranslationResult;
    try {
      translationResult = await resolution.adapter.translate(resolution.cfg, {
        audioBase64: base64Audio,
        mimeType: audioFile.type,
        direction,
      });
    } catch (translateErr) {
      const msg =
        translateErr instanceof Error ? translateErr.message : "Error al procesar el audio";
      // No se registra la configuración: contiene la API key.
      console.error("Error en la llamada al proveedor:", msg);

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
