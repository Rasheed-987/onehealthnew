/**
 * The browser half of the response contract `lib/api.ts` serves.
 *
 * Every route answers with JSON and every failure answers with
 * `{ error, details? }`, so there is exactly one way to read a response and
 * exactly one way to turn a failure into something a person can read. Before
 * this, each screen re-derived both inline; the point of putting it here is
 * that the wording of an error no longer depends on which component asked.
 */

/** A reply that arrived, but not with a 2xx. Carries the server's own wording. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly payload: { error?: string; details?: unknown },
  ) {
    super(payload.error ?? `Request failed with ${status}.`);
    this.name = "ApiError";
  }

  /** The per-field map a 400 carries, or the extra context on a 409. */
  get details(): Record<string, unknown> | undefined {
    return this.payload.details as Record<string, unknown> | undefined;
  }
}

/** No reply at all - offline, DNS, a dropped connection, a cancelled request. */
export class NetworkError extends Error {
  constructor() {
    super("Could not reach the server.");
    this.name = "NetworkError";
  }
}

/**
 * `fetch` narrowed to this app's contract: JSON out, JSON in, a thrown error
 * on anything that is not a 2xx.
 *
 * A body that will not parse becomes `{}` rather than a throw, which is what
 * every call site already did by hand - a 500 that fell over before it could
 * serialise still has to leave the caller with a fallback message to show.
 */
export async function fetchJson<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new NetworkError();
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(response.status, payload);
  return payload as T;
}

/**
 * The line to show the reader: the server's wording when it sent one, the
 * caller's fallback when it did not, and one fixed sentence when the request
 * never landed. Anything unrecognised is treated as the last case, matching
 * the `catch` that used to wrap each of these fetches.
 */
export function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.payload.error ?? fallback;
  return "Could not reach the server.";
}
