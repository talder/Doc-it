"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronRight, ChevronDown, Plus, Trash2 } from "lucide-react";
import type { DocMetadata, CustomPropertyType, CustomProperty } from "@/lib/types";

const PROPERTY_TYPES: { label: string; value: CustomPropertyType }[] = [
  { label: "Text", value: "text" },
  { label: "Number", value: "number" },
  { label: "Checkbox", value: "checkbox" },
  { label: "Date", value: "date" },
];

function formatDate(iso?: string): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      year: "numeric", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

interface DocInfoPanelProps {
  metadata: DocMetadata;
  fileSize: number;
  category: string;
  canWrite: boolean;
  onUpdateMetadata: (meta: DocMetadata) => void;
}

export default function DocInfoPanel({
  metadata,
  fileSize,
  category,
  canWrite,
  onUpdateMetadata,
}: DocInfoPanelProps) {
  const [collapsed, setCollapsed] = useState(true);
  const [showAddProp, setShowAddProp] = useState(false);
  const [newPropName, setNewPropName] = useState("");
  const [newPropType, setNewPropType] = useState<CustomPropertyType>("text");
  const addRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (addRef.current && !addRef.current.contains(e.target as Node)) setShowAddProp(false);
    };
    if (showAddProp) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showAddProp]);

  const customEntries = Object.entries(metadata.custom || {});

  const handleCustomValueChange = (key: string, value: string | number | boolean) => {
    const custom = { ...(metadata.custom || {}) };
    custom[key] = { ...custom[key], value };
    onUpdateMetadata({ ...metadata, custom });
  };

  const handleCustomKeyRename = (oldKey: string, newKey: string) => {
    if (!newKey.trim() || newKey === oldKey) return;
    const custom = { ...(metadata.custom || {}) };
    const entry = custom[oldKey];
    delete custom[oldKey];
    custom[newKey.trim()] = entry;
    onUpdateMetadata({ ...metadata, custom });
  };

  const handleDeleteCustom = (key: string) => {
    const custom = { ...(metadata.custom || {}) };
    delete custom[key];
    // Use {} instead of undefined — JSON.stringify strips undefined values,
    // which would cause the server to fall back to existing (old) custom data.
    onUpdateMetadata({ ...metadata, custom });
  };

  const handleAddProperty = () => {
    if (!newPropName.trim()) return;
    const custom = { ...(metadata.custom || {}) };
    const defaultValue: string | number | boolean =
      newPropType === "number" ? 0 : newPropType === "checkbox" ? false : "";
    custom[newPropName.trim()] = { type: newPropType, value: defaultValue };
    onUpdateMetadata({ ...metadata, custom });
    setNewPropName("");
    setNewPropType("text");
    setShowAddProp(false);
  };

  return (
    <div className={`doc-info-panel${collapsed ? " doc-info-panel--collapsed" : ""}`}>
      <button
        className="doc-info-toggle"
        onClick={() => setCollapsed((v) => !v)}
      >
        {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        <span>Document Info</span>
      </button>

      {!collapsed && (
        <div className="doc-info-body">
          {/* Standard properties — table grid */}
          <div className="doc-info-table">
            <div className="doc-info-table-row">
              <div className="doc-info-cell label">Created</div>
              <div className="doc-info-cell value">{formatDate(metadata.createdAt)}</div>
            </div>
            <div className="doc-info-table-row">
              <div className="doc-info-cell label">Updated</div>
              <div className="doc-info-cell value">{formatDate(metadata.updatedAt)}</div>
            </div>
            <div className="doc-info-table-row">
              <div className="doc-info-cell label">Created by</div>
              <div className="doc-info-cell value">{metadata.createdBy || "—"}</div>
            </div>
            <div className="doc-info-table-row">
              <div className="doc-info-cell label">Last modified by</div>
              <div className="doc-info-cell value">{metadata.updatedBy || "—"}</div>
            </div>
            <div className="doc-info-table-row">
              <div className="doc-info-cell label">Category</div>
              <div className="doc-info-cell value">{category || "—"}</div>
            </div>
            <div className="doc-info-table-row">
              <div className="doc-info-cell label">Size</div>
              <div className="doc-info-cell value">{formatSize(fileSize)}</div>
            </div>
          </div>

          {/* Custom properties — same table style */}
          {customEntries.length > 0 && (
            <>
              <div className="doc-info-section-title">Custom Properties</div>
              <div className="doc-info-custom-table">
                {customEntries.map(([key, prop]) => (
                  <CustomPropertyRow
                    key={key}
                    propKey={key}
                    prop={prop}
                    canWrite={canWrite}
                    onValueChange={(v) => handleCustomValueChange(key, v)}
                    onRename={(newKey) => handleCustomKeyRename(key, newKey)}
                    onDelete={() => handleDeleteCustom(key)}
                  />
                ))}
              </div>
            </>
          )}

          {/* Add property */}
          {canWrite && (
            <div className="doc-info-add-prop-wrapper" ref={addRef}>
              <button
                className="doc-info-add-prop"
                onClick={() => setShowAddProp((v) => !v)}
              >
                <Plus className="w-3.5 h-3.5" />
                Add property
              </button>
              {showAddProp && (
                <div className="doc-info-add-prop-dropdown">
                  <input
                    autoFocus
                    className="doc-info-add-prop-input"
                    placeholder="Property name"
                    value={newPropName}
                    onChange={(e) => setNewPropName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleAddProperty(); if (e.key === "Escape") setShowAddProp(false); }}
                  />
                  <div className="doc-info-add-prop-types">
                    {PROPERTY_TYPES.map((pt) => (
                      <button
                        key={pt.value}
                        className={`doc-info-type-btn${newPropType === pt.value ? " active" : ""}`}
                        onClick={() => setNewPropType(pt.value)}
                      >
                        {pt.label}
                      </button>
                    ))}
                  </div>
                  <button
                    className="doc-info-add-prop-submit"
                    onClick={handleAddProperty}
                    disabled={!newPropName.trim()}
                  >
                    Add
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CustomPropertyRow({
  propKey,
  prop,
  canWrite,
  onValueChange,
  onRename,
  onDelete,
}: {
  propKey: string;
  prop: CustomProperty;
  canWrite: boolean;
  onValueChange: (value: string | number | boolean) => void;
  onRename: (newKey: string) => void;
  onDelete: () => void;
}) {
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(propKey);

  const commitRename = () => {
    setEditingName(false);
    if (nameValue.trim() && nameValue !== propKey) onRename(nameValue);
    else setNameValue(propKey);
  };

  return (
    <div className="doc-info-custom-row">
      <div className="doc-info-custom-cell label">
        {canWrite && editingName ? (
          <input
            autoFocus
            className="doc-info-custom-name-input"
            value={nameValue}
            onChange={(e) => setNameValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") { setNameValue(propKey); setEditingName(false); } }}
          />
        ) : (
          <span
            className={canWrite ? "doc-info-custom-name editable" : "doc-info-custom-name"}
            onClick={() => canWrite && setEditingName(true)}
            title={canWrite ? "Click to rename" : undefined}
          >
            {propKey}
          </span>
        )}
        <span className="doc-info-type-badge">{prop.type}</span>
      </div>
      <div className="doc-info-custom-cell value">
        {prop.type === "checkbox" ? (
          <input
            type="checkbox"
            checked={!!prop.value}
            disabled={!canWrite}
            onChange={(e) => onValueChange(e.target.checked)}
          />
        ) : prop.type === "number" ? (
          <input
            type="number"
            className="doc-info-custom-input"
            value={prop.value as number}
            disabled={!canWrite}
            onChange={(e) => onValueChange(Number(e.target.value))}
            onBlur={(e) => onValueChange(Number(e.target.value))}
          />
        ) : prop.type === "date" ? (
          <input
            type="date"
            className="doc-info-custom-input"
            value={String(prop.value || "")}
            disabled={!canWrite}
            onChange={(e) => onValueChange(e.target.value)}
          />
        ) : (
          <input
            type="text"
            className="doc-info-custom-input"
            value={String(prop.value || "")}
            disabled={!canWrite}
            onChange={(e) => onValueChange(e.target.value)}
            onBlur={(e) => onValueChange(e.target.value)}
          />
        )}
        {canWrite && (
          <button
            className="doc-info-custom-delete"
            onClick={onDelete}
            onMouseDown={(e) => e.preventDefault()}
            title="Delete property"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
