import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent, DragEvent, FormEvent } from "react";

interface UserFile {
  id: number;
  public_id: string;
  title: string;
  filename: string;
  file_type: string;
  created_at: string;
  preview_url: string;
}

const ALLOWED_EXTENSIONS = ["html", "js", "css", "json", "svg"];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

function extensionOf(filename: string): string {
  return filename.split(".").pop()?.toLowerCase() ?? "";
}

function isAllowedFile(file: File): boolean {
  return ALLOWED_EXTENSIONS.includes(extensionOf(file.name)) && file.size <= MAX_FILE_SIZE;
}

function absoluteUrl(path: string): string {
  return `${window.location.origin}${path}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function fetchUserFiles(): Promise<UserFile[]> {
  const res = await fetch("/api/v1/user_files", {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error("一覧の取得に失敗しました");
  return res.json();
}

async function uploadUserFile(file: File, title: string): Promise<UserFile> {
  const body = new FormData();
  body.append("file", file);
  if (title.trim()) body.append("title", title.trim());

  const res = await fetch("/api/v1/user_files", {
    method: "POST",
    headers: { Accept: "application/json" },
    body,
  });

  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    const message = payload?.errors?.join(", ") ?? "アップロードに失敗しました";
    throw new Error(message);
  }

  return res.json();
}

async function deleteUserFile(id: number): Promise<void> {
  const res = await fetch(`/api/v1/user_files/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("削除に失敗しました");
}

function UploadDropzone({ onFileSelected }: { onFileSelected: (file: File) => void }) {
  const [isDragActive, setIsDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragActive(false);
      const file = event.dataTransfer.files[0];
      if (file) onFileSelected(file);
    },
    [onFileSelected],
  );

  const handleInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) onFileSelected(file);
      event.target.value = "";
    },
    [onFileSelected],
  );

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        setIsDragActive(true);
      }}
      onDragLeave={() => setIsDragActive(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-10 text-center transition-colors ${
        isDragActive
          ? "border-blue-500 bg-blue-50"
          : "border-slate-300 bg-slate-50 hover:border-slate-400"
      }`}
    >
      <p className="text-sm font-medium text-slate-700">
        ここにファイルをドラッグ＆ドロップ、またはクリックして選択
      </p>
      <p className="text-xs text-slate-400">
        許可拡張子: {ALLOWED_EXTENSIONS.map((ext) => `.${ext}`).join(" / ")}（最大10MB）
      </p>
      <input
        ref={inputRef}
        type="file"
        accept={ALLOWED_EXTENSIONS.map((ext) => `.${ext}`).join(",")}
        onChange={handleInputChange}
        className="hidden"
      />
    </div>
  );
}

function PreviewModal({ userFile, onClose }: { userFile: UserFile; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="flex h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="truncate font-medium text-slate-800">{userFile.title}</h2>
          <button
            onClick={onClose}
            className="rounded-md px-2 py-1 text-slate-500 hover:bg-slate-100"
          >
            閉じる
          </button>
        </div>
        <iframe
          src={userFile.preview_url}
          title={userFile.title}
          className="h-full w-full flex-1 border-0"
        />
      </div>
    </div>
  );
}

export default function AdminApp() {
  const [userFiles, setUserFiles] = useState<UserFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [titleInput, setTitleInput] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [previewFile, setPreviewFile] = useState<UserFile | null>(null);

  const loadUserFiles = useCallback(async () => {
    setIsLoading(true);
    try {
      setUserFiles(await fetchUserFiles());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "一覧の取得に失敗しました");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUserFiles();
  }, [loadUserFiles]);

  const handleFileSelected = useCallback((file: File) => {
    if (!isAllowedFile(file)) {
      setError(
        `対応していないファイルです。許可拡張子: ${ALLOWED_EXTENSIONS.join(", ")}（最大10MB）`,
      );
      return;
    }
    setError(null);
    setPendingFile(file);
    setTitleInput(file.name.replace(/\.[^/.]+$/, ""));
  }, []);

  const handleUpload = async (event: FormEvent) => {
    event.preventDefault();
    if (!pendingFile) return;

    setIsUploading(true);
    try {
      await uploadUserFile(pendingFile, titleInput);
      setPendingFile(null);
      setTitleInput("");
      setError(null);
      await loadUserFiles();
    } catch (err) {
      setError(err instanceof Error ? err.message : "アップロードに失敗しました");
    } finally {
      setIsUploading(false);
    }
  };

  const handleCopy = async (userFile: UserFile) => {
    await navigator.clipboard.writeText(absoluteUrl(userFile.preview_url));
    setCopiedId(userFile.id);
    setTimeout(() => setCopiedId((current) => (current === userFile.id ? null : current)), 2000);
  };

  const handleDelete = async (userFile: UserFile) => {
    if (!window.confirm(`「${userFile.title}」を削除しますか？この操作は取り消せません。`)) {
      return;
    }
    try {
      await deleteUserFile(userFile.id);
      setUserFiles((current) => current.filter((file) => file.id !== userFile.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "削除に失敗しました");
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-10">
      <div className="mx-auto max-w-4xl space-y-8">
        <header>
          <h1 className="text-2xl font-bold text-slate-900">HTML Vault</h1>
          <p className="text-sm text-slate-500">HTML/JSファイルの保管・閲覧</p>
        </header>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <section className="space-y-4 rounded-xl bg-white p-6 shadow-sm">
          <UploadDropzone onFileSelected={handleFileSelected} />

          {pendingFile && (
            <form onSubmit={handleUpload} className="flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-48">
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  タイトル（未入力時はファイル名）
                </label>
                <input
                  type="text"
                  value={titleInput}
                  onChange={(event) => setTitleInput(event.target.value)}
                  placeholder={pendingFile.name}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
              <span className="pb-2 text-xs text-slate-500">{pendingFile.name}</span>
              <button
                type="submit"
                disabled={isUploading}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {isUploading ? "アップロード中..." : "アップロード"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setPendingFile(null);
                  setTitleInput("");
                }}
                className="rounded-md px-3 py-2 text-sm text-slate-500 hover:bg-slate-100"
              >
                キャンセル
              </button>
            </form>
          )}
        </section>

        <section className="overflow-hidden rounded-xl bg-white shadow-sm">
          {isLoading ? (
            <p className="p-6 text-sm text-slate-500">読み込み中...</p>
          ) : userFiles.length === 0 ? (
            <p className="p-6 text-sm text-slate-500">まだファイルがありません。</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">タイトル</th>
                  <th className="px-4 py-3">種別</th>
                  <th className="px-4 py-3">作成日時</th>
                  <th className="px-4 py-3 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {userFiles.map((userFile) => (
                  <tr key={userFile.id}>
                    <td className="max-w-64 truncate px-4 py-3 font-medium text-slate-800">
                      {userFile.title}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                        {userFile.file_type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{formatDate(userFile.created_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => setPreviewFile(userFile)}
                          className="rounded-md px-2 py-1 text-blue-600 hover:bg-blue-50"
                        >
                          プレビュー
                        </button>
                        <button
                          onClick={() => handleCopy(userFile)}
                          className="rounded-md px-2 py-1 text-slate-600 hover:bg-slate-100"
                        >
                          {copiedId === userFile.id ? "コピーしました" : "URLコピー"}
                        </button>
                        <button
                          onClick={() => handleDelete(userFile)}
                          className="rounded-md px-2 py-1 text-red-600 hover:bg-red-50"
                        >
                          削除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      {previewFile && (
        <PreviewModal userFile={previewFile} onClose={() => setPreviewFile(null)} />
      )}
    </div>
  );
}
