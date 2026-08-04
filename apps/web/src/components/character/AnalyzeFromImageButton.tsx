'use client';

import { useRef, useState } from 'react';

export interface CharacterAnalysisResult {
  persona: Record<string, string>;
  visualDna: Record<string, string>;
  commerceProfile: Record<string, string>;
  voiceProfile: Record<string, string>;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export function AnalyzeFromImageButton({
  onResult,
}: {
  onResult: (data: CharacterAnalysisResult) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('image', file);

      const res = await fetch(`${API_URL}/api/characters/analyze-image`, {
        method: 'POST',
        body: form,
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.message ?? 'วิเคราะห์ไม่สำเร็จ');
      }
      onResult(json.data as CharacterAnalysisResult);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
      e.target.value = '';
    }
  };

  return (
    <div className="inline-flex items-center gap-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={handleFile}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={loading}
        className="px-3 py-1.5 text-sm rounded-lg border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 transition-colors"
      >
        {loading ? 'กำลังวิเคราะห์…' : '🔍 วิเคราะห์จากรูป'}
      </button>
      {error && <span className="text-xs text-red-500">{error}</span>}
    </div>
  );
}
