// === User & Auth ===

export type SpaceRole = "admin" | "writer" | "reader";

export interface FavoriteItem {
  type: "doc" | "database";
  name: string;        // doc name or database title
  id?: string;         // database ID
  category?: string;   // doc category
  spaceSlug: string;
  spaceName?: string;
}

export interface UserPreferences {
  editorLineSpacing?: "compact" | "spaced";
  fontSize?: "sm" | "base" | "lg" | "xl";
  alwaysShowToc?: boolean;
  accentColor?: string;
  pageWidth?: "narrow" | "wide" | "max";
  favorites?: FavoriteItem[];
  spellcheckEnabled?: boolean;
  spellcheckLanguage?: string;
}

export interface User {
  username: string;
  passwordHash: string;
  isAdmin: boolean;
  isSuperAdmin?: boolean;
  fullName?: string;
  email?: string;
  status?: "active" | "pending";
  createdAt: string;
  lastLogin?: string;
  preferences?: UserPreferences;
  /** All previous bcrypt password hashes (unlimited, NIS2 compliance) */
  passwordHistory?: string[];
  /** Set by admin on user creation/reset — forces password change on first login */
  mustChangePassword?: boolean;
  /** Consecutive failed login attempts since last success */
  failedLoginAttempts?: number;
  /** Consecutive failed TOTP attempts (separate from password failures) */
  totpFailedAttempts?: number;
  /** ISO timestamp when account was locked */
  lockedAt?: string;
  /** True when account is locked — only admin can unlock */
  isLocked?: boolean;
  /** Base32-encoded TOTP secret (encrypted at rest via audit key) */
  totpSecret?: string;
  /** Whether TOTP MFA is active for this account */
  totpEnabled?: boolean;
  /** SHA-256 hashes of single-use TOTP backup codes */
  totpBackupCodes?: string[];
}

export type SanitizedUser = Omit<User, "passwordHash">;

export interface Session {
  username: string;
  createdAt: string;
  /** ISO timestamp after which the session is considered expired */
  expiresAt: string;
  /** ISO timestamp of last request — used for idle timeout (NIS2) */
  lastActivityAt?: string;
}

// === Spaces ===

export interface Space {
  id: string;
  name: string;
  slug: string;
  createdBy: string;
  createdAt: string;
  permissions: Record<string, SpaceRole>; // username -> role
}

// === Categories ===

export interface Category {
  name: string;
  path: string;
  parent?: string;
  level: number;
  count: number;
}

// === Documents ===

export type DocStatus = "draft" | "review" | "published";

export interface DocStatusEntry {
  status: DocStatus;
  reviewer?: string;   // username
  assignedBy?: string;
  assignedAt?: string;
}

export type DocStatusMap = Record<string, DocStatusEntry>;
// key: "${category}/${docname}"

export interface DocFile {
  name: string;
  filename: string;
  category: string;
  space: string;
  isTemplate?: boolean;
}

export interface ReviewItem {
  docName: string;
  category: string;
  spaceSlug: string;
  spaceName?: string;
  assignedBy?: string;
  assignedAt?: string;
}

// === Templates ===

export type TplFieldType =
  | "text" | "textarea" | "number" | "url" | "email"
  | "dropdown" | "radio" | "multiselect"
  | "date" | "time" | "boolean";
export type TplFieldDateFormat = "ISO" | "EU" | "US" | "Long";
export type TplFieldEmptyBehavior = "empty" | "default" | "keep";

export interface TplField {
  name: string;
  type: TplFieldType;
  required: boolean;
  hint: string;
  defaultValue: string;
  options?: string[];              // dropdown | radio | multiselect
  dateFormat?: TplFieldDateFormat; // date only
  emptyBehavior: TplFieldEmptyBehavior;
  trueLabel?: string;              // boolean only (default "Yes")
  falseLabel?: string;             // boolean only (default "No")
}

export interface TemplateInfo {
  name: string;
  filename: string;
  category: string;
  space: string;
  fields: TplField[];
}

// === Tags ===

export interface TagInfo {
  name: string;
  displayName: string;
  parent: string | null;
  docNames: string[];
  totalCount: number;
}

export type TagsIndex = Record<string, TagInfo>;

// === Customization ===

export interface SpaceCustomization {
  docIcons: Record<string, string>;       // "category/docName" -> emoji
  docColors: Record<string, string>;      // "category/docName" -> hex color
  categoryIcons: Record<string, string>;  // "categoryPath" -> emoji
  categoryColors: Record<string, string>; // "categoryPath" -> hex color
}

// === Document Metadata (frontmatter) ===

export type CustomPropertyType = "text" | "number" | "checkbox" | "date";

export interface CustomProperty {
  type: CustomPropertyType;
  value: string | number | boolean;
}

export type DocClassification = "public" | "internal" | "confidential" | "restricted";

export interface DocMetadata {
  createdAt?: string;
  createdBy?: string;
  updatedAt?: string;
  updatedBy?: string;
  tags?: string[];
  classification?: DocClassification;
  custom?: Record<string, CustomProperty>;
}

// === Database Tables ===

export type DbColumnType =
  | "text" | "number" | "select" | "multiSelect"
  | "checkbox" | "date" | "url" | "email"
  | "relation" | "formula" | "member" | "createdBy";

export type DbViewType = "table" | "kanban" | "calendar" | "gallery";

export interface DbColumn {
  id: string;
  name: string;
  type: DbColumnType;
  options?: string[];           // select / multiSelect
  relationDbId?: string;        // relation
  formula?: string;             // formula
  width?: number;               // default column width in px
  defaultValue?: unknown;       // default cell value for new rows
  defaultCurrentDate?: boolean; // date only: use today's date as default
}

export interface DbRow {
  id: string;
  cells: Record<string, unknown>;  // columnId -> value
  createdAt: string;
}

export type DbFilterOp =
  | "eq" | "neq" | "contains" | "notContains"
  | "gt" | "gte" | "lt" | "lte"
  | "isEmpty" | "isNotEmpty"
  | "is" | "isNot"
  | "before" | "after"
  | "isTrue" | "isFalse";

export interface DbFilter {
  columnId: string;
  op: DbFilterOp;
  value?: unknown;
}

export interface DbSort {
  columnId: string;
  dir: "asc" | "desc";
}

export interface DbView {
  id: string;
  name: string;
  type: DbViewType;
  filters: DbFilter[];
  filterLogic?: "and" | "or";
  sorts: DbSort[];
  groupBy?: string;          // columnId (kanban/calendar)
  hiddenColumns?: string[];  // columnIds
  columnOrder?: string[];    // columnIds in display order
  columnWidths?: Record<string, number>;
}

export interface Database {
  id: string;
  title: string;
  columns: DbColumn[];
  rows: DbRow[];
  views: DbView[];
  createdAt: string;
  createdBy: string;
  updatedAt: string;
}

// === API Keys ===

export interface UserApiKey {
  id: string;
  name: string;
  keyHash: string;      // SHA-256 of the raw secret (never returned to client)
  prefix: string;       // first 12 chars for display e.g. dk_u_abc12345
  createdAt: string;
  lastUsedAt?: string;
  expiresAt?: string;   // ISO date string, absent = never expires
}

export interface ServiceApiKey {
  id: string;
  name: string;
  keyHash: string;
  prefix: string;       // dk_s_...
  /** spaceSlug → role. Use "*" as key for "all spaces" with a default role. */
  permissions: Record<string, SpaceRole>;
  createdBy: string;    // admin username
  createdAt: string;
  lastUsedAt?: string;
  expiresAt?: string;
}

// === API result ===

export interface Result<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// === Audit Logging ===

export type AuditOutcome = "success" | "failure";

export type AuditSessionType = "session" | "api-key" | "service-key" | "anonymous";

export type AuditEventType =
  | "auth.login"
  | "auth.login.failed"
  | "auth.logout"
  | "auth.register"
  | "auth.setup"
  | "user.create"
  | "user.update"
  | "user.delete"
  | "space.create"
  | "space.update"
  | "space.delete"
  | "space.member.add"
  | "space.member.update"
  | "space.member.remove"
  | "document.read"
  | "document.create"
  | "document.update"
  | "document.delete"
  | "document.archive"
  | "document.unarchive"
  | "document.move"
  | "document.rename"
  | "document.status.change"
  | "document.history.view"
  | "document.history.restore"
  | "api_key.create"
  | "api_key.revoke"
  | "service_key.create"
  | "service_key.revoke"
  | "settings.update"
  | "access.denied"
  | "offline.bundle.download"
  | "auth.account.locked"
  | "auth.account.unlocked"
  | "auth.mfa.enabled"
  | "auth.mfa.disabled"
  | "auth.mfa.backup_used"
  | "auth.mfa.reset"
  | "backup.run";

export interface AuditEntry {
  eventId: string;
  timestamp: string;
  event: AuditEventType;
  outcome: AuditOutcome;
  actor: string;
  sessionType: AuditSessionType;
  ip?: string;
  userAgent?: string;
  spaceSlug?: string;
  resource?: string;
  resourceType?: string;
  details?: Record<string, unknown>;
  /** HMAC-SHA256 hash of the previous entry (tamper-evident chain) */
  prevHash?: string;
  /** HMAC-SHA256(key, prevHash + JSON(entry without hashes)) */
  entryHash?: string;
}

export interface AuditLogPayload {
  event: AuditEventType;
  outcome: AuditOutcome;
  actor?: string;          // explicit override; otherwise auto-detected from request context
  sessionType?: AuditSessionType;
  spaceSlug?: string;
  resource?: string;
  resourceType?: string;
  details?: Record<string, unknown>;
}

export interface AuditLocalFileConfig {
  retentionDays: number;   // default 365; local JSONL file is always written
}

export interface AuditSyslogConfig {
  enabled: boolean;
  host: string;
  port: number;            // default 514
  protocol: "udp" | "tcp";
  facility: string;        // "local0" … "local7", "user", "daemon", "auth", etc.
  appName: string;         // default "doc-it"
  hostname: string;        // override; defaults to os.hostname()
}

export interface AuditConfig {
  enabled: boolean;        // master switch — when false nothing is written
  localFile: AuditLocalFileConfig;
  syslog: AuditSyslogConfig;
}

// === Backup ===

export type BackupSchedule = "manual" | "daily" | "weekly";

export interface BackupLocalTarget {
  id: string;
  type: "local";
  label: string;
  /** Absolute path to write the backup archive (covers pre-mounted NFS/CIFS) */
  path: string;
}

export interface BackupCifsTarget {
  id: string;
  type: "cifs";
  label: string;
  host: string;
  share: string;
  /** Remote path/filename prefix inside the share (e.g. "backups/") */
  remotePath: string;
  username: string;
  /** Password stored encrypted via crypto.ts */
  password?: string;
}

export type BackupTarget = BackupLocalTarget | BackupCifsTarget;

export interface BackupConfig {
  enabled: boolean;
  schedule: BackupSchedule;
  /** HH:MM in 24h format, used for daily/weekly */
  scheduleTime: string;
  /** Day of week for weekly (0=Sun … 6=Sat) */
  scheduleDayOfWeek: number;
  /** Number of local backup files to keep (0 = unlimited) */
  retentionCount: number;
  targets: BackupTarget[];
}

export interface BackupEntry {
  filename: string;
  sizeBytes: number;
  createdAt: string;
}

export interface BackupResult {
  success: boolean;
  filename?: string;
  error?: string;
  targetResults: { label: string; success: boolean; error?: string }[];
}
