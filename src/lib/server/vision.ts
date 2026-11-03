import "server-only";

/**
 * Reads a pack photo with an AI vision model. Used before the offline Tesseract reader because
 * it reads dot-matrix and embossed codes on cans and bottles that plain OCR cannot.
 *
 * Providers, tried in this order when their key is set, each falling through to the next when
 * it is busy or fails:
 *   Groq   (GROQ_API_KEY, free, no card; GROQ_MODEL)
 *   Grok   (XAI_API_KEY from xAI, paid credits; XAI_MODEL)
 *   Gemini (GEMINI_API_KEY, free; GEMINI_MODEL)
 */
export function isVisionConfigured(): boolean {
  return visionProviders().length > 0;
}

export type VisionProvider = "groq" | "xai" | "gemini";

export function visionProviders(): VisionProvider[] {
  const list: VisionProvider[] = [];
  if (process.env.GROQ_API_KEY) list.push("groq");
  if (process.env.XAI_API_KEY) list.push("xai");
  if (process.env.GEMINI_API_KEY) list.push("gemini");
  return list;
}

export const DEFAULT_GROQ_MODEL = "qwen/qwen3.8-27b";
export const DEFAULT_XAI_MODEL = "grok-4.7";

export const DEFAULT_VISION_MODEL = "gemini-3.8-flash";

/** A model found by asking Google, used once the configured one is retired. */
let discoveredModel: string | null = null;

/** The Gemini model in use. */
export function visionModel(): string {
  return discoveredModel || process.env.GEMINI_MODEL || DEFAULT_VISION_MODEL;
}

interface ListedModel {
  name?: string;
  supportedGenerationMethods?: string[];
}

/** Version number in a model id (gemini-3.8-flash -> 3.8), 0 when absent. */
function modelVersion(id: string): number {
  const m = /gemini-(\d+(?:\.\d+)?)/.exec(id);
  return m ? Number(m[1]) : 0;
}

/**
 * Picks the newest stable "flash" model this key can use. Google retires models for new users,
 * so a hard-coded name eventually stops working; this keeps the app reading without a code change.
 */
export function pickVisionModel(models: ListedModel[]): string | null {
  const ids = models
    .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
    .map((m) => (m.name ?? "").replace(/^models\//, ""))
    .filter((id) => /^gemini-[\d.]+-flash/.test(id) && !/(image|tts|audio|live|thinking|embedding)/.test(id));
  const rank = (id: string) =>
    modelVersion(id) * 100 + (/(preview|exp)/.test(id) ? 0 : 2) + (/lite/.test(id) ? 0 : 1);
  ids.sort((a, b) => rank(b) - rank(a) || a.length - b.length);
  return ids[0] ?? null;
}

async function discoverModel(signal: AbortSignal): Promise<string | null> {
  const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000", {
    headers: { "x-goog-api-key": process.env.GEMINI_API_KEY! },
    signal,
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { models?: ListedModel[] };
  return pickVisionModel(body.models ?? []);
}

export interface VisionReading {
  /** The printed date / batch lines, copied as they appear on the pack. */
  printedText: string;
  /** YYYY-MM-DD, or null when no expiry is printed or it cannot be read. */
  expiryDate: string | null;
  manufacturingDate: string | null;
  productName: string;
}

export const VISION_PROMPT = `You read food packaging photos for an expiry reminder app.
Find the printed manufacturing / packing date and the expiry / best before / use by date.
They are often dot-matrix or inkjet print on a can bottom, bottle cap, or crimp, and may be faint, tilted or shiny.

Return JSON with:
- printedText: the lines that hold dates, batch codes and labels, copied exactly as printed (keep labels like MFD, PKD, EXP, BB, USE BY, BEST BEFORE), one line per printed line.
- expiryDate: the expiry / best before / use by date as YYYY-MM-DD. If only month and year are printed, use the last day of that month. If the pack says "best before N months from manufacture/packing", add N months to that date. Use null if no expiry can be read. Never guess a date that is not printed.
- manufacturingDate: the manufacturing / packed date as YYYY-MM-DD (first day of the month if only month and year), or null.
- productName: the brand and product if visible, else "".

Dates on Indian, UK and EU packs are day first (22/04/26 is 22 April 2026). Two-digit years are 20xx. A time like 20:36 next to a date is not part of the date.`;

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    printedText: { type: "STRING" },
    expiryDate: { type: "STRING", nullable: true },
    manufacturingDate: { type: "STRING", nullable: true },
    productName: { type: "STRING" },
  },
  required: ["printedText", "expiryDate", "manufacturingDate", "productName"],
};

const ISO_DATE = /^(20\d{2})-(\d{2})-(\d{2})$/;

/** A real calendar date in 2000-2099, else null. */
export function validDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const m = ISO_DATE.exec(value.trim());
  if (!m) return null;
  const d = new Date(`${m[0]}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === m[0] ? m[0] : null;
}

/** Turns Gemini's JSON answer into a reading, dropping anything malformed. */
export function parseVisionAnswer(raw: string): VisionReading {
  // Reasoning models (Qwen on Groq) may put their thinking before the JSON.
  raw = raw.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    // Some models wrap JSON in a code fence.
    const m = /\{[\s\S]*\}/.exec(raw);
    if (m) {
      try {
        data = JSON.parse(m[0]) as Record<string, unknown>;
      } catch {
        data = {};
      }
    }
  }
  const expiry = validDate(data.expiryDate);
  let mfg = validDate(data.manufacturingDate);
  if (mfg && expiry && mfg >= expiry) mfg = null;
  return {
    printedText: typeof data.printedText === "string" ? data.printedText.slice(0, 2000) : "",
    expiryDate: expiry,
    manufacturingDate: mfg,
    productName: typeof data.productName === "string" ? data.productName.slice(0, 100) : "",
  };
}

async function generate(model: string, imageBase64: string, mimeType: string, signal: AbortSignal): Promise<Response> {
  return fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY! },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: VISION_PROMPT }, { inline_data: { mime_type: mimeType, data: imageBase64 } }] }],
      generationConfig: { temperature: 0, responseMimeType: "application/json", responseSchema: RESPONSE_SCHEMA },
    }),
    signal,
  });
}

async function readWithGemini(imageBase64: string, mimeType: string): Promise<VisionReading> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    let model = visionModel();
    let res = await generate(model, imageBase64, mimeType, controller.signal);
    if (res.status === 404) {
      // The model was retired or renamed: ask Google which models this key has and retry once.
      const found = await discoverModel(controller.signal).catch(() => null);
      if (found && found !== model) {
        console.warn(`Gemini model ${model} is unavailable, switching to ${found}`);
        discoveredModel = model = found;
        res = await generate(model, imageBase64, mimeType, controller.signal);
      }
    }
    if (!res.ok) {
      // Google explains the problem (bad key, unknown model, quota) in the body; it holds no secrets.
      const detail = await res.text().catch(() => "");
      throw new Error(`Gemini (${model}) returned ${res.status}: ${detail.slice(0, 300)}`);
    }
    const body = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const text = body.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    return parseVisionAnswer(text);
  } finally {
    clearTimeout(timer);
  }
}

/** The prompt plus the JSON shape, for providers without a response schema option. */
const JSON_PROMPT = `${VISION_PROMPT}

Reply with only a JSON object: {"printedText": string, "expiryDate": string or null, "manufacturingDate": string or null, "productName": string}.`;

/** Groq and xAI both speak the OpenAI chat completions format. */
async function readWithChatApi(
  name: string,
  url: string,
  key: string,
  model: string,
  imageBase64: string,
  mimeType: string,
): Promise<VisionReading> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: JSON_PROMPT },
              { type: "image_url", image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
            ],
          },
        ],
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`${name} (${model}) returned ${res.status}: ${detail.slice(0, 300)}`);
    }
    const body = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return parseVisionAnswer(body.choices?.[0]?.message?.content ?? "");
  } finally {
    clearTimeout(timer);
  }
}

function readWith(provider: VisionProvider, imageBase64: string, mimeType: string): Promise<VisionReading> {
  switch (provider) {
    case "groq":
      return readWithChatApi("Groq", "https://api.groq.com/openai/v1/chat/completions", process.env.GROQ_API_KEY!,
        process.env.GROQ_MODEL || DEFAULT_GROQ_MODEL, imageBase64, mimeType);
    case "xai":
      return readWithChatApi("Grok", "https://api.x.ai/v1/chat/completions", process.env.XAI_API_KEY!,
        process.env.XAI_MODEL || DEFAULT_XAI_MODEL, imageBase64, mimeType);
    case "gemini":
      return readWithGemini(imageBase64, mimeType);
  }
}

/**
 * Reads the photo with the first provider that answers. A busy or failing provider (Gemini's
 * "high demand" 503, a used-up daily limit) falls through to the next one. When one answers
 * without an expiry date the next one gets a look too, and the first answer is kept if none
 * does better.
 */
export async function readPackWithVision(imageBase64: string, mimeType: string): Promise<VisionReading> {
  const errors: string[] = [];
  let fallback: VisionReading | null = null;
  for (const provider of visionProviders()) {
    try {
      const reading = await readWith(provider, imageBase64, mimeType);
      if (reading.expiryDate) return reading;
      fallback ??= reading;
    } catch (error) {
      const message = (error as Error).message;
      console.warn("Vision provider failed", message);
      errors.push(message);
    }
  }
  if (fallback) return fallback;
  throw new Error(errors.join(" | ") || "No AI reader is configured.");
}
