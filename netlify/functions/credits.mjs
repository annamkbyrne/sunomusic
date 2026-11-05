import { handle, json, suno } from "../lib/suno.mjs";

export default handle(async () => {
  const credits = await suno("/generate/credit");
  return json({ credits });
});

export const config = { path: "/api/credits" };
