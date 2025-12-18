import { useCallback, useState } from "react";
import { client } from "@/lib/client";

interface UploadState {
  isUploading: boolean;
  progress: number;
  error: string | null;
  s3Key: string | null;
}

interface UseUploadResult {
  upload: (file: File) => Promise<string | null>;
  state: UploadState;
  reset: () => void;
}

export const useUpload = (): UseUploadResult => {
  const [state, setState] = useState<UploadState>({
    isUploading: false,
    progress: 0,
    error: null,
    s3Key: null,
  });

  const reset = useCallback(() => {
    setState({
      isUploading: false,
      progress: 0,
      error: null,
      s3Key: null,
    });
  }, []);

  const upload = useCallback(async (file: File): Promise<string | null> => {
    setState({
      isUploading: true,
      progress: 0,
      error: null,
      s3Key: null,
    });

    try {
      // Get presigned URL from backend
      const res = await client.api.v4.upload["presigned-url"].$post({
        json: {
          filename: file.name,
          contentType: file.type,
        },
      });

      if (!res.ok) {
        throw new Error("Failed to get upload URL");
      }

      const json = await res.json();
      const { uploadUrl, key } = json.data;

      // Upload directly to S3 using XHR for progress
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", uploadUrl);
        xhr.setRequestHeader("Content-Type", file.type);

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const progress = Math.round((event.loaded * 100) / event.total);
            setState((prev) => ({ ...prev, progress }));
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            reject(new Error("Upload failed"));
          }
        };

        xhr.onerror = () => reject(new Error("Upload failed"));
        xhr.send(file);
      });

      setState((prev) => ({
        ...prev,
        isUploading: false,
        progress: 100,
        s3Key: key,
      }));

      return key;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "アップロードに失敗しました";
      setState((prev) => ({
        ...prev,
        isUploading: false,
        error: errorMessage,
      }));
      return null;
    }
  }, []);

  return { upload, state, reset };
};
