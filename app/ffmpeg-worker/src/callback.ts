import { BACKEND_BASE_URL, CALLBACK_SECRET } from "./env";
import { deleteFromProd } from "./s3";

const callbackBaseUrl = `${BACKEND_BASE_URL.replace(/\/+$/, "")}/`;
const callbackUrl = new URL("api/v4/callback", callbackBaseUrl);
const CALLBACK_TIMEOUT_MS = 10_000;
const MAX_CALLBACK_ATTEMPTS = 5;
const CALLBACK_RETRY_BASE_DELAY_MS = 500;

const requestCallback = async (
  body: string,
  movieId: string,
): Promise<Response> => {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_CALLBACK_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(callbackUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${CALLBACK_SECRET}`,
        },
        body,
        signal: AbortSignal.timeout(CALLBACK_TIMEOUT_MS),
      });

      if (response.status < 500) return response;
      lastError = new Error(
        `Callback server error: ${response.status} ${response.statusText}`,
      );
      await response.body?.cancel().catch(() => {});
    } catch (error) {
      lastError = error;
    }

    if (attempt === MAX_CALLBACK_ATTEMPTS) {
      console.error(
        `Callback failed after ${attempt} attempts: movieId=${movieId}`,
        lastError,
      );
      throw lastError;
    }

    const delayMs = CALLBACK_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
    console.warn(
      `Callback attempt ${attempt}/${MAX_CALLBACK_ATTEMPTS} failed; retrying in ${delayMs}ms: movieId=${movieId}`,
      lastError,
    );
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  throw new Error("Callback retry loop ended unexpectedly");
};

export interface CallbackPayload {
  movieId: string;
  variantId?: string;
  status: "success" | "failed";
  s3Key: string;
  contentUrl?: string;
  duration?: number;
  thumbnailUrl?: string;
  thumbnailKey?: string;
}

export type CallbackResult = "accepted" | "stale" | "deleted" | "rejected";

export const sendCallback = async (
  payload: CallbackPayload,
): Promise<CallbackResult> => {
  const res = await requestCallback(
    JSON.stringify({
      movieId: payload.movieId,
      status: payload.status,
      variantId: payload.variantId,
      s3Key: payload.s3Key,
      contentUrl: payload.contentUrl,
      duration: payload.duration,
      thumbnailUrl: payload.thumbnailUrl,
      thumbnailKey: payload.thumbnailKey,
    }),
    payload.movieId,
  );

  if (res.status === 409) {
    // The backend has already moved this variant on or the upload key has
    // changed; retrying this callback cannot make the old job current again.
    console.warn(`Stale encode callback ignored for ID ${payload.movieId}`);
    return "stale";
  }
  if (res.status === 410) {
    // The movie was deleted while this encode was running. Do not leave its
    // completed output behind in the production bucket.
    if (payload.status === "success") {
      await deleteFromProd(payload.s3Key);
    }
    return "deleted";
  }
  if (res.status === 400) {
    const body = (await res.json().catch(() => null)) as {
      message?: string;
    } | null;
    if (
      ["Movie not found", "No matching variant found"].includes(
        body?.message ?? "",
      )
    ) {
      // The movie or its variant was deleted while this encode was running.
      if (payload.status === "success") {
        await deleteFromProd(payload.s3Key);
      }
      return "deleted";
    }
  }
  if (res.status >= 400 && res.status < 500) {
    // A client error will not become valid on the next reap. Treat it as a
    // terminal callback outcome instead of retaining the claim forever.
    console.error(
      `Permanent callback rejection: ${res.status} ${res.statusText}`,
    );
    return "rejected";
  }
  console.log(`Callback sent for ID ${payload.movieId}: ${payload.status}`);
  return "accepted";
};
