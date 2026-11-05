import { handle, json, suno, readJson, callbackUrl, clip } from "../lib/suno.mjs";

export default handle(async (req) => {
  if (req.method === "POST") {
    const b = await readJson(req);
    const prompt = clip(b.prompt, 200);
    if (!prompt) return json({ error: "Describe what the lyrics should be about." }, 400);
    const data = await suno("/lyrics", { method: "POST", body: { prompt, callBackUrl: callbackUrl(req) } });
    return json({ taskId: data.taskId });
  }

  const taskId = new URL(req.url).searchParams.get("taskId");
  if (!taskId || !/^[\w-]{4,128}$/.test(taskId)) return json({ error: "Missing or invalid taskId" }, 400);
  const d = await suno("/lyrics/record-info", { query: { taskId } });
  const items = (d?.response?.data || []).map((x) => ({ title: x.title, text: x.text, status: x.status }));
  return json({ taskId, status: d?.status || "PENDING", errorMessage: d?.errorMessage || null, lyrics: items });
});

export const config = { path: "/api/lyrics" };
