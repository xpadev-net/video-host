import axios from "axios";
import { useAtomValue } from "jotai";
import { useCallback, useState } from "react";
import { AuthTokenAtom } from "@/atoms/Auth";

const API_URL = process.env.NEXT_PUBLIC_API_ENDPOINT || "";

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
  const token = useAtomValue(AuthTokenAtom);
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

  const upload = useCallback(
    async (file: File): Promise<string | null> => {
      setState({
        isUploading: true,
        progress: 0,
        error: null,
        s3Key: null,
      });

      try {
        // Get presigned URL from backend
        const presignedRes = await axios.post(
          `${API_URL}upload/presigned-url`,
          {
            filename: file.name,
            contentType: file.type,
          },
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        );

        const { uploadUrl, key } = presignedRes.data.data;

        // Upload directly to S3
        await axios.put(uploadUrl, file, {
          headers: {
            "Content-Type": file.type,
          },
          onUploadProgress: (progressEvent) => {
            if (progressEvent.total) {
              const progress = Math.round(
                (progressEvent.loaded * 100) / progressEvent.total,
              );
              setState((prev) => ({ ...prev, progress }));
            }
          },
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
    },
    [token],
  );

  return { upload, state, reset };
};
