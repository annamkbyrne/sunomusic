import { handle, json, suno } from "../lib/suno.mjs";

export default handle(async (req) => {
  const taskId = new URL(req.url).searchParams.get("taskId");
  if (!taskId || !/^[\w-]{4,128}$/.test(taskId)) return json({ error: "Missing or invalid taskId" }, 400);

  const d = await suno("/generate/record-info", { query: { taskId } });
  const tracks = (d?.response?.sunoData || []).map((t) => ({
    id: t.id,
    title: t.title,
    tags: t.tags,
    duration: t.duration,
    prompt: t.prompt,
    imageUrl: t.imageUrl || t.image_url || t.sourceImageUrl || t.source_image_url || "",
    audioUrl: t.audioUrl || t.audio_url || t.sourceAudioUrl || t.source_audio_url || "",
    streamUrl: t.streamAudioUrl || t.stream_audio_url || t.sourceStreamAudioUrl || t.source_stream_audio_url || "",
    createTime: t.createTime,
  }));

  return json({
    taskId,
    status: d?.status || "PENDING",
    errorMessage: d?.errorMessage || null,
    tracks,
  });
});

export const config = { path: "/api/status" };
