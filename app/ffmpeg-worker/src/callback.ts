import axios from "axios";
import { BACKEND_CALLBACK_URL, CALLBACK_SECRET } from "./env";

export interface CallbackPayload {
  movieId: string;
  variantId?: string;
  status: "success" | "failed";
  s3Key?: string;
  contentUrl?: string;
  duration?: number;
  thumbnailUrl?: string;
}

export const sendCallback = async (payload: CallbackPayload): Promise<void> => {
  try {
    await axios.post(BACKEND_CALLBACK_URL, payload, {
      headers: {
        Authorization: `Bearer ${CALLBACK_SECRET}`,
        "Content-Type": "application/json",
      },
      timeout: 30000,
    });
    console.log(`Callback sent for movie ${payload.movieId}: ${payload.status}`);
  } catch (error) {
    console.error(`Failed to send callback for movie ${payload.movieId}:`, error);
    throw error;
  }
};
