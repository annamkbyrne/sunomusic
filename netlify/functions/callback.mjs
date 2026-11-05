// SunoAPI requires a callBackUrl. The app polls for results, so this
// endpoint simply acknowledges deliveries.
export default async () =>
  new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json" } });

export const config = { path: "/api/callback" };
