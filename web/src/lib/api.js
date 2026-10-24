
const API_URL =
  import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

export async function sendChat(messages, options = {}) {
  const response = await fetch(`${API_URL}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messages,
      temperature: options.temperature ?? 0.2,
      max_tokens: options.max_tokens ?? 512,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API error ${response.status}: ${error}`);
  }

  return response.json();
}
