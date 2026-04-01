"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X, ZoomIn, ZoomOut, RotateCcw } from "lucide-react";

interface Props {
  imageFile: File;
  onSave: (croppedBlob: Blob) => void;
  onCancel: () => void;
}

const OUTPUT_SIZE = 256; // px — square avatar output

export default function AvatarEditor({ imageFile, onSave, onCancel }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, ox: 0, oy: 0 });
  const containerSize = 280;

  // Load image
  useEffect(() => {
    const url = URL.createObjectURL(imageFile);
    const image = new Image();
    image.onload = () => {
      setImg(image);
      // Auto-fit: scale so the smaller dimension fills the container
      const scale = containerSize / Math.min(image.width, image.height);
      setZoom(scale);
      setOffset({ x: 0, y: 0 });
    };
    image.src = url;
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  // Draw preview
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !img) return;

    canvas.width = containerSize;
    canvas.height = containerSize;
    ctx.clearRect(0, 0, containerSize, containerSize);

    // Background
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(0, 0, containerSize, containerSize);

    // Draw image centered with zoom and offset
    const w = img.width * zoom;
    const h = img.height * zoom;
    const x = (containerSize - w) / 2 + offset.x;
    const y = (containerSize - h) / 2 + offset.y;
    ctx.drawImage(img, x, y, w, h);

    // Circular mask overlay
    ctx.save();
    ctx.globalCompositeOperation = "destination-in";
    ctx.beginPath();
    ctx.arc(containerSize / 2, containerSize / 2, containerSize / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }, [img, zoom, offset]);

  useEffect(() => { draw(); }, [draw]);

  // Mouse drag
  const handleMouseDown = (e: React.MouseEvent) => {
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragging) return;
    setOffset({
      x: dragStart.current.ox + (e.clientX - dragStart.current.x),
      y: dragStart.current.oy + (e.clientY - dragStart.current.y),
    });
  };
  const handleMouseUp = () => setDragging(false);

  // Touch drag
  const handleTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    dragStart.current = { x: t.clientX, y: t.clientY, ox: offset.x, oy: offset.y };
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    const t = e.touches[0];
    setOffset({
      x: dragStart.current.ox + (t.clientX - dragStart.current.x),
      y: dragStart.current.oy + (t.clientY - dragStart.current.y),
    });
  };

  // Export cropped image
  const handleSave = () => {
    if (!img) return;
    const output = document.createElement("canvas");
    output.width = OUTPUT_SIZE;
    output.height = OUTPUT_SIZE;
    const ctx = output.getContext("2d")!;

    // Scale from preview coords to output coords
    const scale = OUTPUT_SIZE / containerSize;
    const w = img.width * zoom * scale;
    const h = img.height * zoom * scale;
    const x = (OUTPUT_SIZE - w) / 2 + offset.x * scale;
    const y = (OUTPUT_SIZE - h) / 2 + offset.y * scale;

    // Circular clip
    ctx.beginPath();
    ctx.arc(OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, 0, Math.PI * 2);
    ctx.clip();

    ctx.drawImage(img, x, y, w, h);

    output.toBlob((blob) => {
      if (blob) onSave(blob);
    }, "image/png");
  };

  const handleReset = () => {
    if (!img) return;
    const scale = containerSize / Math.min(img.width, img.height);
    setZoom(scale);
    setOffset({ x: 0, y: 0 });
  };

  return (
    <div className="cl-modal-overlay" onClick={onCancel}>
      <div className="cl-modal" style={{ maxWidth: 360 }} onClick={(e) => e.stopPropagation()}>
        <div className="cl-modal-header">
          <h2 className="cl-modal-title">Adjust Avatar</h2>
          <button onClick={onCancel} className="cl-modal-close"><X className="w-4 h-4" /></button>
        </div>
        <div className="cl-modal-body flex flex-col items-center gap-4">
          {/* Preview */}
          <div
            className="relative rounded-full overflow-hidden border-2 border-border"
            style={{ width: containerSize, height: containerSize, cursor: dragging ? "grabbing" : "grab" }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
          >
            <canvas ref={canvasRef} style={{ width: containerSize, height: containerSize }} />
          </div>

          <p className="text-xs text-text-muted">Drag to reposition · Scroll or use slider to zoom</p>

          {/* Zoom control */}
          <div className="flex items-center gap-3 w-full px-4">
            <button className="text-text-muted hover:text-text-primary" onClick={() => setZoom((z) => Math.max(0.1, z * 0.85))}><ZoomOut className="w-4 h-4" /></button>
            <input
              type="range"
              min="0.1"
              max={img ? (containerSize / Math.min(img.width, img.height)) * 4 : 3}
              step="0.01"
              value={zoom}
              onChange={(e) => setZoom(parseFloat(e.target.value))}
              className="flex-1 accent-accent"
            />
            <button className="text-text-muted hover:text-text-primary" onClick={() => setZoom((z) => z * 1.15)}><ZoomIn className="w-4 h-4" /></button>
            <button className="text-text-muted hover:text-text-primary" onClick={handleReset} title="Reset"><RotateCcw className="w-4 h-4" /></button>
          </div>

          {/* Buttons */}
          <div className="flex gap-2 w-full px-4">
            <button className="cl-btn cl-btn--secondary flex-1" onClick={onCancel}>Cancel</button>
            <button className="cl-btn cl-btn--primary flex-1" onClick={handleSave}>Save Avatar</button>
          </div>
        </div>
      </div>
    </div>
  );
}
