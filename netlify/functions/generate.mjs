import { handle, json, suno, readJson, callbackUrl, clip, num01 } from "../lib/suno.mjs";

const MODELS = new Set(["V6", "V6_MINI", "V6_WILD"]);

export default handle(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const b = await readJson(req);

  const customMode = Boolean(b.customMode);
  const instrumental = Boolean(b.instrumental);
  const model = MODELS.has(b.model) ? b.model : "V6";

  const payload = { customMode, instrumental, model, callBackUrl: callbackUrl(req) };

  if (customMode) {
    payload.title = clip(b.title, 80);
    payload.style = clip(b.style, 1000);
    if (!payload.title) return json({ error: "Title is required in custom mode." }, 400);
    if (!payload.style) return json({ error: "Style is required in custom mode." }, 400);
    if (!instrumental) {
      payload.lyrics = clip(b.lyrics, 5000);
      if (!payload.lyrics && !clip(b.prompt, 5000)) return json({ error: "Add lyrics (or turn on Instrumental)." }, 400);
    }
    const prompt = clip(b.prompt, 5000);
    if (prompt) payload.prompt = prompt;
    const neg = clip(b.negativeTags, 1000);
    if (neg) payload.negativeTags = neg;
    if (b.vocalGender === "m" || b.vocalGender === "f") payload.vocalGender = b.vocalGender;
    for (const k of ["styleWeight", "weirdnessConstraint"]) {
      const v = num01(b[k]);
      if (v !== undefined) payload[k] = v;
    }
  } else {
    payload.prompt = clip(b.prompt, 3000);
    if (!payload.prompt) return json({ error: "Describe the song you want." }, 400);
  }

  for (const k of Object.keys(payload)) if (payload[k] === undefined) delete payload[k];

  const data = await suno("/generate", { method: "POST", body: payload });
  return json({ taskId: data.taskId });
});

export const config = { path: "/api/generate" };
