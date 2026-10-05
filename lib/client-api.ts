export class RequestError extends Error {
  constructor(
    public message: string,
    public field?: string,
    public issues?: { path: string[]; message: string }[],
    public status?: number,
  ) {
    super(message);
  }
}
export async function requestJson<T>(
  url: string,
  options?: RequestInit,
): Promise<T> {
  const response = await fetch(url, {
    ...options,
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401) window.location.replace("/login");
    throw new RequestError(
      data.message ?? "Unable to save. Please try again.",
      data.field,
      data.issues,
      response.status,
    );
  }
  return data;
}
