import { client } from "./client";

const SECRET = process.env.SECRET;
if (!SECRET) {
  throw new Error("SECRET is not defined");
}

export interface CallbackPayload {
  movieId: string;
  variantId?: string;
  status: "success" | "failed";
  s3Key?: string;
  contentUrl?: string;
  duration?: number;
  thumbnailUrl?: string;
}

export const sendCallback = async (payload: CallbackPayload) => {
  try {
    const res = await client.api.v4.callback.$post(
      {
        json: {
          movieId: payload.movieId,
          status: payload.status === "success" ? "success" : "failed",
          variantId: payload.variantId,
          s3Key: payload.s3Key,
          contentUrl: payload.contentUrl,
          duration: payload.duration,
          thumbnailUrl: payload.thumbnailUrl,
        },
      },
      {
        headers: {
          "X-Secret": SECRET,
        },
      },
    );

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
