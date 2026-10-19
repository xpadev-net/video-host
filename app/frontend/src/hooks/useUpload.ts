import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { client, getSelectedProfileId } from "@/lib/client";

export type UploadPhase =
  | "idle"
  | "creating" // creating the movie record
  | "uploading" // PUT-ing the file to S3
  | "completing" // telling the backend the upload landed
  | "done" // encode queued; leaving the page is safe
  | "error";

interface UploadState {
  phase: UploadPhase;
  progress: number;
  error: string | null;
}

export interface InitUploadResult {
  movieId: string;
  title: string;
  uploadUrl: string;
  profileId: string | null;
}

interface UseUploadResult {
  init: (
    file: File,
    options?: { asUserId?: string },
  ) => Promise<InitUploadResult | null>;
  upload: (movieId: string, uploadUrl: string, file: File) => Promise<boolean>;
  resume: (movieId: string, file: File) => Promise<boolean>;
  cancel: () => void;
  state: UploadState;
  reset: () => void;
}

const isAbortError = (error: unknown): boolean =>
  error instanceof DOMException && error.name === "AbortError";

// Must match the Content-Type the presigned URL was signed with.
const contentTypeOf = (file: File): string =>
  file.type || "application/octet-stream";

export const useUpload = (): UseUploadResult => {
  const { data: authSession } = authClient.useSession();
  const sessionUserId = authSession?.user.id;
  const [state, setState] = useState<UploadState>({
    phase: "idle",
    progress: 0,
    error: null,
  });
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const profileByMovieIdRef = useRef(new Map<string, string | null>());
  const sessionByMovieIdRef = useRef(new Map<string, string>());
  const sessionUserIdRef = useRef(sessionUserId);

  useLayoutEffect(() => {
    if (sessionUserIdRef.current === sessionUserId) return;
    sessionUserIdRef.current = sessionUserId;
    xhrRef.current?.abort();
    xhrRef.current = null;
    profileByMovieIdRef.current.clear();
    sessionByMovieIdRef.current.clear();
    setState({ phase: "idle", progress: 0, error: null });
  }, [sessionUserId]);

  const reset = useCallback(() => {
    xhrRef.current?.abort();
    xhrRef.current = null;
    profileByMovieIdRef.current.clear();
    sessionByMovieIdRef.current.clear();
    setState({ phase: "idle", progress: 0, error: null });
  }, []);

  const cancel = useCallback(() => {
    xhrRef.current?.abort();
  }, []);

  const fail = useCallback((error: unknown, fallback: string) => {
    setState({
      phase: "error",
      progress: 0,
      error: error instanceof Error ? error.message : fallback,
    });
  }, []);

  const putFile = useCallback(
    (uploadUrl: string, file: File): Promise<void> =>
      new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhrRef.current = xhr;
        xhr.open("PUT", uploadUrl);
        xhr.setRequestHeader("Content-Type", contentTypeOf(file));

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const progress = Math.round((event.loaded * 100) / event.total);
            setState((prev) => ({ ...prev, progress }));
          }
        };

        xhr.onload = () => {
          xhrRef.current = null;
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            reject(new Error("Upload failed"));
          }
        };

        xhr.onerror = () => {
          xhrRef.current = null;
          reject(new Error("Upload failed"));
        };
        xhr.onabort = () => {
          xhrRef.current = null;
          reject(new DOMException("Upload aborted", "AbortError"));
        };
        xhr.send(file);
      }),
    [],
  );

  const completeUpload = useCallback(async (movieId: string): Promise<void> => {
    const sessionId = sessionByMovieIdRef.current.get(movieId);
    if (!sessionId || sessionUserIdRef.current !== sessionId) {
      throw new DOMException("Upload session changed", "AbortError");
    }
    setState((prev) => ({ ...prev, phase: "completing", progress: 100 }));
    const res = await client.api.v4.upload[":movieId"].complete.$post(
      { param: { movieId } },
      {
        headers: {
          "X-Profile-Id": profileByMovieIdRef.current.get(movieId) ?? "",
        },
      },
    );
    if (!res.ok) {
      throw new Error("Failed to finalize upload");
    }
    setState({ phase: "done", progress: 100, error: null });
  }, []);

  const init = useCallback(
    async (
      file: File,
      options?: { asUserId?: string },
    ): Promise<InitUploadResult | null> => {
      const sessionId = sessionUserIdRef.current;
      if (!sessionId) return null;
      setState({ phase: "creating", progress: 0, error: null });
      const profileId = getSelectedProfileId();
      try {
        const res = await client.api.v4.upload.init.$post(
          {
            json: {
              filename: file.name,
              contentType: contentTypeOf(file),
              size: file.size,
              asUserId: options?.asUserId,
            },
          },
          { headers: { "X-Profile-Id": profileId ?? "" } },
        );
        if (!res.ok) {
          throw new Error("Failed to create upload");
        }
        const json = await res.json();
        if (sessionUserIdRef.current !== sessionId) return null;
        profileByMovieIdRef.current.set(json.data.movie.id, profileId);
        sessionByMovieIdRef.current.set(json.data.movie.id, sessionId);
        return {
          movieId: json.data.movie.id,
          title: json.data.movie.title,
          uploadUrl: json.data.uploadUrl,
          profileId,
        };
      } catch (error) {
        if (sessionUserIdRef.current === sessionId)
          fail(error, "動画の作成に失敗しました");
        return null;
      }
    },
    [fail],
  );

  const upload = useCallback(
    async (
      movieId: string,
      uploadUrl: string,
      file: File,
    ): Promise<boolean> => {
      const sessionId = sessionByMovieIdRef.current.get(movieId);
      if (!sessionId || sessionUserIdRef.current !== sessionId) return false;
      setState((prev) => ({ ...prev, phase: "uploading", error: null }));
      try {
        await putFile(uploadUrl, file);
        if (sessionUserIdRef.current !== sessionId) return false;
        await completeUpload(movieId);
        return true;
      } catch (error) {
        if (sessionUserIdRef.current !== sessionId) return false;
        if (isAbortError(error)) {
          setState({ phase: "idle", progress: 0, error: null });
          return false;
        }
        fail(error, "アップロードに失敗しました");
        return false;
      }
    },
    [completeUpload, fail, putFile],
  );

  const resume = useCallback(
    async (movieId: string, file: File): Promise<boolean> => {
      setState({ phase: "creating", progress: 0, error: null });
      const currentSessionId = sessionUserIdRef.current;
      if (!currentSessionId) return false;
      const sessionId =
        sessionByMovieIdRef.current.get(movieId) ?? currentSessionId;
      if (sessionId !== currentSessionId) return false;
      const profileId = profileByMovieIdRef.current.has(movieId)
        ? (profileByMovieIdRef.current.get(movieId) ?? null)
        : getSelectedProfileId();
      profileByMovieIdRef.current.set(movieId, profileId);
      sessionByMovieIdRef.current.set(movieId, sessionId);
      try {
        const res = await client.api.v4.upload[":movieId"].url.$post(
          {
            param: { movieId },
            json: {
              filename: file.name,
              contentType: contentTypeOf(file),
              size: file.size,
            },
          },
          { headers: { "X-Profile-Id": profileId ?? "" } },
        );
        if (!res.ok) {
          throw new Error("Failed to get upload URL");
        }
        const json = await res.json();
        if (sessionUserIdRef.current !== sessionId) return false;
        return await upload(movieId, json.data.uploadUrl, file);
      } catch (error) {
        if (sessionUserIdRef.current !== sessionId) return false;
        if (isAbortError(error)) {
          setState({ phase: "idle", progress: 0, error: null });
          return false;
        }
        fail(error, "アップロードに失敗しました");
        return false;
      }
    },
    [fail, upload],
  );

  return { init, upload, resume, cancel, state, reset };
};
