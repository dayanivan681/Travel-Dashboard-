// Thin client for the /api/ai route. All AI features are optional — callers
// should check settings.aiEnabled && settings.apiKey before offering them.

export async function aiRequest<T = unknown>(
  action: string,
  apiKey: string,
  payload?: Record<string, unknown>
): Promise<T> {
  const res = await fetch("/api/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, apiKey, payload }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.error || `AI request failed (${res.status})`);
  }
  return json as T;
}
