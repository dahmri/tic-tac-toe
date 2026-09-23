// Talks to the game server's JSON API. The session lives in an HttpOnly
// cookie the browser sends by itself; scripts never see it.

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error || 'Something went wrong. Try again.');
    this.status = status;
    this.fields = body?.fields || {};
  }
}

export async function api(method, path, body) {
  let res;
  try {
    res = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, { error: "Can't reach the server. Check your connection." });
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}
