"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { X, Link, ImageIcon, ExternalLink, Upload, Loader2 } from "lucide-react";

interface UrlInputModalProps {
  isOpen: boolean;
  title: string;
  placeholder?: string;
  initialValue?: string;
  initialOpenInNewTab?: boolean;
  confirmLabel?: string;
  icon?: "link" | "image";
  showNewTabOption?: boolean;
  showFileUpload?: boolean;
  onFileUpload?: (file: File) => Promise<string | null>;
  onClose: () => void;
  onConfirm: (url: string, openInNewTab: boolean) => void;
}

export default function UrlInputModal({
  isOpen,
  title,
  placeholder = "https://",
  initialValue = "",
  initialOpenInNewTab = false,
  confirmLabel = "Insert",
  icon = "link",
  showNewTabOption = false,
  showFileUpload = false,
  onFileUpload,
  onClose,
  onConfirm,
}: UrlInputModalProps) {
  const [value, setValue] = useState(initialValue);
  const [openInNewTab, setOpenInNewTab] = useState(initialOpenInNewTab);
  const [tab, setTab] = useState<"url" | "upload">("url");
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setValue(initialValue);
      setOpenInNewTab(initialOpenInNewTab);
      setTab("url");
      setUploading(false);
      setDragOver(false);
      setTimeout(() => inputRef.current?.select(), 50);
    }
  }, [isOpen, initialValue, initialOpenInNewTab]);

  const handleUploadFile = useCallback(async (file: File) => {
    if (!onFileUpload || uploading) return;
    setUploading(true);
    try {
      const url = await onFileUpload(file);
      if (url) {
        onConfirm(url, false);
        onClose();
      }
    } finally {
      setUploading(false);
    }
  }, [onFileUpload, uploading, onConfirm, onClose]);

  if (!isOpen) return null;

  const handleConfirm = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onConfirm(trimmed, openInNewTab);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") { e.preventDefault(); handleConfirm(); }
    if (e.key === "Escape") { e.preventDefault(); onClose(); }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith("image/")) handleUploadFile(file);
  };

  const Icon = icon === "image" ? ImageIcon : Link;
  const canUpload = showFileUpload && onFileUpload;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="flex items-center gap-2">
            <Icon className="w-4 h-4 text-accent" />
            <h2 className="modal-title">{title}</h2>
          </div>
          <button onClick={onClose} className="modal-close">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="modal-body">
          {/* Tab toggle when file upload is available */}
          {canUpload && (
            <div className="flex gap-1 mb-3 p-1 rounded-lg bg-muted">
              <button
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  tab === "url" ? "bg-surface text-text-primary shadow-sm" : "text-text-muted hover:text-text-secondary"
                }`}
                onClick={() => setTab("url")}
              >
                <Link className="w-3.5 h-3.5" />
                URL
              </button>
              <button
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  tab === "upload" ? "bg-surface text-text-primary shadow-sm" : "text-text-muted hover:text-text-secondary"
                }`}
                onClick={() => setTab("upload")}
              >
                <Upload className="w-3.5 h-3.5" />
                Upload
              </button>
            </div>
          )}

          {tab === "url" ? (
            <>
              <input
                ref={inputRef}
                type="url"
                className="modal-input"
                placeholder={placeholder}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={handleKeyDown}
                autoFocus
              />
              {showNewTabOption && (
                <label className="flex items-center gap-2 mt-2 cursor-pointer select-none text-sm text-text-secondary">
                  <input
                    type="checkbox"
                    checked={openInNewTab}
                    onChange={(e) => setOpenInNewTab(e.target.checked)}
                    className="w-4 h-4 accent-accent rounded"
                  />
                  <ExternalLink className="w-3.5 h-3.5 text-text-muted" />
                  Open in new tab
                </label>
              )}
              <div className="modal-actions">
                <button type="button" onClick={onClose} className="modal-btn-cancel">
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirm}
                  className="modal-btn-primary"
                  disabled={!value.trim()}
                >
                  {confirmLabel}
                </button>
              </div>
            </>
          ) : (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleUploadFile(file);
                  e.target.value = "";
                }}
              />
              <div
                className={`flex flex-col items-center justify-center gap-2 p-8 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
                  dragOver
                    ? "border-accent bg-accent/5"
                    : "border-border-light hover:border-accent/50 hover:bg-muted/50"
                }`}
                onClick={() => !uploading && fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
              >
                {uploading ? (
                  <>
                    <Loader2 className="w-6 h-6 text-accent animate-spin" />
                    <span className="text-sm text-text-muted">Uploading…</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-6 h-6 text-text-muted" />
                    <span className="text-sm text-text-secondary font-medium">Click to browse or drag an image here</span>
                    <span className="text-xs text-text-muted">PNG, JPG, GIF, SVG, WebP</span>
                  </>
                )}
              </div>
              <div className="modal-actions">
                <button type="button" onClick={onClose} className="modal-btn-cancel">
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
