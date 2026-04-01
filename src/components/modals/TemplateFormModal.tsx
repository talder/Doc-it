"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { X, Folder, ChevronDown, LayoutTemplate } from "lucide-react";
import type { Category, TemplateInfo, TplField, TplFieldDateFormat } from "@/lib/types";
import { fromSafeB64 } from "@/lib/base64";

interface TemplateFormModalProps {
  isOpen: boolean;
  template: TemplateInfo | null;
  categories: Category[];
  defaultCategory?: string;
  onClose: () => void;
  onCreate: (name: string, category: string, content: string) => void;
  spaceMembers?: { username: string; fullName?: string }[];
}

// ── Validation helpers ──────────────────────────────────────────────────────

// ── Phone field ──────────────────────────────────────────────────────

const COUNTRY_DIAL_CODES: { code: string; name: string; dial: string }[] = [
  { code: "AF", name: "Afghanistan",           dial: "+93"  },
  { code: "AL", name: "Albania",               dial: "+355" },
  { code: "DZ", name: "Algeria",               dial: "+213" },
  { code: "AR", name: "Argentina",             dial: "+54"  },
  { code: "AU", name: "Australia",             dial: "+61"  },
  { code: "AT", name: "Austria",               dial: "+43"  },
  { code: "BH", name: "Bahrain",               dial: "+973" },
  { code: "BE", name: "Belgium",               dial: "+32"  },
  { code: "BR", name: "Brazil",                dial: "+55"  },
  { code: "BG", name: "Bulgaria",              dial: "+359" },
  { code: "CA", name: "Canada",                dial: "+1"   },
  { code: "CL", name: "Chile",                 dial: "+56"  },
  { code: "CN", name: "China",                 dial: "+86"  },
  { code: "CO", name: "Colombia",              dial: "+57"  },
  { code: "HR", name: "Croatia",               dial: "+385" },
  { code: "CY", name: "Cyprus",                dial: "+357" },
  { code: "CZ", name: "Czech Republic",        dial: "+420" },
  { code: "DK", name: "Denmark",               dial: "+45"  },
  { code: "EG", name: "Egypt",                 dial: "+20"  },
  { code: "EE", name: "Estonia",               dial: "+372" },
  { code: "FI", name: "Finland",               dial: "+358" },
  { code: "FR", name: "France",                dial: "+33"  },
  { code: "DE", name: "Germany",               dial: "+49"  },
  { code: "GR", name: "Greece",                dial: "+30"  },
  { code: "HK", name: "Hong Kong",             dial: "+852" },
  { code: "HU", name: "Hungary",               dial: "+36"  },
  { code: "IN", name: "India",                 dial: "+91"  },
  { code: "ID", name: "Indonesia",             dial: "+62"  },
  { code: "IE", name: "Ireland",               dial: "+353" },
  { code: "IL", name: "Israel",                dial: "+972" },
  { code: "IT", name: "Italy",                 dial: "+39"  },
  { code: "JP", name: "Japan",                 dial: "+81"  },
  { code: "JO", name: "Jordan",                dial: "+962" },
  { code: "KZ", name: "Kazakhstan",            dial: "+7"   },
  { code: "KE", name: "Kenya",                 dial: "+254" },
  { code: "KW", name: "Kuwait",                dial: "+965" },
  { code: "LV", name: "Latvia",                dial: "+371" },
  { code: "LB", name: "Lebanon",               dial: "+961" },
  { code: "LT", name: "Lithuania",             dial: "+370" },
  { code: "LU", name: "Luxembourg",            dial: "+352" },
  { code: "MY", name: "Malaysia",              dial: "+60"  },
  { code: "MT", name: "Malta",                 dial: "+356" },
  { code: "MX", name: "Mexico",                dial: "+52"  },
  { code: "MA", name: "Morocco",               dial: "+212" },
  { code: "NL", name: "Netherlands",           dial: "+31"  },
  { code: "NZ", name: "New Zealand",           dial: "+64"  },
  { code: "NG", name: "Nigeria",               dial: "+234" },
  { code: "NO", name: "Norway",                dial: "+47"  },
  { code: "OM", name: "Oman",                  dial: "+968" },
  { code: "PK", name: "Pakistan",              dial: "+92"  },
  { code: "PH", name: "Philippines",           dial: "+63"  },
  { code: "PL", name: "Poland",                dial: "+48"  },
  { code: "PT", name: "Portugal",              dial: "+351" },
  { code: "QA", name: "Qatar",                 dial: "+974" },
  { code: "RO", name: "Romania",               dial: "+40"  },
  { code: "RU", name: "Russia",                dial: "+7"   },
  { code: "SA", name: "Saudi Arabia",          dial: "+966" },
  { code: "SG", name: "Singapore",             dial: "+65"  },
  { code: "SK", name: "Slovakia",              dial: "+421" },
  { code: "SI", name: "Slovenia",              dial: "+386" },
  { code: "ZA", name: "South Africa",          dial: "+27"  },
  { code: "KR", name: "South Korea",           dial: "+82"  },
  { code: "ES", name: "Spain",                 dial: "+34"  },
  { code: "SE", name: "Sweden",                dial: "+46"  },
  { code: "CH", name: "Switzerland",           dial: "+41"  },
  { code: "TW", name: "Taiwan",                dial: "+886" },
  { code: "TH", name: "Thailand",              dial: "+66"  },
  { code: "TN", name: "Tunisia",               dial: "+216" },
  { code: "TR", name: "Turkey",                dial: "+90"  },
  { code: "UA", name: "Ukraine",               dial: "+380" },
  { code: "AE", name: "United Arab Emirates",  dial: "+971" },
  { code: "GB", name: "United Kingdom",        dial: "+44"  },
  { code: "US", name: "United States",         dial: "+1"   },
  { code: "VN", name: "Vietnam",               dial: "+84"  },
];

/** Convert ISO 3166-1 alpha-2 code to flag emoji. */
function countryFlag(iso: string): string {
  return [...iso.toUpperCase()].map(
    (c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65)
  ).join("");
}

/** Parse a stored phone value (e.g. "+31 06 123 456") into dial code + local part. */
function parsePhoneValue(v: string): { dial: string; local: string } {
  const m = v.trim().match(/^(\+\d{1,4})(?:\s+(.*))?$/);
  if (m) return { dial: m[1], local: m[2] ?? "" };
  return { dial: "+1", local: v };
}

function PhoneField({
  value,
  onChange,
  required,
}: {
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  const parsed     = parsePhoneValue(value);
  const initCode   = COUNTRY_DIAL_CODES.find((c) => c.dial === parsed.dial)?.code ?? "US";
  const [countryCode, setCountryCode] = useState(initCode);
  const [local,       setLocal]       = useState(parsed.local);

  // Sync when parent resets the value (e.g. modal opens)
  useEffect(() => {
    const p    = parsePhoneValue(value);
    const code = COUNTRY_DIAL_CODES.find((c) => c.dial === p.dial)?.code ?? "US";
    setCountryCode(code);
    setLocal(p.local);
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const emit = (code: string, loc: string) => {
    const dial = COUNTRY_DIAL_CODES.find((c) => c.code === code)?.dial ?? "+1";
    onChange(loc.trim() ? `${dial} ${loc}` : "");
  };

  const selectedDial = COUNTRY_DIAL_CODES.find((c) => c.code === countryCode)?.dial ?? "+1";

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-2">
        {/* Country selector */}
        <select
          value={countryCode}
          onChange={(e) => {
            setCountryCode(e.target.value);
            emit(e.target.value, local);
          }}
          className="modal-input"
          style={{ flexShrink: 0, width: "200px" }}
          title="Select country"
        >
          {COUNTRY_DIAL_CODES.map((c) => (
            <option key={c.code} value={c.code}>
              {countryFlag(c.code)} {c.name} ({c.dial})
            </option>
          ))}
        </select>
        {/* Number input */}
        <div className="flex items-center flex-1 relative">
          <span className="absolute left-3 text-sm font-mono text-text-muted select-none pointer-events-none">
            {selectedDial}
          </span>
          <input
            type="tel"
            value={local}
            onChange={(e) => {
              const filtered = e.target.value.replace(/[^\d\s\-().+]/g, "");
              setLocal(filtered);
              emit(countryCode, filtered);
            }}
            placeholder="Phone number…"
            className="modal-input w-full"
            style={{ paddingLeft: `${selectedDial.length * 9 + 14}px` }}
            required={required && !local.trim()}
            inputMode="tel"
          />
        </div>
      </div>
      <p className="tpl-field-hint">e.g. {selectedDial} 15 12 34 56 or {selectedDial} (555) 123-4567</p>
    </div>
  );
}

// ── Mini Markdown Editor

function MiniMarkdownEditor({
  value,
  onChange,
  placeholder,
  required,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  /** Wrap selected text (or insert placeholder word) with before/after markers. */
  const wrap = useCallback((before: string, after: string = before) => {
    const ta = ref.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = value.slice(start, end);
    const word = selected || "text";
    const newVal = value.slice(0, start) + before + word + after + value.slice(end);
    onChange(newVal);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(start + before.length, start + before.length + word.length);
    });
  }, [value, onChange]);

  /** Prepend prefix to the line(s) under the selection. */
  const linePrefix = useCallback((prefix: string) => {
    const ta = ref.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end   = ta.selectionEnd;
    const lines  = value.split("\n");
    let charCount = 0;
    let firstLine = -1;
    let lastLine  = -1;
    for (let i = 0; i < lines.length; i++) {
      const lineEnd = charCount + lines[i].length;
      if (charCount <= start && start <= lineEnd + 1) firstLine = i;
      if (charCount <= end   && end   <= lineEnd + 1) lastLine  = i;
      charCount += lines[i].length + 1;
    }
    if (firstLine < 0) { firstLine = 0; lastLine = 0; }
    const newLines = lines.map((l, i) =>
      i >= firstLine && i <= lastLine ? prefix + l : l
    );
    onChange(newLines.join("\n"));
    requestAnimationFrame(() => { ta.focus(); });
  }, [value, onChange]);

  /** Insert a standalone block at cursor position. */
  const insertBlock = useCallback((block: string) => {
    const ta = ref.current;
    if (!ta) return;
    const pos   = ta.selectionStart;
    const before = value.slice(0, pos);
    const after  = value.slice(pos);
    const sep    = before.length > 0 && !before.endsWith("\n") ? "\n" : "";
    onChange(before + sep + block + "\n" + after);
    requestAnimationFrame(() => { ta.focus(); });
  }, [value, onChange]);

  return (
    <div className="mini-md-editor">
      <div className="mini-md-toolbar">
        <button type="button" onMouseDown={(e) => { e.preventDefault(); wrap("**"); }}     title="Bold"><b>B</b></button>
        <button type="button" onMouseDown={(e) => { e.preventDefault(); wrap("*"); }}      title="Italic"><i>I</i></button>
        <button type="button" onMouseDown={(e) => { e.preventDefault(); wrap("~~"); }}     title="Strikethrough"><s>S</s></button>
        <button type="button" onMouseDown={(e) => { e.preventDefault(); wrap("`"); }}      title="Inline code" style={{ fontFamily: "monospace" }}>&lt;/&gt;</button>
        <span className="mini-md-sep" />
        <button type="button" onMouseDown={(e) => { e.preventDefault(); linePrefix("# "); }}   title="Heading 1">H1</button>
        <button type="button" onMouseDown={(e) => { e.preventDefault(); linePrefix("## "); }}  title="Heading 2">H2</button>
        <button type="button" onMouseDown={(e) => { e.preventDefault(); linePrefix("### "); }} title="Heading 3">H3</button>
        <span className="mini-md-sep" />
        <button type="button" onMouseDown={(e) => { e.preventDefault(); linePrefix("- "); }}   title="Bullet list">• List</button>
        <button type="button" onMouseDown={(e) => { e.preventDefault(); linePrefix("1. "); }}  title="Numbered list">1. List</button>
        <span className="mini-md-sep" />
        <button type="button" onMouseDown={(e) => { e.preventDefault(); linePrefix("> "); }}   title="Blockquote">&ldquo; Quote</button>
        <button type="button" onMouseDown={(e) => { e.preventDefault(); insertBlock("---"); }} title="Horizontal rule">— HR</button>
      </div>
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || "Write markdown…"}
        className="modal-input mini-md-textarea"
        rows={5}
        required={required}
        spellCheck={false}
      />
      <p className="tpl-field-hint" style={{ padding: "4px 10px 6px" }}>
        Supports **bold**, *italic*, # headings, - lists, &gt; blockquotes, `code`
      </p>
    </div>
  );
}

// ── Currencies ────────────────────────────────────────────────────────────────

const CURRENCIES: { code: string; symbol: string; name: string }[] = [
  { code: "EUR", symbol: "€",     name: "Euro" },
  { code: "USD", symbol: "$",     name: "US Dollar" },
  { code: "GBP", symbol: "£",     name: "British Pound" },
  { code: "CHF", symbol: "CHF",   name: "Swiss Franc" },
  { code: "JPY", symbol: "¥",     name: "Japanese Yen" },
  { code: "CAD", symbol: "CA$",   name: "Canadian Dollar" },
  { code: "AUD", symbol: "A$",    name: "Australian Dollar" },
  { code: "CNY", symbol: "¥",     name: "Chinese Yuan" },
  { code: "SEK", symbol: "kr",    name: "Swedish Krona" },
  { code: "NOK", symbol: "kr",    name: "Norwegian Krone" },
  { code: "DKK", symbol: "kr",    name: "Danish Krone" },
  { code: "PLN", symbol: "zł",    name: "Polish Zloty" },
  { code: "CZK", symbol: "Kč",    name: "Czech Koruna" },
  { code: "HUF", symbol: "Ft",    name: "Hungarian Forint" },
  { code: "RON", symbol: "lei",   name: "Romanian Leu" },
  { code: "BGN", symbol: "лв",    name: "Bulgarian Lev" },
  { code: "TRY", symbol: "₺",     name: "Turkish Lira" },
  { code: "INR", symbol: "₹",     name: "Indian Rupee" },
  { code: "BRL", symbol: "R$",    name: "Brazilian Real" },
  { code: "MXN", symbol: "$",     name: "Mexican Peso" },
  { code: "ZAR", symbol: "R",     name: "South African Rand" },
  { code: "SGD", symbol: "S$",    name: "Singapore Dollar" },
  { code: "HKD", symbol: "HK$",   name: "Hong Kong Dollar" },
  { code: "NZD", symbol: "NZ$",   name: "New Zealand Dollar" },
  { code: "KWD", symbol: "KD",    name: "Kuwaiti Dinar" },
  { code: "AED", symbol: "د.إ",   name: "UAE Dirham" },
  { code: "SAR", symbol: "﷼",     name: "Saudi Riyal" },
  { code: "ILS", symbol: "₪",     name: "Israeli Shekel" },
  { code: "KRW", symbol: "₩",     name: "South Korean Won" },
];

// ── Validation helpers (IBAN, VAT BE) ─────────────────────────────────────────

function isValidIBAN(iban: string): boolean {
  const s = iban.replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(s) || s.length < 5 || s.length > 34) return false;
  const rearranged = s.slice(4) + s.slice(0, 4);
  const numeric = rearranged.split("").map((c) => {
    const code = c.charCodeAt(0);
    return code >= 65 ? String(code - 55) : c;
  }).join("");
  let remainder = 0;
  for (const ch of numeric) {
    remainder = (remainder * 10 + parseInt(ch, 10)) % 97;
  }
  return remainder === 1;
}

function isValidVATBE(vat: string): boolean {
  const s = vat.replace(/[\s.]/g, "").toUpperCase();
  if (!/^BE[01]\d{9}$/.test(s)) return false;
  const digits = s.slice(2); // 10 digits
  const base = parseInt(digits.slice(0, 8), 10);
  const check = parseInt(digits.slice(8), 10);
  const expected = 97 - (base % 97);
  return check === expected;
}

function formatIBANInput(raw: string): string {
  const s = raw.replace(/\s+/g, "").toUpperCase();
  return s.replace(/(.{4})(?=.)/g, "$1 ");
}

// ── CurrencyField ──────────────────────────────────────────────────────────────

function CurrencyField({
  value, onChange, required,
}: { value: string; onChange: (v: string) => void; required?: boolean }) {
  const parsed = (() => { try { return JSON.parse(value || "{}"); } catch { return {}; } })();
  const [currency, setCurrency] = useState<string>(parsed.currency ?? "EUR");
  const [amount,   setAmount]   = useState<string>(parsed.amount   ?? "");

  useEffect(() => {
    const p = (() => { try { return JSON.parse(value || "{}"); } catch { return {}; } })();
    if (p.currency) setCurrency(p.currency);
    if (p.amount !== undefined) setAmount(p.amount);
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const emit = (cur: string, amt: string) =>
    onChange(JSON.stringify({ currency: cur, amount: amt }));

  const sym = CURRENCIES.find((c) => c.code === currency)?.symbol ?? currency;

  return (
    <div className="flex gap-2">
      <select
        value={currency}
        onChange={(e) => { setCurrency(e.target.value); emit(e.target.value, amount); }}
        className="modal-input"
        style={{ flexShrink: 0, width: 190 }}
      >
        {CURRENCIES.map((c) => (
          <option key={c.code} value={c.code}>{c.symbol} {c.code} — {c.name}</option>
        ))}
      </select>
      <div className="flex items-center flex-1 relative">
        <span className="absolute left-3 text-sm font-mono text-text-muted select-none pointer-events-none">{sym}</span>
        <input
          type="text"
          inputMode="decimal"
          value={amount}
          onChange={(e) => {
            const v = e.target.value.replace(/[^0-9.,]/g, "");
            setAmount(v);
            emit(currency, v);
          }}
          placeholder="0.00"
          className="modal-input w-full"
          style={{ paddingLeft: `${sym.length * 9 + 14}px` }}
          required={required && !amount.trim()}
        />
      </div>
    </div>
  );
}

// ── RatingField ────────────────────────────────────────────────────────────────

function RatingField({
  value, onChange,
}: { value: string; onChange: (v: string) => void }) {
  const [hovered, setHovered] = useState(0);
  const current = parseInt(value) || 0;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((i) => (
          <button
            key={i}
            type="button"
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(0)}
            onClick={() => onChange(i === current ? "" : String(i))}
            className="text-2xl leading-none transition-colors px-0.5"
            style={{ color: (hovered ? i <= hovered : i <= current) ? "#f59e0b" : "var(--color-border)" }}
            title={`${i} star${i > 1 ? "s" : ""}`}
          >
            ★
          </button>
        ))}
        {current > 0 && (
          <span className="text-xs text-text-muted ml-2">{current}/5</span>
        )}
      </div>
      <p className="tpl-field-hint">Click a star to rate; click again to clear</p>
    </div>
  );
}

// ── DurationField ──────────────────────────────────────────────────────────────

function DurationField({
  value, onChange,
}: { value: string; onChange: (v: string) => void }) {
  const parsed = (() => { try { return JSON.parse(value || "{}"); } catch { return {}; } })();
  const [h, setH] = useState<string>(parsed.h ?? "");
  const [m, setM] = useState<string>(parsed.m ?? "");
  const [s, setS] = useState<string>(parsed.s ?? "");

  useEffect(() => {
    const p = (() => { try { return JSON.parse(value || "{}"); } catch { return {}; } })();
    setH(p.h ?? ""); setM(p.m ?? ""); setS(p.s ?? "");
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const emit = (hh: string, mm: string, ss: string) =>
    onChange(JSON.stringify({ h: hh, m: mm, s: ss }));

  const numericOnly = (v: string) => v.replace(/\D/g, "");
  const bounded     = (v: string) => (!v || parseInt(v, 10) < 60 ? v : v.slice(0, -1));

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-3">
        {([
          { label: "h",   val: h, set: (v: string) => { setH(v); emit(v, m, s); }, bound: false },
          { label: "min", val: m, set: (v: string) => { const b = bounded(v); setM(b); emit(h, b, s); }, bound: true },
          { label: "sec", val: s, set: (v: string) => { const b = bounded(v); setS(b); emit(h, m, b); }, bound: true },
        ] as const).map(({ label, val, set }) => (
          <div key={label} className="flex items-center gap-1">
            <input
              type="text"
              inputMode="numeric"
              value={val}
              onChange={(e) => set(numericOnly(e.target.value))}
              placeholder="0"
              className="modal-input text-center"
              style={{ width: 60 }}
            />
            <span className="text-sm text-text-muted">{label}</span>
          </div>
        ))}
      </div>
      <p className="tpl-field-hint">e.g. 2h 30min 15sec</p>
    </div>
  );
}

// ── AddressField ───────────────────────────────────────────────────────────────

function AddressField({
  value, onChange,
}: { value: string; onChange: (v: string) => void }) {
  const parsed = (() => { try { return JSON.parse(value || "{}"); } catch { return {}; } })();
  const [street,  setStreet]  = useState<string>(parsed.street  ?? "");
  const [city,    setCity]    = useState<string>(parsed.city    ?? "");
  const [zip,     setZip]     = useState<string>(parsed.zip     ?? "");
  const [country, setCountry] = useState<string>(parsed.country ?? "");

  useEffect(() => {
    const p = (() => { try { return JSON.parse(value || "{}"); } catch { return {}; } })();
    setStreet(p.street ?? ""); setCity(p.city ?? ""); setZip(p.zip ?? ""); setCountry(p.country ?? "");
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const emit = (st: string, ci: string, zp: string, co: string) =>
    onChange(JSON.stringify({ street: st, city: ci, zip: zp, country: co }));

  return (
    <div className="flex flex-col gap-2">
      <input
        type="text" value={street}
        onChange={(e) => { setStreet(e.target.value); emit(e.target.value, city, zip, country); }}
        placeholder="Street and house number" className="modal-input"
      />
      <div className="flex gap-2">
        <input
          type="text" value={zip}
          onChange={(e) => { setZip(e.target.value); emit(street, city, e.target.value, country); }}
          placeholder="Zip / Postal code" className="modal-input" style={{ maxWidth: 140 }}
        />
        <input
          type="text" value={city}
          onChange={(e) => { setCity(e.target.value); emit(street, e.target.value, zip, country); }}
          placeholder="City" className="modal-input flex-1"
        />
      </div>
      <input
        type="text" value={country}
        onChange={(e) => { setCountry(e.target.value); emit(street, city, zip, e.target.value); }}
        placeholder="Country" className="modal-input"
      />
    </div>
  );
}

// ── UsersField ─────────────────────────────────────────────────────────────────

function UsersField({
  value, onChange, members,
}: {
  value: string;
  onChange: (v: string) => void;
  members: { username: string; fullName?: string }[];
}) {
  const [search, setSearch] = useState("");
  const selected: string[] = (() => { try { return JSON.parse(value || "[]"); } catch { return []; } })();

  const filtered = members.filter((m) => {
    const display = m.fullName || m.username;
    return display.toLowerCase().includes(search.toLowerCase());
  });

  const toggle = (displayName: string) => {
    const next = selected.includes(displayName)
      ? selected.filter((n) => n !== displayName)
      : [...selected, displayName];
    onChange(JSON.stringify(next));
  };

  return (
    <div className="flex flex-col gap-1.5">
      {members.length > 5 && (
        <input
          type="text" value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search members…" className="modal-input"
        />
      )}
      <div className="tpl-form-radio-group" style={{ maxHeight: 160, overflowY: "auto" }}>
        {filtered.map((m) => {
          const display = m.fullName || m.username;
          return (
            <label key={m.username} className="tpl-form-radio-item">
              <input
                type="checkbox"
                checked={selected.includes(display)}
                onChange={() => toggle(display)}
                className="w-4 h-4 accent-accent flex-shrink-0"
              />
              <span className="text-sm text-text-secondary">
                {display}
                {m.fullName && m.fullName !== m.username && (
                  <span className="text-text-muted text-xs ml-1">@{m.username}</span>
                )}
              </span>
            </label>
          );
        })}
        {filtered.length === 0 && (
          <p className="text-xs text-text-muted px-2 py-1">No members found</p>
        )}
      </div>
      {selected.length > 0 && (
        <p className="tpl-field-hint">Selected: {selected.join(", ")}</p>
      )}
    </div>
  );
}

// ── QRField ────────────────────────────────────────────────────────────────────

function QRField({
  value, onChange, required,
}: { value: string; onChange: (v: string) => void; required?: boolean }) {
  const [preview, setPreview] = useState("");

  useEffect(() => {
    if (!value.trim()) { setPreview(""); return; }
    let cancelled = false;
    import("qrcode").then((mod) => {
      const qr = (mod.default ?? mod) as { toDataURL: (t: string, o?: unknown) => Promise<string> };
      qr.toDataURL(value, { width: 120, margin: 1 })
        .then((url) => { if (!cancelled) setPreview(url); })
        .catch(() => { if (!cancelled) setPreview(""); });
    });
    return () => { cancelled = true; };
  }, [value]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Text or URL for QR code…"
          className="modal-input flex-1"
          required={required}
          spellCheck={false}
        />
        <button
          type="button"
          onClick={() => onChange(typeof window !== "undefined" ? window.location.origin : "")}
          className="modal-btn-cancel px-3 flex-shrink-0 text-xs whitespace-nowrap"
          title="Pre-fill with site base URL"
        >
          Use URL
        </button>
      </div>
      {preview && (
        <div className="p-2 bg-white rounded-md border border-border inline-block" style={{ width: "fit-content" }}>
          <img src={preview} alt="QR preview" style={{ width: 96, height: 96, display: "block" }} />
        </div>
      )}
      <p className="tpl-field-hint">The QR image will be inserted in the top-right corner of the document</p>
    </div>
  );
}

// ── SignatureField ─────────────────────────────────────────────────────────────

function SignatureField({
  value, onChange,
}: { value: string; onChange: (v: string) => void }) {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const isDrawing  = useRef(false);
  const lastPos    = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }, []); // init canvas once on mount

  const getPos = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  ): { x: number; y: number } => {
    const canvas = canvasRef.current!;
    const rect   = canvas.getBoundingClientRect();
    const scaleX = canvas.width  / rect.width;
    const scaleY = canvas.height / rect.height;
    if ("touches" in e) {
      const t = e.touches[0];
      return { x: (t.clientX - rect.left) * scaleX, y: (t.clientY - rect.top) * scaleY };
    }
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  };

  const startDraw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    isDrawing.current = true;
    lastPos.current   = getPos(e);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!isDrawing.current || !lastPos.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth   = 2;
    ctx.lineCap     = "round";
    ctx.lineJoin    = "round";
    ctx.stroke();
    lastPos.current = pos;
  };

  const endDraw = () => {
    if (!isDrawing.current) return;
    isDrawing.current = false;
    lastPos.current   = null;
    const canvas = canvasRef.current;
    if (canvas) onChange(canvas.toDataURL("image/png"));
  };

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    onChange("");
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="border border-border rounded-md overflow-hidden" style={{ background: "#fff" }}>
        <canvas
          ref={canvasRef}
          width={480}
          height={160}
          style={{ width: "100%", height: 160, cursor: "crosshair", touchAction: "none", display: "block" }}
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={endDraw}
        />
      </div>
      <div className="flex justify-between items-center">
        <p className="tpl-field-hint">Draw your signature above</p>
        <button type="button" onClick={clear} className="modal-btn-cancel text-xs px-2 py-1">Clear</button>
      </div>
    </div>
  );
}

/** Validates IPv4, IPv4/CIDR, or basic IPv6. */
function isValidIP(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  const parts = trimmed.split("/");
  if (parts.length > 2) return false;
  const ip = parts[0];
  const cidr = parts[1];
  // IPv4
  const ipv4Match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (ipv4Match) {
    const valid = [ipv4Match[1], ipv4Match[2], ipv4Match[3], ipv4Match[4]]
      .every((n) => parseInt(n, 10) <= 255);
    if (!valid) return false;
    if (cidr !== undefined) {
      const prefix = parseInt(cidr, 10);
      return !isNaN(prefix) && prefix >= 0 && prefix <= 32 && String(prefix) === cidr;
    }
    return true;
  }
  // Basic IPv6 (no CIDR)
  if (cidr !== undefined) return false;
  return /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/.test(ip) || ip === "::1" || ip === "::";
}

/** Validates MAC address as XX:XX:XX:XX:XX:XX (hex pairs separated by colons). */
function isValidMAC(value: string): boolean {
  return /^([0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}$/.test(value.trim());
}

/** Auto-formats raw MAC input into XX:XX:XX:XX:XX:XX as user types. */
function formatMACInput(raw: string): string {
  const hex = raw.replace(/[^0-9a-fA-F]/g, "").toUpperCase().slice(0, 12);
  return hex.replace(/(.{2})(?=.)/g, "$1:");
}

// ── Date formatting helpers ──────────────────────────────────────────────────
function formatDate(date: Date, fmt: TplFieldDateFormat): string {
  switch (fmt) {
    case "ISO":  return date.toISOString().slice(0, 10);
    case "EU":   return date.toLocaleDateString("en-GB");
    case "US":   return date.toLocaleDateString("en-US");
    case "Long": return date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  }
}

// ── Apply field values to raw template HTML ──────────────────────────────────
function applyTemplateValues(rawHtml: string, fields: TplField[], values: Record<string, string>): string {
  return rawHtml.replace(
    /(<span[^>]*data-tpl-field="([A-Za-z0-9+/=_-]+)"[^>]*>)[^<]*(<\/span>)/g,
    (_match, _open, b64) => {
      let field: TplField | null = null;
      try { field = fromSafeB64(b64) as TplField; } catch { /* ignore */ }
      if (!field) return _match;

      const rawValue = values[field.name] ?? "";
      let resolved = "";

      if (field.type === "boolean") {
        // Always emits the configured label
        resolved = rawValue === "true"
          ? (field.trueLabel ?? "Yes")
          : (field.falseLabel ?? "No");
      } else if (field.type === "multiselect") {
        let arr: string[] = [];
        try { arr = JSON.parse(rawValue || "[]"); } catch {}
        if (arr.length === 0) {
          switch (field.emptyBehavior) {
            case "empty":   resolved = ""; break;
            case "default": resolved = field.defaultValue ?? ""; break;
            case "keep":    resolved = `[${field.name}]`; break;
          }
        } else {
          resolved = arr.map(o => `- ${o}`).join("\n");
        }
      } else {
        const userValue = rawValue.trim();
        resolved = userValue;
        if (!userValue) {
          switch (field.emptyBehavior) {
            case "empty":   resolved = ""; break;
            case "default":
              if (field.type === "date" && field.defaultValue === "today") {
                resolved = formatDate(new Date(), field.dateFormat ?? "Long");
              } else {
                resolved = field.defaultValue ?? "";
              }
              break;
            case "keep":    resolved = `[${field.name}]`; break;
          }
        } else if (field.type === "date") {
          const d = new Date(userValue);
          if (!isNaN(d.getTime())) resolved = formatDate(d, field.dateFormat ?? "Long");
        }
      }

      return resolved;
    }
  );
}

export default function TemplateFormModal({
  isOpen,
  template,
  categories,
  defaultCategory,
  onClose,
  onCreate,
  spaceMembers = [],
}: TemplateFormModalProps) {
  const [docName, setDocName]         = useState("");
  const [category, setCategory]       = useState("");
  const [values, setValues]           = useState<Record<string, string>>({});
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const nameRef    = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Non-template categories only
  const nonTplCategories = categories.filter(
    (c) => c.path !== "Templates" && !c.path.startsWith("Templates/")
  );

  useEffect(() => {
    if (isOpen && template) {
      setDocName("");
      setCategory(
        (defaultCategory && nonTplCategories.some((c) => c.path === defaultCategory))
          ? defaultCategory
          : nonTplCategories[0]?.path ?? ""
      );
      // Pre-fill defaults
      const init: Record<string, string> = {};
      for (const f of template.fields) {
        if (f.type === "date" && f.defaultValue === "today") {
          init[f.name] = new Date().toISOString().slice(0, 10);
        } else if (f.type === "boolean") {
          init[f.name] = f.defaultValue === "true" ? "true" : "false";
        } else if (f.type === "multiselect" || f.type === "users") {
          init[f.name] = "[]";
        } else if (f.type === "currency") {
          init[f.name] = JSON.stringify({ currency: "EUR", amount: f.defaultValue ?? "" });
        } else if (f.type === "duration") {
          init[f.name] = JSON.stringify({ h: "", m: "", s: "" });
        } else if (f.type === "address") {
          init[f.name] = JSON.stringify({ street: "", city: "", zip: "", country: "" });
        } else if (f.type === "signature") {
          init[f.name] = "";
        } else {
          init[f.name] = f.defaultValue ?? "";
        }
      }
      setValues(init);
      setTimeout(() => nameRef.current?.focus(), 80);
    }
  }, [isOpen, template]);  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    if (dropdownOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [dropdownOpen]);

  if (!isOpen || !template) return null;

  const canSubmit = () => {
    if (!docName.trim()) return false;
    for (const f of template.fields) {
      const val = values[f.name] ?? "";
      // Format-validation (applies whether required or not, when value is non-empty)
      if (f.type === "ip") {
        if (f.required && !isValidIP(val)) return false;
        if (!f.required && val.trim() && !isValidIP(val)) return false;
        continue;
      }
      if (f.type === "mac") {
        if (f.required && !isValidMAC(val)) return false;
        if (!f.required && val.trim() && !isValidMAC(val)) return false;
        continue;
      }
      if (f.type === "iban") {
        const stripped = val.replace(/\s+/g, "");
        if (f.required && !isValidIBAN(val)) return false;
        if (!f.required && stripped && !isValidIBAN(val)) return false;
        continue;
      }
      if (f.type === "vat_be") {
        const stripped = val.replace(/[\s.]/g, "");
        if (f.required && !isValidVATBE(val)) return false;
        if (!f.required && stripped && !isValidVATBE(val)) return false;
        continue;
      }
      if (!f.required) continue;
      // Required-only checks for remaining types
      if (f.type === "multiselect" || f.type === "users") {
        try { if (JSON.parse(val || "[]").length === 0) return false; } catch { return false; }
      } else if (f.type === "boolean") {
        if (val !== "true") return false;
      } else if (f.type === "currency") {
        try { if (!(JSON.parse(val || "{}").amount ?? "").trim()) return false; } catch { return false; }
      } else if (f.type === "rating") {
        if (!parseInt(val)) return false;
      } else if (f.type === "duration") {
        try { const p = JSON.parse(val || "{}"); if (!p.h && !p.m && !p.s) return false; } catch { return false; }
      } else if (f.type === "address") {
        try { if (!(JSON.parse(val || "{}").street ?? "").trim()) return false; } catch { return false; }
      } else if (f.type === "signature") {
        if (!val.startsWith("data:image")) return false;
      } else {
        if (!val.trim()) return false;
      }
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit()) return;

    // Fetch template raw content
    let rawContent = "";
    try {
      const qs = new URLSearchParams({ category: template.category, isTemplate: "true" });
      const res = await fetch(
        `/api/spaces/${template.space}/docs/${encodeURIComponent(template.name)}?${qs}`
      );
      if (res.ok) {
        const json = await res.json();
        rawContent = json.content ?? "";
      }
    } catch { /* ignore */ }

    // Pre-resolve complex field types before substitution
    const resolvedValues = { ...values };
    for (const f of template.fields) {
      const v = resolvedValues[f.name] ?? "";
      if (f.type === "currency") {
        try {
          const p = JSON.parse(v);
          const sym = CURRENCIES.find((c) => c.code === p.currency)?.symbol ?? p.currency;
          const amt = (p.amount ?? "").replace(",", ".");
          resolvedValues[f.name] = amt.trim() ? `${sym} ${parseFloat(amt).toFixed(2)}` : "";
        } catch { /* leave as is */ }
      } else if (f.type === "rating") {
        const n = parseInt(v) || 0;
        resolvedValues[f.name] = n > 0 ? "\u2605".repeat(n) + "\u2606".repeat(5 - n) : "";
      } else if (f.type === "duration") {
        try {
          const p = JSON.parse(v || "{}");
          const parts: string[] = [];
          if (p.h && p.h !== "0") parts.push(`${p.h}h`);
          if (p.m && p.m !== "0") parts.push(`${p.m}m`);
          if (p.s && p.s !== "0") parts.push(`${p.s}s`);
          resolvedValues[f.name] = parts.join(" ");
        } catch { /* leave as is */ }
      } else if (f.type === "address") {
        try {
          const p = JSON.parse(v || "{}");
          const parts = [p.street, [p.zip, p.city].filter(Boolean).join(" "), p.country].filter(Boolean);
          resolvedValues[f.name] = parts.join("\n");
        } catch { /* leave as is */ }
      } else if (f.type === "users") {
        try {
          const arr = JSON.parse(v || "[]") as string[];
          resolvedValues[f.name] = arr.join(", ");
        } catch { /* leave as is */ }
      } else if (f.type === "qr" && v.trim()) {
        try {
          const mod = await import("qrcode");
          const qr = (mod.default ?? mod) as { toDataURL: (t: string, o?: unknown) => Promise<string> };
          const dataUrl = await qr.toDataURL(v, { width: 200, margin: 2 });
          resolvedValues[f.name] = `<img src="${dataUrl}" alt="QR code" width="120" style="float:right;margin:0 0 12px 16px;width:120px;height:120px;" />`;
        } catch { /* leave as is */ }
      } else if (f.type === "signature" && v.startsWith("data:image")) {
        resolvedValues[f.name] = `<img src="${v}" alt="Signature" width="300" style="max-width:300px;height:80px;display:block;" />`;
      }
    }

    const applied = applyTemplateValues(rawContent, template.fields, resolvedValues);
    onCreate(docName.trim(), category, applied);
    onClose();
  };

  const setValue = (fieldName: string, val: string) =>
    setValues((prev) => ({ ...prev, [fieldName]: val }));

  const selectedCatLabel = nonTplCategories.find((c) => c.path === category)?.name ?? category;

  // Full-width field types in the 2-column grid
  const FULL_WIDTH_TYPES = new Set([
    "textarea", "markdown", "signature", "qr",
    "address", "users", "phone", "currency", "duration",
    "radio", "multiselect",
  ]);

  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        className="modal-container"
        style={{ maxWidth: 1040, display: "flex", flexDirection: "column", maxHeight: "90vh", overflow: "hidden" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div className="flex items-center gap-2">
            <LayoutTemplate className="w-5 h-5 tpl-folder-icon" />
            <h2 className="modal-title">Create from template: {template.name}</h2>
          </div>
          <button onClick={onClose} className="modal-close"><X className="w-5 h-5" /></button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
          {/* Scrollable field area */}
          <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Category */}
          <div className="modal-field">
            <label className="modal-label">Category</label>
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="modal-select"
              >
                <Folder className="w-4 h-4 text-text-muted" />
                <span className="flex-1 text-left truncate">{selectedCatLabel || "Select category…"}</span>
                <ChevronDown className={`w-4 h-4 text-text-muted transition-transform${dropdownOpen ? " rotate-180" : ""}`} />
              </button>
              {dropdownOpen && (
                <div className="modal-dropdown">
                  {nonTplCategories.map((cat) => (
                    <button
                      key={cat.path}
                      type="button"
                      className={`modal-dropdown-item${category === cat.path ? " active" : ""}`}
                      style={{ paddingLeft: `${12 + cat.level * 16}px` }}
                      onClick={() => { setCategory(cat.path); setDropdownOpen(false); }}
                    >
                      {cat.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Document name */}
          <div className="modal-field">
            <label className="modal-label">Document name <span className="text-red-400">*</span></label>
            <input
              ref={nameRef}
              type="text"
              value={docName}
              onChange={(e) => setDocName(e.target.value)}
              placeholder="Enter document name…"
              className="modal-input"
              required
            />
          </div>

          {/* Field values */}
          {template.fields.length > 0 && (
            <div className="tpl-form-fields">
              <div className="tpl-form-fields-title">Fill in template fields</div>
              {template.fields.map((field) => (
                <div key={field.name} className={`modal-field${FULL_WIDTH_TYPES.has(field.type) ? " tpl-field-wide" : ""}`}>
                  <label className="modal-label">
                    {field.name}
                    {field.required && <span className="text-red-400"> *</span>}
                    {field.hint && (
                      <span className="text-text-muted text-xs font-normal ml-1">— {field.hint}</span>
                    )}
                  </label>

                  {field.type === "text" && (
                    <input
                      type="text"
                      value={values[field.name] ?? ""}
                      onChange={(e) => setValue(field.name, e.target.value)}
                      placeholder={field.hint || `Enter ${field.name}…`}
                      className="modal-input"
                      required={field.required}
                    />
                  )}

                  {field.type === "textarea" && (
                    <textarea
                      value={values[field.name] ?? ""}
                      onChange={(e) => setValue(field.name, e.target.value)}
                      placeholder={field.hint || `Enter ${field.name}…`}
                      className="modal-input"
                      rows={3}
                      required={field.required}
                    />
                  )}

                  {field.type === "phone" && (
                    <PhoneField
                      value={values[field.name] ?? ""}
                      onChange={(v) => setValue(field.name, v)}
                      required={field.required}
                    />
                  )}

                  {field.type === "markdown" && (
                    <MiniMarkdownEditor
                      value={values[field.name] ?? ""}
                      onChange={(v) => setValue(field.name, v)}
                      placeholder={field.hint || `Write ${field.name}…`}
                      required={field.required}
                    />
                  )}

                  {field.type === "number" && (
                    <>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={values[field.name] ?? ""}
                        onChange={(e) => {
                          // Strip non-numeric chars — allow digits, dot, comma, minus
                          const filtered = e.target.value.replace(/[^0-9.,\-]/g, "");
                          setValue(field.name, filtered);
                        }}
                        placeholder={field.hint || "0"}
                        className="modal-input"
                        required={field.required}
                      />
                      <p className="tpl-field-hint">Numeric value (e.g. 42 or 3.14)</p>
                    </>
                  )}

                  {field.type === "url" && (
                    <>
                      <input
                        type="url"
                        value={values[field.name] ?? ""}
                        onChange={(e) => setValue(field.name, e.target.value)}
                        placeholder={field.hint || "https://example.com"}
                        className="modal-input"
                        required={field.required}
                      />
                      <p className="tpl-field-hint">Must start with https:// or http://</p>
                    </>
                  )}

                  {field.type === "email" && (
                    <>
                      <input
                        type="email"
                        value={values[field.name] ?? ""}
                        onChange={(e) => setValue(field.name, e.target.value)}
                        placeholder={field.hint || "name@example.com"}
                        className="modal-input"
                        required={field.required}
                      />
                      <p className="tpl-field-hint">Format: name@domain.com</p>
                    </>
                  )}

                  {field.type === "ip" && (() => {
                    const val = values[field.name] ?? "";
                    const hasVal = val.trim().length > 0;
                    const valid = !hasVal || isValidIP(val);
                    return (
                      <>
                        <input
                          type="text"
                          value={val}
                          onChange={(e) => setValue(field.name, e.target.value)}
                          placeholder={field.hint || "192.168.1.1"}
                          className={`modal-input${hasVal ? (valid ? " input-valid" : " input-invalid") : ""}`}
                          required={field.required}
                          spellCheck={false}
                        />
                        <p className="tpl-field-hint">IPv4: 192.168.1.1 · with subnet: 192.168.1.0/24 · IPv6: ::1</p>
                        {hasVal && !valid && (
                          <p className="tpl-field-error">Invalid IP address format</p>
                        )}
                      </>
                    );
                  })()}

                  {field.type === "mac" && (() => {
                    const val = values[field.name] ?? "";
                    const hasVal = val.trim().length > 0;
                    const valid = !hasVal || isValidMAC(val);
                    return (
                      <>
                        <input
                          type="text"
                          value={val}
                          onChange={(e) => setValue(field.name, formatMACInput(e.target.value))}
                          placeholder={field.hint || "AA:BB:CC:DD:EE:FF"}
                          className={`modal-input${hasVal ? (valid ? " input-valid" : " input-invalid") : ""}`}
                          required={field.required}
                          spellCheck={false}
                          maxLength={17}
                        />
                        <p className="tpl-field-hint">Format: AA:BB:CC:DD:EE:FF (hex pairs, auto-formatted)</p>
                        {hasVal && !valid && (
                          <p className="tpl-field-error">Incomplete MAC address</p>
                        )}
                      </>
                    );
                  })()}

                  {field.type === "dropdown" && (
                    <select
                      value={values[field.name] ?? ""}
                      onChange={(e) => setValue(field.name, e.target.value)}
                      className="modal-input"
                      required={field.required}
                    >
                      {!field.required && <option value="">— choose —</option>}
                      {(field.options ?? []).map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  )}

                  {field.type === "radio" && (
                    <div className="tpl-form-radio-group">
                      {(field.options ?? []).map((opt) => (
                        <label key={opt} className="tpl-form-radio-item">
                          <input
                            type="radio"
                            name={`radio-${field.name}`}
                            value={opt}
                            checked={values[field.name] === opt}
                            onChange={() => setValue(field.name, opt)}
                            className="w-4 h-4 accent-accent flex-shrink-0"
                            required={field.required}
                          />
                          <span className="text-sm text-text-secondary">{opt}</span>
                        </label>
                      ))}
                    </div>
                  )}

                  {field.type === "multiselect" && (
                    <div className="tpl-form-radio-group">
                      {(field.options ?? []).map((opt) => {
                        const selected: string[] = (() => { try { return JSON.parse(values[field.name] || "[]"); } catch { return []; } })();
                        return (
                          <label key={opt} className="tpl-form-radio-item">
                            <input
                              type="checkbox"
                              checked={selected.includes(opt)}
                              onChange={(e) => {
                                const curr: string[] = (() => { try { return JSON.parse(values[field.name] || "[]"); } catch { return []; } })();
                                setValue(field.name, JSON.stringify(
                                  e.target.checked ? [...curr, opt] : curr.filter(o => o !== opt)
                                ));
                              }}
                              className="w-4 h-4 accent-accent flex-shrink-0"
                            />
                            <span className="text-sm text-text-secondary">{opt}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}

                  {field.type === "date" && (
                    <input
                      type="date"
                      value={values[field.name] ?? ""}
                      onChange={(e) => setValue(field.name, e.target.value)}
                      className="modal-input"
                      required={field.required}
                    />
                  )}

                  {field.type === "time" && (
                    <>
                      <input
                        type="time"
                        value={values[field.name] ?? ""}
                        onChange={(e) => setValue(field.name, e.target.value)}
                        className="modal-input"
                        required={field.required}
                      />
                      <p className="tpl-field-hint">Format: HH:MM (24-hour)</p>
                    </>
                  )}

                  {field.type === "boolean" && (
                    <label className="tpl-form-boolean">
                      <input
                        type="checkbox"
                        checked={values[field.name] === "true"}
                        onChange={(e) => setValue(field.name, e.target.checked ? "true" : "false")}
                        className="w-4 h-4 accent-accent flex-shrink-0"
                      />
                      <span className="text-sm text-text-secondary">
                        {values[field.name] === "true"
                          ? (field.trueLabel ?? "Yes")
                          : (field.falseLabel ?? "No")}
                      </span>
                    </label>
                  )}

                  {field.type === "color" && (
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        value={values[field.name] || "#3b82f6"}
                        onChange={(e) => setValue(field.name, e.target.value)}
                        className="w-10 h-10 rounded cursor-pointer border border-border flex-shrink-0"
                        title="Pick a color"
                      />
                      <input
                        type="text"
                        value={values[field.name] ?? ""}
                        onChange={(e) => setValue(field.name, e.target.value)}
                        placeholder="#3b82f6"
                        className="modal-input flex-1 font-mono"
                        spellCheck={false}
                        required={field.required}
                      />
                    </div>
                  )}

                  {field.type === "currency" && (
                    <CurrencyField
                      value={values[field.name] ?? ""}
                      onChange={(v) => setValue(field.name, v)}
                      required={field.required}
                    />
                  )}

                  {field.type === "rating" && (
                    <RatingField
                      value={values[field.name] ?? ""}
                      onChange={(v) => setValue(field.name, v)}
                    />
                  )}

                  {field.type === "version" && (
                    <>
                      <input
                        type="text"
                        value={values[field.name] ?? ""}
                        onChange={(e) => setValue(field.name, e.target.value)}
                        placeholder={field.hint || "1.0.0"}
                        className="modal-input font-mono"
                        spellCheck={false}
                        required={field.required}
                      />
                      <p className="tpl-field-hint">e.g. 1.0.0, 2.3.1-beta, v1.4.0</p>
                    </>
                  )}

                  {field.type === "duration" && (
                    <DurationField
                      value={values[field.name] ?? ""}
                      onChange={(v) => setValue(field.name, v)}
                    />
                  )}

                  {field.type === "iban" && (() => {
                    const val = values[field.name] ?? "";
                    const stripped = val.replace(/\s+/g, "");
                    const hasVal = stripped.length > 0;
                    const valid = !hasVal || isValidIBAN(val);
                    return (
                      <>
                        <input
                          type="text"
                          value={val}
                          onChange={(e) => setValue(field.name, formatIBANInput(e.target.value))}
                          placeholder={field.hint || "BE68 5390 0754 7034"}
                          className={`modal-input font-mono${hasVal ? (valid ? " input-valid" : " input-invalid") : ""}`}
                          required={field.required}
                          spellCheck={false}
                          maxLength={42}
                        />
                        <p className="tpl-field-hint">Auto-grouped · e.g. BE68 5390 0754 7034</p>
                        {hasVal && !valid && (
                          <p className="tpl-field-error">Invalid IBAN</p>
                        )}
                      </>
                    );
                  })()}

                  {field.type === "vat_be" && (() => {
                    const val = values[field.name] ?? "";
                    const stripped = val.replace(/[\s.]/g, "");
                    const hasVal = stripped.length > 0;
                    const valid = !hasVal || isValidVATBE(val);
                    return (
                      <>
                        <input
                          type="text"
                          value={val}
                          onChange={(e) =>
                            setValue(field.name, e.target.value.toUpperCase().replace(/[^BE0-9.\s]/g, ""))
                          }
                          placeholder={field.hint || "BE 0123.456.789"}
                          className={`modal-input font-mono${hasVal ? (valid ? " input-valid" : " input-invalid") : ""}`}
                          required={field.required}
                          spellCheck={false}
                          maxLength={17}
                        />
                        <p className="tpl-field-hint">Belgian VAT: BE + 10 digits, e.g. BE 0123.456.789</p>
                        {hasVal && !valid && (
                          <p className="tpl-field-error">Invalid Belgian VAT number</p>
                        )}
                      </>
                    );
                  })()}

                  {field.type === "address" && (
                    <AddressField
                      value={values[field.name] ?? ""}
                      onChange={(v) => setValue(field.name, v)}
                    />
                  )}

                  {field.type === "users" && (
                    <UsersField
                      value={values[field.name] ?? ""}
                      onChange={(v) => setValue(field.name, v)}
                      members={spaceMembers}
                    />
                  )}

                  {field.type === "qr" && (
                    <QRField
                      value={values[field.name] ?? ""}
                      onChange={(v) => setValue(field.name, v)}
                      required={field.required}
                    />
                  )}

                  {field.type === "signature" && (
                    <SignatureField
                      value={values[field.name] ?? ""}
                      onChange={(v) => setValue(field.name, v)}
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          </div>{/* end scrollable area */}

          {/* Sticky footer — always visible */}
          <div className="modal-actions tpl-form-footer">
            <button type="button" onClick={onClose} className="modal-btn-cancel">Cancel</button>
            <button type="submit" disabled={!canSubmit()} className="modal-btn-primary">
              Create Document
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
