import { useCallback, useRef, useState } from "react";
import { client } from "@/lib/client";

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
}

interface UseUploadResult {
  init: (
    file: File,
    options?: { asUserId?: string },
  ) => Promise<InitUploadResult | null>;
  upload: (movieId: string, uploadUrl: string, file: File) => Promise<boolean>;
  resume: (movieId: string, file: File) => Promise<boolean>;
  cancel: () => boolean;
  state: UploadState;
  reset: () => void;
}

const isAbortError = (error: unknown): boolean =>
  error instanceof DOMException && error.name === "AbortError";

// Must match the Content-Type the presigned URL was signed with.
const contentTypeOf = (file: File): string =>
  file.type || "application/octet-stream";

export const useUpload = (): UseUploadResult => {
  const [state, setState] = useState<UploadState>({
    phase: "idle",
    progress: 0,
    error: null,
  });
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const uploadedMovieIdRef = useRef<string | null>(null);

  const reset = useCallback(() => {
    xhrRef.current?.abort();
    xhrRef.current = null;
    uploadedMovieIdRef.current = null;
    setState({ phase: "idle", progress: 0, error: null });
  }, []);

  const cancel = useCallback(() => {
    const xhr = xhrRef.current;
    if (!xhr) return false;
    xhr.abort();
    return true;
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
            reject(new Error("ファイルのアップロードに失敗しました"));
          }
        };

        xhr.onerror = () => {
          xhrRef.current = null;
          reject(new Error("ファイルのアップロードに失敗しました"));
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
    setState((prev) => ({ ...prev, phase: "completing", progress: 100 }));
    const res = await client.api.v4.upload[":movieId"].complete.$post({
      param: { movieId },
    });
    if (!res.ok) {
      throw new Error("アップロードの完了処理に失敗しました");
    }
    if (uploadedMovieIdRef.current === movieId) {
      uploadedMovieIdRef.current = null;
    }
    setState({ phase: "done", progress: 100, error: null });
  }, []);

  const init = useCallback(
    async (
      file: File,
      options?: { asUserId?: string },
    ): Promise<InitUploadResult | null> => {
      setState({ phase: "creating", progress: 0, error: null });
      try {
        const res = await client.api.v4.upload.init.$post({
          json: {
            filename: file.name,
            contentType: contentTypeOf(file),
            size: file.size,
            asUserId: options?.asUserId,
          },
        });
        if (!res.ok) {
          throw new Error("アップロード情報の作成に失敗しました");
        }
        const json = await res.json();
        return {
          movieId: json.data.movie.id,
          title: json.data.movie.title,
          uploadUrl: json.data.uploadUrl,
        };
      } catch (error) {
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
      setState((prev) => ({ ...prev, phase: "uploading", error: null }));
      try {
        await putFile(uploadUrl, file);
        uploadedMovieIdRef.current = movieId;
        await completeUpload(movieId);
        return true;
      } catch (error) {
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
      if (uploadedMovieIdRef.current === movieId) {
        setState({ phase: "completing", progress: 100, error: null });
        try {
          await completeUpload(movieId);
          return true;
        } catch (error) {
          fail(error, "アップロードの完了処理に失敗しました");
          return false;
        }
      }
      setState({ phase: "creating", progress: 0, error: null });
      try {
        const res = await client.api.v4.upload[":movieId"].url.$post({
          param: { movieId },
          json: {
            filename: file.name,
            contentType: contentTypeOf(file),
            size: file.size,
          },
        });
        if (!res.ok) {
          throw new Error("再開用URLの取得に失敗しました");
        }
        const json = await res.json();
        return await upload(movieId, json.data.uploadUrl, file);
      } catch (error) {
        if (isAbortError(error)) {
          setState({ phase: "idle", progress: 0, error: null });
          return false;
        }
        fail(error, "アップロードに失敗しました");
        return false;
      }
    },
    [completeUpload, fail, upload],
  );

  return { init, upload, resume, cancel, state, reset };
};
