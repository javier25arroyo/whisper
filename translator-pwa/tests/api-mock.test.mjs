import test, { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { GoogleGenerativeAI } from "@google/generative-ai";

import {
  normalizeMimeType,
  normalizeLanguage,
  getPromptForDirection,
  extractAndParseGeminiJson,
  PROMPTS,
} from "../src/lib/translator.ts";
import { POST } from "../src/app/api/translate/route.ts";

describe("API Translate - MIME Type Normalization", () => {
  it("normalizes standard audio/mp4 and audio/m4a to audio/mp4", () => {
    assert.equal(normalizeMimeType("audio/mp4"), "audio/mp4");
    assert.equal(normalizeMimeType("audio/m4a"), "audio/mp4");
    assert.equal(normalizeMimeType("audio/x-m4a"), "audio/mp4");
    assert.equal(normalizeMimeType("audio/aac"), "audio/mp4");
  });

  it("normalizes audio/webm with codecs to audio/webm", () => {
    assert.equal(normalizeMimeType("audio/webm"), "audio/webm");
    assert.equal(normalizeMimeType("audio/webm;codecs=opus"), "audio/webm");
  });

  it("normalizes audio/ogg with codecs to audio/ogg", () => {
    assert.equal(normalizeMimeType("audio/ogg"), "audio/ogg");
    assert.equal(normalizeMimeType("audio/ogg;codecs=opus"), "audio/ogg");
  });

  it("normalizes audio/wav to audio/wav", () => {
    assert.equal(normalizeMimeType("audio/wav"), "audio/wav");
    assert.equal(normalizeMimeType("audio/x-wav"), "audio/wav");
  });

  it("falls back to audio/mp4 for iOS application/octet-stream, null, or empty", () => {
    assert.equal(normalizeMimeType("application/octet-stream"), "audio/mp4");
    assert.equal(normalizeMimeType(null), "audio/mp4");
    assert.equal(normalizeMimeType(undefined), "audio/mp4");
    assert.equal(normalizeMimeType(""), "audio/mp4");
    assert.equal(normalizeMimeType("unknown/format"), "audio/mp4");
  });
});

describe("API Translate - Language Normalization", () => {
  it("correctly identifies Spanish variants", () => {
    assert.equal(normalizeLanguage("es"), "es");
    assert.equal(normalizeLanguage("ES"), "es");
    assert.equal(normalizeLanguage("spanish"), "es");
    assert.equal(normalizeLanguage("Español"), "es");
    assert.equal(normalizeLanguage("espanol"), "es");
    assert.equal(normalizeLanguage("スペイン語"), "es");
  });

  it("correctly identifies Japanese variants", () => {
    assert.equal(normalizeLanguage("ja"), "ja");
    assert.equal(normalizeLanguage("JA"), "ja");
    assert.equal(normalizeLanguage("jp"), "ja");
    assert.equal(normalizeLanguage("japanese"), "ja");
    assert.equal(normalizeLanguage("Japonés"), "ja");
    assert.equal(normalizeLanguage("japones"), "ja");
    assert.equal(normalizeLanguage("日本語"), "ja");
  });

  it("falls back to default language for unknown input", () => {
    assert.equal(normalizeLanguage(null, "es"), "es");
    assert.equal(normalizeLanguage(undefined, "ja"), "ja");
    assert.equal(normalizeLanguage("unknown", "es"), "es");
    assert.equal(normalizeLanguage("unknown", "ja"), "ja");
  });
});

describe("API Translate - Prompt Selection", () => {
  it("returns correct prompt for auto, es-ja, and ja-es directions", () => {
    assert.equal(getPromptForDirection("auto"), PROMPTS["auto"]);
    assert.equal(getPromptForDirection("es-ja"), PROMPTS["es-ja"]);
    assert.equal(getPromptForDirection("ja-es"), PROMPTS["ja-es"]);
  });

  it("falls back to auto prompt for null, undefined, or unrecognized direction", () => {
    assert.equal(getPromptForDirection(null), PROMPTS["auto"]);
    assert.equal(getPromptForDirection(undefined), PROMPTS["auto"]);
    assert.equal(getPromptForDirection("other"), PROMPTS["auto"]);
  });
});

describe("API Translate - Gemini JSON Extraction and Parsing", () => {
  it("parses raw clean JSON correctly", () => {
    const raw = '{"detected_language": "es", "original_text": "Hola mundo", "translation": "こんにちは世界"}';
    const res = extractAndParseGeminiJson(raw);
    assert.deepEqual(res, {
      detected_language: "es",
      original_text: "Hola mundo",
      translation: "こんにちは世界",
    });
  });

  it("parses JSON wrapped in markdown code fence (```json ... ```)", () => {
    const fenced = `\`\`\`json
{
  "detected_language": "ja",
  "original_text": "ありがとうございます",
  "translation": "Muchas gracias"
}
\`\`\``;
    const res = extractAndParseGeminiJson(fenced);
    assert.deepEqual(res, {
      detected_language: "ja",
      original_text: "ありがとうございます",
      translation: "Muchas gracias",
    });
  });

  it("parses JSON wrapped in markdown code fence without lang tag (``` ... ```)", () => {
    const fenced = `\`\`\`
{
  "detected_language": "es",
  "original_text": "¿Dónde está la estación?",
  "translation": "駅はどこですか？"
}
\`\`\``;
    const res = extractAndParseGeminiJson(fenced);
    assert.deepEqual(res, {
      detected_language: "es",
      original_text: "¿Dónde está la estación?",
      translation: "駅はどこですか？",
    });
  });

  it("extracts JSON with conversational commentary before and after", () => {
    const withComments = `Claro, aquí tienes la traducción solicitada:
{
  "detected_language": "ja",
  "original_text": "おはようございます",
  "translation": "Buenos días"
}
¡Espero que te sea de ayuda!`;
    const res = extractAndParseGeminiJson(withComments);
    assert.deepEqual(res, {
      detected_language: "ja",
      original_text: "おはようございます",
      translation: "Buenos días",
    });
  });

  it("handles whitespace, newlines, and trailing characters in JSON fields", () => {
    const jsonStr = `  {
      "detected_language": "es",
      "original_text": "  Buenas noches a todos  ",
      "translation": "  皆さん、こんばんは  "
    }  `;
    const res = extractAndParseGeminiJson(jsonStr);
    assert.deepEqual(res, {
      detected_language: "es",
      original_text: "Buenas noches a todos",
      translation: "皆さん、こんばんは",
    });
  });

  it("throws error when response is empty or non-string", () => {
    assert.throws(() => extractAndParseGeminiJson(""), /Respuesta vacía de Gemini/);
    assert.throws(() => extractAndParseGeminiJson(null), /Respuesta vacía de Gemini/);
  });

  it("throws error when no JSON object exists in the response", () => {
    assert.throws(() => extractAndParseGeminiJson("Solo texto sin formato json"), /No se encontró un bloque JSON/);
  });

  it("throws error when JSON is missing original_text or translation", () => {
    const missingOriginal = '{"detected_language": "es", "original_text": "", "translation": "Hola"}';
    assert.throws(() => extractAndParseGeminiJson(missingOriginal), /Respuesta incompleta/);

    const missingTranslation = '{"detected_language": "es", "original_text": "Hola", "translation": ""}';
    assert.throws(() => extractAndParseGeminiJson(missingTranslation), /Respuesta incompleta/);
  });
});

describe("API Translate - Route Handler POST Validation", () => {
  const originalApiKey = process.env.GEMINI_API_KEY;

  afterEach(() => {
    if (originalApiKey !== undefined) {
      process.env.GEMINI_API_KEY = originalApiKey;
    } else {
      delete process.env.GEMINI_API_KEY;
    }
  });

  it("returns 500 when GEMINI_API_KEY is not configured", async () => {
    delete process.env.GEMINI_API_KEY;

    const formData = new FormData();
    formData.append("audio", new Blob(["audio-bytes"], { type: "audio/mp4" }));

    const req = new Request("http://localhost:3000/api/translate", {
      method: "POST",
      body: formData,
    });

    const res = await POST(req);
    assert.equal(res.status, 500);
    const data = await res.json();
    assert.match(data.error, /API key no configurada/i);
  });

  it("returns 400 when no audio field is present", async () => {
    process.env.GEMINI_API_KEY = "test-api-key";

    const formData = new FormData();
    formData.append("direction", "auto");

    const req = new Request("http://localhost:3000/api/translate", {
      method: "POST",
      body: formData,
    });

    const res = await POST(req);
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.match(data.error, /No se recibió audio/i);
  });

  it("returns 400 when audio file is empty (0 bytes)", async () => {
    process.env.GEMINI_API_KEY = "test-api-key";

    const formData = new FormData();
    formData.append("audio", new Blob([], { type: "audio/webm" }));

    const req = new Request("http://localhost:3000/api/translate", {
      method: "POST",
      body: formData,
    });

    const res = await POST(req);
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.match(data.error, /No se recibió audio/i);
  });

  it("returns 400 when audio file exceeds 15MB limit", async () => {
    process.env.GEMINI_API_KEY = "test-api-key";

    const largeBlob = new Blob([new Uint8Array(16 * 1024 * 1024)], { type: "audio/mp4" });
    const formData = new FormData();
    formData.append("audio", largeBlob);

    const req = new Request("http://localhost:3000/api/translate", {
      method: "POST",
      body: formData,
    });

    const res = await POST(req);
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.match(data.error, /Audio demasiado largo/i);
  });

  it("returns 400 when request body is not valid multipart/form-data", async () => {
    process.env.GEMINI_API_KEY = "test-api-key";

    const req = new Request("http://localhost:3000/api/translate", {
      method: "POST",
      body: JSON.stringify({ not: "formData" }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await POST(req);
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.match(data.error, /Formato de petición inválido/i);
  });
});

describe("API Translate - Mocked Gemini 2.0 Flash E2E Execution", () => {
  let originalGetGenerativeModel;
  const originalApiKey = process.env.GEMINI_API_KEY;

  beforeEach(() => {
    process.env.GEMINI_API_KEY = "mock-valid-gemini-key";
    originalGetGenerativeModel = GoogleGenerativeAI.prototype.getGenerativeModel;
  });

  afterEach(() => {
    GoogleGenerativeAI.prototype.getGenerativeModel = originalGetGenerativeModel;
    if (originalApiKey !== undefined) {
      process.env.GEMINI_API_KEY = originalApiKey;
    } else {
      delete process.env.GEMINI_API_KEY;
    }
  });

  it("returns 200 with structured JSON when Gemini returns markdown code fences", async () => {
    GoogleGenerativeAI.prototype.getGenerativeModel = function (opts) {
      assert.equal(opts.model, "gemini-2.0-flash");
      return {
        generateContent: async (contents) => {
          assert.equal(contents.length, 2);
          assert.equal(contents[0].inlineData.mimeType, "audio/mp4");
          return {
            response: {
              text: () =>
                '```json\n{\n  "detected_language": "es",\n  "original_text": "Buenos días, ¿cómo estás?",\n  "translation": "おはようございます、お元気ですか？"\n}\n```',
            },
          };
        },
      };
    };

    const formData = new FormData();
    formData.append("audio", new Blob(["fake-audio-bytes"], { type: "audio/mp4" }));
    formData.append("direction", "auto");

    const req = new Request("http://localhost:3000/api/translate", {
      method: "POST",
      body: formData,
    });

    const res = await POST(req);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.deepEqual(data, {
      detected_language: "es",
      original_text: "Buenos días, ¿cómo estás?",
      translation: "おはようございます、お元気ですか？",
    });
  });

  it("returns 200 with structured JSON for Japanese to Spanish direction", async () => {
    GoogleGenerativeAI.prototype.getGenerativeModel = function () {
      return {
        generateContent: async (contents) => {
          assert.equal(contents[0].inlineData.mimeType, "audio/webm");
          return {
            response: {
              text: () =>
                '{"detected_language": "ja", "original_text": "助けてください", "translation": "Por favor ayúdame"}',
            },
          };
        },
      };
    };

    const formData = new FormData();
    formData.append("audio", new Blob(["fake-audio-bytes"], { type: "audio/webm" }));
    formData.append("direction", "ja-es");

    const req = new Request("http://localhost:3000/api/translate", {
      method: "POST",
      body: formData,
    });

    const res = await POST(req);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.deepEqual(data, {
      detected_language: "ja",
      original_text: "助けてください",
      translation: "Por favor ayúdame",
    });
  });

  it("returns 422 when Gemini response cannot be parsed into required JSON schema", async () => {
    GoogleGenerativeAI.prototype.getGenerativeModel = function () {
      return {
        generateContent: async () => ({
          response: {
            text: () => "I could not detect any speech in the provided audio file.",
          },
        }),
      };
    };

    const formData = new FormData();
    formData.append("audio", new Blob(["fake-silent-audio"], { type: "audio/mp4" }));

    const req = new Request("http://localhost:3000/api/translate", {
      method: "POST",
      body: formData,
    });

    const res = await POST(req);
    assert.equal(res.status, 422);
    const data = await res.json();
    assert.match(data.error, /No se encontró un bloque JSON/i);
  });

  it("returns 500 when Gemini API throws a network or quota error", async () => {
    GoogleGenerativeAI.prototype.getGenerativeModel = function () {
      return {
        generateContent: async () => {
          throw new Error("429 Resource Exhausted: Quota exceeded");
        },
      };
    };

    const formData = new FormData();
    formData.append("audio", new Blob(["fake-audio-bytes"], { type: "audio/mp4" }));

    const req = new Request("http://localhost:3000/api/translate", {
      method: "POST",
      body: formData,
    });

    const res = await POST(req);
    assert.equal(res.status, 500);
    const data = await res.json();
    assert.match(data.error, /Quota exceeded/i);
  });
});
