import { BACKEND_CALLBACK_URL, CALLBACK_SECRET } from "./env";

const callbackUrl = new URL("/api/v4/callback", BACKEND_CALLBACK_URL);

export interface CallbackPayload {
  movieId: string;
  variantId?: string;
  status: "success" | "failed";
  s3Key: string;
  contentUrl?: string;
  duration?: number;
  thumbnailUrl?: string;
}

export const sendCallback = async (payload: CallbackPayload) => {
  try {
    const res = await fetch(callbackUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CALLBACK_SECRET}`,
      },
      body: JSON.stringify({
        movieId: payload.movieId,
        status: payload.status === "success" ? "success" : "failed",
        variantId: payload.variantId,
        s3Key: payload.s3Key,
        contentUrl: payload.contentUrl,
        duration: payload.duration,
        thumbnailUrl: payload.thumbnailUrl,
      }),
    });

    if (res.status === 409) {
      // The backend has already moved this variant on or the upload key has
      // changed; retrying this callback cannot make the old job current again.
      console.warn(`Stale encode callback ignored for ID ${payload.movieId}`);
      return;
    }
    if (!res.ok) {
      console.error(`Failed to send callback: ${res.statusText}`);
      throw new Error(`Failed to send callback: ${res.statusText}`);
    }
    console.log(`Callback sent for ID ${payload.movieId}: ${payload.status}`);
  } catch (error) {
    console.error("Error sending callback:", error);
    throw error;
  }
};
