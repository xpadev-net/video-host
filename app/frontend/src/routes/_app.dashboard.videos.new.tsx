import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAtomValue } from "jotai";
import { type ChangeEvent, type FormEvent, useRef, useState } from "react";
import { AuthTokenAtom } from "@/atoms/Auth";
import { selectedAccountIdAtom } from "@/atoms/SelectedAccount";
import { useUpload } from "@/hooks/useUpload";
import { useSelf } from "@/hooks/useUser";
import { client } from "@/lib/client";

export const Route = createFileRoute("/_app/dashboard/videos/new")({
  head: () => ({ meta: [{ title: "動画をアップロード" }] }),
  component: NewVideoPage,
});

function NewVideoPage() {
  const navigate = useNavigate();
  const token = useAtomValue(AuthTokenAtom);
  const selectedAccountId = useAtomValue(selectedAccountIdAtom);
  const { data: user, isLoading: isUserLoading } = useSelf();
  const { upload, state: uploadState, reset: resetUpload } = useUpload();

  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<
    "PUBLIC" | "UNLISTED" | "PRIVATE"
  >("PUBLIC");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      if (!title) {
        setTitle(selectedFile.name.replace(/\.[^/.]+$/, ""));
      }
      resetUpload();
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!file || !title.trim()) return;

    setIsSubmitting(true);
    setError(null);

    try {
      // Upload to S3
      const s3Key = await upload(file);
      if (!s3Key) {
        setError("ファイルのアップロードに失敗しました");
        setIsSubmitting(false);
        return;
      }

      // Create movie record
      const res = await client.api.v4.movies.$post(
        {
          json: {
            title: title.trim(),
            description: description.trim(),
            s3Key,
            visibility,
            asUserId: selectedAccountId || undefined,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      if (!res.ok) {
        throw new Error("Failed to create movie");
      }

      const json = await res.json();
      const movieId = json.data.id;
      await navigate({
        to: "/dashboard/videos/$id/edit",
        params: { id: movieId },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "動画の作成に失敗しました");
      setIsSubmitting(false);
    }
  };

  if (isUserLoading) {
    return <div>Loading...</div>;
  }

  if (!user) {
    return <div>ログインしてください</div>;
  }

  return (
    <>
      <div className="upload-page">
        <h1>動画をアップロード</h1>
        <form onSubmit={handleSubmit} className="upload-form">
          <div className="form-group">
            <label htmlFor="video-file">動画ファイル</label>
            <button
              type="button"
              className="file-drop-zone"
              onClick={() => fileInputRef.current?.click()}
            >
              {file ? (
                <div className="file-info">
                  <span className="file-icon">🎬</span>
                  <span className="file-name">{file.name}</span>
                  <span className="file-size">
                    ({(file.size / 1024 / 1024).toFixed(2)} MB)
                  </span>
                </div>
              ) : (
                <div className="file-placeholder">
                  <span>クリックして動画を選択</span>
                </div>
              )}
            </button>
            <input
              ref={fileInputRef}
              id="video-file"
              type="file"
              accept="video/*"
              onChange={handleFileChange}
              hidden
            />
          </div>

          {uploadState.isUploading && (
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{ width: `${uploadState.progress}%` }}
              />
              <span className="progress-text">{uploadState.progress}%</span>
            </div>
          )}

          <div className="form-group">
            <label htmlFor="title">タイトル</label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="動画のタイトルを入力"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="description">説明</label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="動画の説明を入力（任意）"
              rows={4}
            />
          </div>

          <div className="form-group">
            <label htmlFor="visibility">公開設定</label>
            <select
              id="visibility"
              value={visibility}
              onChange={(e) =>
                setVisibility(
                  e.target.value as "PUBLIC" | "UNLISTED" | "PRIVATE",
                )
              }
            >
              <option value="PUBLIC">公開</option>
              <option value="UNLISTED">限定公開</option>
              <option value="PRIVATE">非公開</option>
            </select>
          </div>

          {error && <div className="error-message">{error}</div>}

          <button
            type="submit"
            disabled={!file || !title.trim() || isSubmitting}
            className="submit-button"
          >
            {isSubmitting
              ? uploadState.isUploading
                ? "アップロード中..."
                : "作成中..."
              : "アップロード"}
          </button>
        </form>
      </div>
      <style>{`
        .upload-page h1 {
          margin-bottom: 2rem;
          color: var(--text-primary, #fff);
        }
        .upload-form {
          max-width: 600px;
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }
        .form-group {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .form-group label {
          color: var(--text-secondary, #999);
          font-size: 0.875rem;
        }
        .form-group input,
        .form-group textarea,
        .form-group select {
          padding: 0.75rem;
          background: var(--background-primary, #0d0d0d);
          border: 1px solid var(--border-color, #333);
          border-radius: 8px;
          color: var(--text-primary, #fff);
          font-size: 1rem;
        }
        .form-group input:focus,
        .form-group textarea:focus,
        .form-group select:focus {
          outline: none;
          border-color: var(--primary-color, #3b82f6);
        }
        .file-drop-zone {
          padding: 2rem;
          border: 2px dashed var(--border-color, #333);
          border-radius: 12px;
          text-align: center;
          cursor: pointer;
          transition: all 0.2s;
        }
        .file-drop-zone:hover {
          border-color: var(--primary-color, #3b82f6);
        }
        .file-placeholder {
          color: var(--text-secondary, #999);
        }
        .file-info {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
        }
        .file-icon {
          font-size: 1.5rem;
        }
        .file-name {
          color: var(--text-primary, #fff);
        }
        .file-size {
          color: var(--text-secondary, #999);
          font-size: 0.875rem;
        }
        .progress-bar {
          position: relative;
          height: 8px;
          background: var(--background-primary, #0d0d0d);
          border-radius: 4px;
          overflow: hidden;
        }
        .progress-fill {
          height: 100%;
          background: var(--primary-color, #3b82f6);
          transition: width 0.3s;
        }
        .progress-text {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          font-size: 0.75rem;
          color: var(--text-primary, #fff);
        }
        .error-message {
          padding: 0.75rem;
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid #ef4444;
          border-radius: 8px;
          color: #ef4444;
        }
        .submit-button {
          padding: 0.875rem 1.5rem;
          background: var(--primary-color, #3b82f6);
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 1rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        }
        .submit-button:hover:not(:disabled) {
          background: #2563eb;
        }
        .submit-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      `}</style>
    </>
  );
}
