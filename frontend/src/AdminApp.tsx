import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent, DragEvent, FormEvent } from "react";

interface BundleFile {
  id: number;
  filename: string;
  title: string;
  file_type: string;
  created_at: string;
  preview_url: string;
}

interface Bundle {
  id: number;
  public_id: string;
  title: string;
  created_at: string;
  preview_url: string | null;
  files: BundleFile[];
}

const ALLOWED_EXTENSIONS = ["html", "js", "css", "json", "svg"];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_FILES_PER_BUNDLE = 20;

function extensionOf(filename: string): string {
  return filename.split(".").pop()?.toLowerCase() ?? "";
}

function isAllowedFile(file: File): boolean {
  return ALLOWED_EXTENSIONS.includes(extensionOf(file.name)) && file.size <= MAX_FILE_SIZE;
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

async function fetchBundles(): Promise<Bundle[]> {
  const res = await fetch("/api/v1/bundles", {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error("一覧の取得に失敗しました");
  return res.json();
}

async function uploadBundle(files: File[], title: string): Promise<Bundle> {
  const body = new FormData();
  files.forEach((file) => body.append("files[]", file));
  if (title.trim()) body.append("title", title.trim());

  const res = await fetch("/api/v1/bundles", {
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

async function deleteBundle(id: number): Promise<void> {
  const res = await fetch(`/api/v1/bundles/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("削除に失敗しました");
}

function UploadDropzone({ onFilesSelected }: { onFilesSelected: (files: File[]) => void }) {
  const [isDragActive, setIsDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragActive(false);
      const files = Array.from(event.dataTransfer.files);
      if (files.length > 0) onFilesSelected(files);
    },
    [onFilesSelected],
  );

  const handleInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? []);
      if (files.length > 0) onFilesSelected(files);
      event.target.value = "";
    },
    [onFilesSelected],
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
        ここにファイルをドラッグ＆ドロップ、またはクリックして選択（複数選択可）
      </p>
      <p className="text-xs text-slate-400">
        許可拡張子: {ALLOWED_EXTENSIONS.map((ext) => `.${ext}`).join(" / ")}（最大10MB、一度に最大
        {MAX_FILES_PER_BUNDLE}ファイル）
      </p>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ALLOWED_EXTENSIONS.map((ext) => `.${ext}`).join(",")}
        onChange={handleInputChange}
        className="hidden"
      />
    </div>
  );
}

export default function AdminApp() {
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [titleInput, setTitleInput] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  const loadBundles = useCallback(async () => {
    setIsLoading(true);
    try {
      setBundles(await fetchBundles());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "一覧の取得に失敗しました");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBundles();
  }, [loadBundles]);

  const handleFilesSelected = useCallback((files: File[]) => {
    if (files.length > MAX_FILES_PER_BUNDLE) {
      setError(`一度にアップロードできるのは最大${MAX_FILES_PER_BUNDLE}ファイルです。`);
      return;
    }
    const invalidFiles = files.filter((file) => !isAllowedFile(file));
    if (invalidFiles.length > 0) {
      setError(
        `対応していないファイルです。許可拡張子: ${ALLOWED_EXTENSIONS.join(", ")}（最大10MB）`,
      );
      return;
    }
    const names = files.map((file) => file.name);
    if (new Set(names).size !== names.length) {
      setError("同じファイル名が複数含まれています。ファイル名を変更してください。");
      return;
    }

    setError(null);
    setPendingFiles(files);
    setTitleInput(
      files.length === 1 ? files[0].name.replace(/\.[^/.]+$/, "") : `${files.length}個のファイル`,
    );
  }, []);

  const handleUpload = async (event: FormEvent) => {
    event.preventDefault();
    if (pendingFiles.length === 0) return;

    setIsUploading(true);
    try {
      await uploadBundle(pendingFiles, titleInput);
      await loadBundles();
      setPendingFiles([]);
      setTitleInput("");
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "アップロードに失敗しました");
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteBundle = async (bundle: Bundle) => {
    if (
      !window.confirm(`「${bundle.title}」(${bundle.files.length}ファイル)を削除しますか？この操作は取り消せません。`)
    ) {
      return;
    }
    try {
      await deleteBundle(bundle.id);
      setBundles((current) => current.filter((current_bundle) => current_bundle.id !== bundle.id));
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
          <UploadDropzone onFilesSelected={handleFilesSelected} />

          {pendingFiles.length > 0 && (
            <form onSubmit={handleUpload} className="flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-48">
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  タイトル（未入力時はファイル名）
                </label>
                <input
                  type="text"
                  value={titleInput}
                  onChange={(event) => setTitleInput(event.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
              <span className="pb-2 text-xs text-slate-500">
                {pendingFiles.map((file) => file.name).join(", ")}
              </span>
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
                  setPendingFiles([]);
                  setTitleInput("");
                }}
                className="rounded-md px-3 py-2 text-sm text-slate-500 hover:bg-slate-100"
              >
                キャンセル
              </button>
            </form>
          )}
        </section>

        <section className="space-y-4">
          {isLoading ? (
            <p className="rounded-xl bg-white p-6 text-sm text-slate-500 shadow-sm">読み込み中...</p>
          ) : bundles.length === 0 ? (
            <p className="rounded-xl bg-white p-6 text-sm text-slate-500 shadow-sm">
              まだファイルがありません。
            </p>
          ) : (
            bundles.map((bundle) => (
              <div key={bundle.id} className="rounded-xl bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate font-medium text-slate-800">
                      {bundle.preview_url ? (
                        <a
                          href={bundle.preview_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline"
                        >
                          {bundle.title}
                        </a>
                      ) : (
                        bundle.title
                      )}
                    </h3>
                    <p className="text-xs text-slate-500">
                      {formatDate(bundle.created_at)}
                      {bundle.files.length === 1 ? (
                        <>
                          {" "}
                          ・
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                            {bundle.files[0].file_type}
                          </span>
                        </>
                      ) : (
                        `・${bundle.files.length}ファイル`
                      )}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      onClick={() => handleDeleteBundle(bundle)}
                      className="rounded-md px-2 py-1 text-sm text-red-600 hover:bg-red-50"
                    >
                      削除
                    </button>
                  </div>
                </div>
                {bundle.files.length > 1 && (
                  <ul className="mt-3 divide-y divide-slate-100 text-sm">
                    {bundle.files.map((file) => (
                      <li key={file.id} className="flex items-center justify-between gap-2 py-2">
                        <span className="min-w-0 truncate">
                          <a
                            href={file.preview_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline"
                          >
                            {file.filename}
                          </a>{" "}
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                            {file.file_type}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))
          )}
        </section>
      </div>
    </div>
  );
}
