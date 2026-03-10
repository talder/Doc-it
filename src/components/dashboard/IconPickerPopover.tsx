"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Upload, X, ImageIcon, Trash2 } from "lucide-react";

interface UploadedIcon {
  filename: string;
  url: string;
}

interface IconPickerPopoverProps {
  onSelect: (iconValue: string) => void;
}

export default function IconPickerPopover({ onSelect }: IconPickerPopoverProps) {
  const [open, setOpen] = useState(false);
  const [icons, setIcons] = useState<UploadedIcon[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchIcons = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/dashboard/icons");
      if (res.ok) {
        const data = await res.json();
        setIcons(data.icons || []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      fetchIcons();
    }
  }, [open, fetchIcons]);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const uploadFile = async (file: File) => {
    setError("");
    if (!file.type.startsWith("image/")) {
      setError("File must be an image");
      return;
    }
    if (file.size > 1024 * 1024) {
      setError("Image must be under 1 MB");
      return;
    }

    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/dashboard/icons", { method: "POST", body: form });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Upload failed");
        return;
      }
      await fetchIcons();
    } catch {
      setError("Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (filename: string) => {
    try {
      await fetch("/api/dashboard/icons", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename }),
      });
      setIcons((prev) => prev.filter((i) => i.filename !== filename));
    } catch {
      // ignore
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
    e.target.value = "";
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center justify-center w-8 h-8 rounded-lg border border-border bg-surface hover:bg-muted transition-colors"
        title="Browse uploaded icons"
      >
        <ImageIcon className="w-4 h-4 text-text-secondary" />
      </button>

      {open && (
        <div className="absolute z-50 top-10 right-0 w-72 bg-surface border border-border rounded-xl shadow-xl p-3 animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-text-primary">Uploaded Icons</span>
            <button type="button" onClick={() => setOpen(false)} className="p-0.5 rounded hover:bg-muted">
              <X className="w-3.5 h-3.5 text-text-muted" />
            </button>
          </div>

          {/* Upload area */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`flex flex-col items-center justify-center gap-1 p-3 mb-2 rounded-lg border-2 border-dashed cursor-pointer transition-colors ${
              dragOver
                ? "border-accent bg-accent/10"
                : "border-border hover:border-text-muted hover:bg-muted/50"
            }`}
          >
            <Upload className={`w-4 h-4 ${uploading ? "animate-pulse" : ""} text-text-muted`} />
            <span className="text-xs text-text-muted">
              {uploading ? "Uploading…" : "Drop image or click to upload"}
            </span>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>

          {error && <p className="text-xs text-red-400 mb-2">{error}</p>}

          {/* Icon grid */}
          {loading ? (
            <p className="text-xs text-text-muted text-center py-4">Loading…</p>
          ) : icons.length === 0 ? (
            <p className="text-xs text-text-muted text-center py-4">No icons uploaded yet</p>
          ) : (
            <div className="grid grid-cols-6 gap-1.5 max-h-48 overflow-y-auto">
              {icons.map((ic) => (
                <div key={ic.filename} className="group relative">
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(`uploaded:${ic.filename}`);
                      setOpen(false);
                    }}
                    className="flex items-center justify-center w-10 h-10 rounded-lg border border-border bg-background hover:border-accent hover:bg-accent/5 transition-colors"
                    title={ic.filename}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={ic.url}
                      alt=""
                      className="w-7 h-7 object-contain rounded-sm"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(ic.filename);
                    }}
                    className="absolute -top-1 -right-1 hidden group-hover:flex items-center justify-center w-4 h-4 rounded-full bg-red-500 text-white"
                    title="Delete icon"
                  >
                    <Trash2 className="w-2.5 h-2.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
