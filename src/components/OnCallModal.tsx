"use client";

import { useEffect, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import { X, AlertTriangle, Bold, Italic, UnderlineIcon, List, ListOrdered, Link2, ChevronDown, Check } from "lucide-react";

// ── Minimal rich-text toolbar + editor ───────────────────────────────────────

interface MiniEditorProps {
  initialContent?: string;
  placeholder?: string;
  onChange: (html: string) => void;
}

export function MiniEditor({ initialContent = "", placeholder, onChange }: MiniEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: false, code: false }),
      Underline,
      Link.configure({ openOnClick: false }),
    ],
    content: initialContent,
    onUpdate({ editor }) { onChange(editor.getHTML()); },
    editorProps: { attributes: { class: "oc-mini-editor-content" } },
    immediatelyRender: false,
  });

  if (!editor) return null;

  const setLink = () => {
    const url = window.prompt("URL:");
    if (url) editor.chain().focus().setLink({ href: url }).run();
  };

  return (
    <div className="oc-mini-editor">
      <div className="oc-mini-toolbar">
        <button type="button" onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleBold().run(); }} className={`oc-mini-btn${editor.isActive("bold") ? " oc-mini-btn--active" : ""}`} title="Bold"><Bold className="w-3.5 h-3.5" /></button>
        <button type="button" onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleItalic().run(); }} className={`oc-mini-btn${editor.isActive("italic") ? " oc-mini-btn--active" : ""}`} title="Italic"><Italic className="w-3.5 h-3.5" /></button>
        <button type="button" onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleUnderline().run(); }} className={`oc-mini-btn${editor.isActive("underline") ? " oc-mini-btn--active" : ""}`} title="Underline"><UnderlineIcon className="w-3.5 h-3.5" /></button>
        <span className="oc-mini-sep" />
        <button type="button" onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleBulletList().run(); }} className={`oc-mini-btn${editor.isActive("bulletList") ? " oc-mini-btn--active" : ""}`} title="Bullet list"><List className="w-3.5 h-3.5" /></button>
        <button type="button" onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleOrderedList().run(); }} className={`oc-mini-btn${editor.isActive("orderedList") ? " oc-mini-btn--active" : ""}`} title="Numbered list"><ListOrdered className="w-3.5 h-3.5" /></button>
        <span className="oc-mini-sep" />
        <button type="button" onMouseDown={(e) => { e.preventDefault(); setLink(); }} className={`oc-mini-btn${editor.isActive("link") ? " oc-mini-btn--active" : ""}`} title="Link"><Link2 className="w-3.5 h-3.5" /></button>
      </div>
      <div className="relative">
        <EditorContent editor={editor} />
        {editor.isEmpty && placeholder && <p className="oc-mini-placeholder">{placeholder}</p>}
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function today() { return new Date().toISOString().slice(0, 10); }
function nowTime() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function stripHtml(html: string) { return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(); }

// ── Modal ─────────────────────────────────────────────────────────────────────

export interface OnCallFormData {
  date: string;
  time: string;
  description: string;
  workingTime: string;
  assistedBy: string[];
  solution: string;
}

interface OnCallModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: OnCallFormData) => Promise<void>;
  currentUser: string;
}

export default function OnCallModal({ isOpen, onClose, onSave, currentUser }: OnCallModalProps) {
  const [formStep, setFormStep] = useState<"form" | "confirm">("form");
  const [date, setDate] = useState(today());
  const [time, setTime] = useState(nowTime());
  const [description, setDescription] = useState("");
  const [solution, setSolution] = useState("");
  const [workingTime, setWorkingTime] = useState("");
  const [assistedBy, setAssistedBy] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [wtError, setWtError] = useState("");

  // User list for the assisted-by picker
  const [allUsers, setAllUsers] = useState<{ username: string; fullName: string | null }[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerFilter, setPickerFilter] = useState("");

  useEffect(() => {
    if (isOpen) {
      setFormStep("form");
      setDate(today());
      setTime(nowTime());
      setDescription("");
      setSolution("");
      setWorkingTime("");
      setAssistedBy([]);
      setSaving(false);
      setWtError("");
      setPickerOpen(false);
      setPickerFilter("");
      // Fetch user list
      fetch("/api/oncall/users")
        .then((r) => r.ok ? r.json() : { users: [] })
        .then((d) => setAllUsers(d.users ?? []))
        .catch(() => {});
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleReview = () => {
    if (!stripHtml(description).length) return;
    const s = workingTime.trim().toLowerCase();
    const valid = (/^(?:(\d+)h)?(?:(\d+)m)?$/.test(s) && s.length > 0) || (/^\d+$/.test(s) && parseInt(s) > 0);
    if (!valid) { setWtError("Enter a duration like 1h30m, 45m, or 2h"); return; }
    setWtError("");
    setFormStep("confirm");
  };

  const handleConfirm = async () => {
    setSaving(true);
    await onSave({ date, time, description, workingTime, assistedBy, solution });
    setSaving(false);
    onClose();
  };

  const toggleAssisted = (username: string) => {
    setAssistedBy((prev) =>
      prev.includes(username) ? prev.filter((u) => u !== username) : [...prev, username],
    );
  };

  const displayName = (u: { username: string; fullName: string | null }) =>
    u.fullName ? `${u.fullName} (${u.username})` : u.username;

  const selectableUsers = allUsers
    .filter((u) => u.username !== currentUser)
    .filter((u) => {
      if (!pickerFilter) return true;
      const q = pickerFilter.toLowerCase();
      return u.username.toLowerCase().includes(q) || (u.fullName ?? "").toLowerCase().includes(q);
    });

  const isValid = date && time && workingTime.trim() && stripHtml(description).length > 0;

  return (
    <div className="cl-modal-overlay" onClick={onClose}>
      <div className="cl-modal" style={{ maxWidth: 680 }} onClick={(e) => e.stopPropagation()}>
        <div className="cl-modal-header">
          <h2 className="cl-modal-title">{formStep === "confirm" ? "Confirm On-Call Entry" : "Log On-Call Report"}</h2>
          <button onClick={onClose} className="cl-modal-close"><X className="w-4 h-4" /></button>
        </div>

        {formStep === "form" ? (
          <div className="cl-modal-body">
            <div className="cl-form-grid">
              <div className="cl-field">
                <label className="cl-label">Registrar</label>
                <input className="cl-input" value={currentUser} readOnly tabIndex={-1} style={{ opacity: 0.6, cursor: "default" }} />
              </div>
              <div className="cl-field">
                <label className="cl-label">Date *</label>
                <input type="date" className="cl-input" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="cl-field">
                <label className="cl-label">Time *</label>
                <input type="time" className="cl-input" value={time} onChange={(e) => setTime(e.target.value)} />
              </div>
              <div className="cl-field">
                <label className="cl-label">Working time * <span style={{ fontWeight: 400, textTransform: "none", fontSize: "0.6rem", letterSpacing: 0 }}>(1h30m, 45m, 2h)</span></label>
                <input type="text" className={`cl-input${wtError ? " oc-input-error" : ""}`} placeholder="1h30m" value={workingTime} onChange={(e) => { setWorkingTime(e.target.value); setWtError(""); }} />
                {wtError && <span className="oc-field-error">{wtError}</span>}
              </div>
              <div className="cl-field cl-field--full">
                <label className="cl-label">Assisted by</label>
                <div className="oc-assisted-picker">
                  {assistedBy.length > 0 && (
                    <div className="oc-assisted-chips">
                      {assistedBy.map((uname) => {
                        const u = allUsers.find((x) => x.username === uname);
                        return (
                          <span key={uname} className="oc-assisted-chip">
                            {u?.fullName || uname}
                            <button type="button" onClick={() => toggleAssisted(uname)} className="oc-assisted-chip-x"><X className="w-3 h-3" /></button>
                          </span>
                        );
                      })}
                    </div>
                  )}
                  <div className="oc-assisted-dropdown-wrap">
                    <button type="button" className="cl-input oc-assisted-trigger" onClick={() => setPickerOpen((v) => !v)}>
                      <span className="text-text-muted text-xs">Select persons…</span>
                      <ChevronDown className="w-3.5 h-3.5 text-text-muted" />
                    </button>
                    {pickerOpen && (
                      <div className="oc-assisted-dropdown">
                        <input
                          type="text"
                          className="oc-assisted-search"
                          placeholder="Filter…"
                          value={pickerFilter}
                          onChange={(e) => setPickerFilter(e.target.value)}
                          autoFocus
                        />
                        <div className="oc-assisted-options">
                          {selectableUsers.length === 0 && (
                            <div className="oc-assisted-empty">No users found</div>
                          )}
                          {selectableUsers.map((u) => (
                            <button
                              key={u.username}
                              type="button"
                              className={`oc-assisted-option${assistedBy.includes(u.username) ? " oc-assisted-option--selected" : ""}`}
                              onClick={() => toggleAssisted(u.username)}
                            >
                              <span>{displayName(u)}</span>
                              {assistedBy.includes(u.username) && <Check className="w-3.5 h-3.5 text-accent" />}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="cl-field cl-field--full">
                <label className="cl-label">Problem description *</label>
                <MiniEditor placeholder="Describe the problem…" onChange={setDescription} />
              </div>
              <div className="cl-field cl-field--full">
                <label className="cl-label">Solution <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(optional — can be updated after submission)</span></label>
                <MiniEditor placeholder="Describe the solution or paste a link…" onChange={setSolution} />
              </div>
            </div>
            <div className="cl-modal-footer">
              <button className="cl-btn cl-btn--secondary" onClick={onClose}>Cancel</button>
              <button className="cl-btn cl-btn--primary" disabled={!isValid} onClick={handleReview}>Review & Submit</button>
            </div>
          </div>
        ) : (
          <div className="cl-modal-body">
            <div className="cl-confirm-warning">
              <AlertTriangle className="w-4 h-4" />
              <span>This entry is <strong>immutable</strong> once submitted — it cannot be edited or deleted. Only the <strong>solution</strong> field may be updated afterwards.</span>
            </div>
            <div className="cl-confirm-grid">
              <div className="cl-confirm-row"><span className="cl-confirm-label">Registrar</span><span>{currentUser}</span></div>
              <div className="cl-confirm-row"><span className="cl-confirm-label">Date</span><span>{date}</span></div>
              <div className="cl-confirm-row"><span className="cl-confirm-label">Time</span><span>{time}</span></div>
              <div className="cl-confirm-row"><span className="cl-confirm-label">Working time</span><span>{workingTime}</span></div>
              {assistedBy.length > 0 && (
                <div className="cl-confirm-row">
                  <span className="cl-confirm-label">Assisted by</span>
                  <span>{assistedBy.map((uname) => { const u = allUsers.find((x) => x.username === uname); return u?.fullName || uname; }).join(", ")}</span>
                </div>
              )}
              <div className="cl-confirm-row cl-confirm-row--block">
                <span className="cl-confirm-label">Problem</span>
                <div dangerouslySetInnerHTML={{ __html: description }} className="oc-confirm-html" />
              </div>
              {stripHtml(solution).length > 0 && (
                <div className="cl-confirm-row cl-confirm-row--block">
                  <span className="cl-confirm-label">Solution</span>
                  <div dangerouslySetInnerHTML={{ __html: solution }} className="oc-confirm-html" />
                </div>
              )}
            </div>
            <div className="cl-modal-footer">
              <button className="cl-btn cl-btn--secondary" onClick={() => setFormStep("form")}>← Back to edit</button>
              <button className="cl-btn cl-btn--primary" disabled={saving} onClick={handleConfirm}>{saving ? "Saving…" : "Confirm & Submit"}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
