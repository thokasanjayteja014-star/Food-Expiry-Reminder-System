import { describe, expect, it, vi } from "vitest";
import { mergeVisionAnswer } from "@/lib/visionMerge";

vi.mock("server-only", () => ({}));
const { parseVisionAnswer, validDate, readPackWithVision, pickVisionModel } = await import("@/lib/server/vision");

const today = "2026-11-03";

describe("AI reader answer", () => {
  it("keeps only real calendar dates", () => {
    expect(validDate("2026-12-22")).toBe("2026-12-22");
    expect(validDate("2026-02-30")).toBeNull();
    expect(validDate("22/12/26")).toBeNull();
    expect(validDate(null)).toBeNull();
  });

  it("parses the JSON answer, also inside a code fence, and drops an MFG after the expiry", () => {
    const a = parseVisionAnswer('```json\n{"printedText":"EXP 22/12/26","expiryDate":"2026-12-22","manufacturingDate":"2027-01-01","productName":"Coke"}\n```');
    expect(a).toEqual({ printedText: "EXP 22/12/26", expiryDate: "2026-12-22", manufacturingDate: null, productName: "Coke" });
    expect(parseVisionAnswer("not json").expiryDate).toBeNull();
  });

  it("calls Gemini with the key in a header and the photo inline", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    const answer = { printedText: "MFD 22/04/26 20:36\nEXP 22/12/26", expiryDate: "2026-12-22", manufacturingDate: "2026-04-22", productName: "Thums Up" };
    const fetchMock = vi.fn(async () => Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(answer) }] } }] }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await readPackWithVision("QUJD", "image/jpeg")).toEqual(answer);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/models/gemini-3.8-flash:generateContent");
    expect(url).not.toContain("test-key");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("test-key");
    expect(JSON.parse(init.body as string).contents[0].parts[1].inline_data).toEqual({ mime_type: "image/jpeg", data: "QUJD" });
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("switches to a model Google still offers when the configured one is retired", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubEnv("GEMINI_MODEL", "gemini-2.5-flash");
    const answer = { printedText: "EXP 22/12/26", expiryDate: "2026-12-22", manufacturingDate: null, productName: "" };
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("gemini-2.5-flash:")) return new Response('{"error":{"message":"no longer available"}}', { status: 404 });
      if (url.includes("/models?")) {
        return Response.json({ models: [
          { name: "models/gemini-2.5-flash", supportedGenerationMethods: ["generateContent"] },
          { name: "models/gemini-3.8-flash", supportedGenerationMethods: ["generateContent"] },
          { name: "models/gemini-3.8-flash-lite", supportedGenerationMethods: ["generateContent"] },
          { name: "models/text-embedding-004", supportedGenerationMethods: ["embedContent"] },
        ] });
      }
      return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(answer) }] } }] });
    });
    vi.stubGlobal("fetch", fetchMock);
    expect(await readPackWithVision("QUJD", "image/jpeg")).toEqual(answer);
    expect(String(fetchMock.mock.calls[2]?.[0])).toContain("/models/gemini-3.8-flash:generateContent");
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("prefers the newest stable full flash model", () => {
    const m = (n: string) => ({ name: `models/${n}`, supportedGenerationMethods: ["generateContent"] });
    expect(pickVisionModel([m("gemini-2.5-flash"), m("gemini-4.0-flash-preview-05"), m("gemini-3.8-flash-lite"), m("gemini-3.8-flash"), m("gemini-3.8-flash-image")])).toBe("gemini-4.0-flash-preview-05");
    expect(pickVisionModel([m("gemini-3.8-flash-lite"), m("gemini-3.8-flash"), m("gemini-3.8-flash-tts")])).toBe("gemini-3.8-flash");
    expect(pickVisionModel([m("gemini-3.8-pro")])).toBeNull();
  });

  it("reads with Groq first, in the OpenAI chat format, and drops its thinking", async () => {
    vi.stubEnv("GROQ_API_KEY", "groq-key");
    vi.stubEnv("GEMINI_API_KEY", "gem-key");
    const answer = { printedText: "EXP 22/12/26", expiryDate: "2026-12-22", manufacturingDate: "2026-04-22", productName: "Coke" };
    const fetchMock = vi.fn(async () => Response.json({ choices: [{ message: { content: `<think>dates are day first {x}</think>${JSON.stringify(answer)}` } }] }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await readPackWithVision("QUJD", "image/jpeg")).toEqual(answer);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer groq-key");
    const sent = JSON.parse(init.body as string);
    expect(sent.model).toBe("qwen/qwen3.8-27b");
    expect(sent.messages[0].content[1].image_url.url).toBe("data:image/jpeg;base64,QUJD");
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("moves on to the next AI when one is busy", async () => {
    vi.stubEnv("GROQ_API_KEY", "groq-key");
    vi.stubEnv("GEMINI_API_KEY", "gem-key");
    const answer = { printedText: "EXP 22/12/26", expiryDate: "2026-12-22", manufacturingDate: null, productName: "" };
    const fetchMock = vi.fn(async (url: string) =>
      url.includes("groq")
        ? new Response('{"error":{"message":"rate limit"}}', { status: 429 })
        : Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(answer) }] } }] }),
    );
    vi.stubGlobal("fetch", fetchMock);
    expect(await readPackWithVision("QUJD", "image/jpeg")).toEqual(answer);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("explains a Gemini error", async () => {
    vi.stubEnv("GEMINI_API_KEY", "bad");
    vi.stubGlobal("fetch", vi.fn(async () => new Response('{"error":{"message":"API key not valid"}}', { status: 400 })));
    await expect(readPackWithVision("QUJD", "image/jpeg")).rejects.toThrow(/400.*API key not valid/);
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
});

describe("combining the AI answer with our parser", () => {
  it("uses our parser on the copied text when it finds the dates", () => {
    const r = mergeVisionAnswer({ printedText: "MFD 22/04/26 20:36\nBH TLC D22HMF1A 2212\nEXP 22/12/26 RS 40/-", expiryDate: "2026-12-22", manufacturingDate: "2026-04-22", productName: "" }, today);
    expect(r.expiryDate).toBe("2026-12-22");
    expect(r.manufacturingDate).toBe("2026-04-22");
    expect(r.confidence).toBe("high");
    expect(r.needsConfirmation).toBe(true);
  });

  it("falls back to the AI's own dates when the text alone does not settle them", () => {
    const r = mergeVisionAnswer({ printedText: "L6123 10:45", expiryDate: "2027-03-15", manufacturingDate: "2026-09-15", productName: "" }, today);
    expect(r.expiryDate).toBe("2027-03-15");
    expect(r.manufacturingDate).toBe("2026-09-15");
  });

  it("works out best before N months from the printed text", () => {
    const r = mergeVisionAnswer({ printedText: "PKD 10/06/26\nBEST BEFORE 6 MONTHS FROM PACKAGING", expiryDate: null, manufacturingDate: "2026-06-10", productName: "" }, today);
    expect(r.expiryDate).toBe("2026-12-10");
  });

  it("asks to confirm when the AI and the parser disagree", () => {
    const r = mergeVisionAnswer({ printedText: "EXP 22/12/26", expiryDate: "2026-12-21", manufacturingDate: null, productName: "" }, today);
    expect(r.expiryDate).toBe("2026-12-22");
    expect(r.confidence).toBe("medium");
    expect(r.alternatives).toContain("2026-12-21");
  });

  it("reports no date when neither found one", () => {
    expect(mergeVisionAnswer({ printedText: "", expiryDate: null, manufacturingDate: null, productName: "" }, today).expiryDate).toBeNull();
  });
});
