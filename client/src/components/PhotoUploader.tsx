import { useRef } from 'react';

export interface PhotoItem {
  id: string;
  file: File;
  url: string;
}

interface Props {
  photos: PhotoItem[];
  onChange: (photos: PhotoItem[]) => void;
}

export default function PhotoUploader({ photos, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  function handleFiles(files: FileList | null) {
    if (!files) return;
    const additions: PhotoItem[] = Array.from(files).map((file) => ({
      id: crypto.randomUUID(),
      file,
      url: URL.createObjectURL(file),
    }));
    onChange([...photos, ...additions]);
  }

  function remove(id: string) {
    const target = photos.find((p) => p.id === id);
    if (target) URL.revokeObjectURL(target.url);
    onChange(photos.filter((p) => p.id !== id));
  }

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = '';
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 py-4 text-base font-semibold text-gray-600 active:scale-[0.99] transition"
      >
        <span className="text-xl">📷</span> Add photos
      </button>

      {photos.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {photos.map((p) => (
            <div key={p.id} className="relative aspect-square overflow-hidden rounded-xl">
              <img src={p.url} alt="" className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => remove(p.id)}
                className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-sm text-white"
                aria-label="Remove photo"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
