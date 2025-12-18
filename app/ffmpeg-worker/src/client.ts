import type { AppRouter } from "@video-host/backend";
import { hc } from "hono/client";

const apiEndpoint = process.env.BACKEND_CALLBACK_URL;
if (!apiEndpoint) {
    throw new Error("BACKEND_CALLBACK_URL is not defined");
}

// Convert full URL to base URL (remove /api/v4/callback if present, or just use origin?)
// The backend callback URL is usually something like http://backend:3000/api/v4/callback
// But the client expects the ROOT URL of the Hono app.
// Hono app is mounted at / (appRouter).
// appRouter mounts apiRoute at /api.
// apiRoute mounts v4Route at /v4.
// v4Route mounts callbackRoute at /callback.
// So the valid URL for the client is `http://backend:3000`.
// Then we call `client.api.v4.callback.$post(...)`.
// If `BACKEND_CALLBACK_URL` is the FULL URL, we need to extract the base.

const baseUrl = new URL(apiEndpoint).origin;

export const client = hc<AppRouter>(baseUrl);
