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
  defaultSpace?: string;
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
  /** Authentication source — 'local' (default) or 'ad' (Active Directory shadow account) */
  authSource?: "local" | "ad";
  /** sAMAccountName as returned by AD (preserved for display / audit) */
  adUsername?: string;
  /** AD group DNs (memberOf) cached at login — used for runtime permission checks */
  adGroups?: string[];
}

// === Active Directory ===

export interface AdGroupMapping {
  id: string;
  /** Full LDAP DN of the AD group, e.g. "CN=DocIt-Writers,OU=Groups,DC=example,DC=com" */
  groupDn: string;
  /** doc-it space slug, or "*" to grant global admin */
  spaceSlug: string;
  role: SpaceRole;
}

export interface AdConfig {
  enabled: boolean;
  host: string;
  port: number;
  /** Use LDAPS (port 636 + TLS) instead of plain LDAP */
  ssl: boolean;
  /** Allow self-signed / untrusted TLS certificates */
  tlsRejectUnauthorized: boolean;
  /** DN of the service account used to search the directory */
  bindDn: string;
  /** AES-256-GCM encrypted bind password (ENC:… prefix) */
  bindPasswordEncrypted?: string;
  /** Base DN for the directory, e.g. "DC=example,DC=com" */
  baseDn: string;
  /** Sub-tree to search for user objects; defaults to baseDn if empty */
  userSearchBase: string;
  /** AD group DNs whose members are allowed to log in */
  allowedGroups: string[];
  /** Individual sAMAccountNames allowed to log in regardless of group */
  allowedUsers: string[];
  /** Map AD groups to doc-it space roles */
  groupMappings: AdGroupMapping[];
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
  | "text" | "textarea" | "markdown" | "number" | "url" | "email"
  | "dropdown" | "radio" | "multiselect"
  | "date" | "time" | "boolean"
  | "ip" | "mac" | "phone"
  | "color" | "currency" | "rating" | "version" | "duration"
  | "iban" | "vat_be" | "address" | "users" | "qr" | "signature";
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
  tagColors: Record<string, string>;      // "tagName" -> hex color
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

// === Enhanced Tables ===

export type DbColumnType =
  | "text" | "number" | "select" | "multiSelect"
  | "checkbox" | "date" | "url" | "email"
  | "formula" | "member" | "createdBy"
  | "relation" | "lookup" | "tag";

export type DbViewType = "table" | "kanban" | "calendar" | "gallery";

export interface DbColumnRelation {
  targetSpace: string;           // slug of the target space
  targetDbId: string;            // ID of the target enhanced table
  displayColumnId?: string;      // column on target table to show as label (defaults to first text col)
  limit: "one" | "many";         // "one" = single link, "many" = multi-link
  bidirectional?: boolean;       // auto-create/maintain reverse column on target table
  reverseColumnId?: string;      // ID of the auto-created reverse column on the target table
}

export type DbLookupAggregate = "first" | "list" | "count" | "sum" | "avg" | "min" | "max";

export interface DbColumnLookup {
  relationColumnId: string;      // relation column on this table to follow
  targetColumnId: string;        // column on the target table to pull
  aggregate?: DbLookupAggregate; // how to reduce multiple values (default "list")
}

export interface DbColumn {
  id: string;
  name: string;
  type: DbColumnType;
  options?: string[];           // select / multiSelect
  formula?: string;             // formula
  width?: number;               // default column width in px
  defaultValue?: unknown;       // default cell value for new rows
  defaultCurrentDate?: boolean; // date only: use today's date as default
  relation?: DbColumnRelation;  // relation column config
  lookup?: DbColumnLookup;      // lookup column config
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

export interface EnhancedTable {
  id: string;
  title: string;
  columns: DbColumn[];
  rows: DbRow[];
  views: DbView[];
  tags?: string[];
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
  | "category.archive"
  | "document.rename"
  | "database.create"
  | "database.update"
  | "database.delete"
  | "database.archive"
  | "database.unarchive"
  | "document.status.change"
  | "document.history.view"
  | "document.history.restore"
  | "api_key.create"
  | "api_key.revoke"
  | "service_key.create"
  | "service_key.revoke"
  | "settings.update"
  | "access.denied"
  | "offline.bundle.requested"
  | "offline.bundle.download"
  | "auth.account.locked"
  | "auth.account.unlocked"
  | "auth.mfa.enabled"
  | "auth.mfa.disabled"
  | "auth.mfa.backup_used"
  | "auth.mfa.reset"
  | "backup.run"
  | "cert.key.generate"
  | "cert.key.import"
  | "cert.key.export"
  | "cert.key.delete"
  | "cert.csr.create"
  | "cert.csr.import"
  | "cert.csr.sign"
  | "cert.csr.delete"
  | "cert.import"
  | "cert.create"
  | "cert.revoke"
  | "cert.renew"
  | "cert.export"
  | "cert.delete"
  | "cert.crl.generate"
  | "cert.expiry.alert"
  | "auth.password.change"
  | "auth.sudo"
  | "user.group.create"
  | "user.group.update"
  | "user.group.delete"
  | "snapshot.create"
  | "snapshot.restore"
  | "snapshot.delete";

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

export interface BackupSftpTarget {
  id: string;
  type: "sftp";
  label: string;
  host: string;
  /** Port, default 22 */
  port: number;
  username: string;
  /** Password stored encrypted via crypto.ts (mutually exclusive with privateKey) */
  password?: string;
  /** PEM private key content stored encrypted via crypto.ts */
  privateKey?: string;
  /** Remote directory path, e.g. "/backups/docit/" */
  remotePath: string;
}

export type BackupTarget = BackupLocalTarget | BackupCifsTarget | BackupSftpTarget;

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

// === Snapshots ===

export interface SnapshotEntry {
  id: string;
  label: string;
  createdAt: string;
  sizeBytes: number;
}

// === User Groups ===

export interface UserGroup {
  id: string;
  name: string;
  description: string;
  members: string[];      // usernames
  createdAt: string;
}

export interface UserGroupsData {
  groups: UserGroup[];
}

// === Dashboard ===

export interface DashboardLink {
  id: string;
  title: string;
  description: string;
  url: string;
  icon: string;             // emoji, URL, "favicon", "si-*", "lucide-*"
  color: string;            // hex accent for the card
  openInNewTab: boolean;
  sectionId: string;
  order: number;
  visibleToGroups: string[]; // user group IDs — empty = visible to everyone
}

export interface DashboardSection {
  id: string;
  name: string;
  icon: string;
  color: string;
  order: number;
  collapsed: boolean;
}

export interface DashboardData {
  sections: DashboardSection[];
  links: DashboardLink[];
}

export type DashboardRole = "admin" | "viewer" | "none";

export interface DashboardAccessConfig {
  /** Usernames explicitly granted dashboard view access */
  allowedUsers: string[];
  /** AD group DNs whose members may view the dashboard */
  allowedAdGroups: string[];
}

// === PKI / Certificate Manager ===

export type PkiKeyAlgorithm =
  | "RSA-2048"
  | "RSA-4096"
  | "EC-P256"
  | "EC-P384"
  | "EC-P521"
  | "Ed25519";

export type PkiCertType =
  | "root-ca"
  | "intermediate-ca"
  | "tls-server"
  | "tls-client"
  | "code-signing"
  | "email"
  | "other";

export type PkiRevocationReason =
  | "unspecified"
  | "key-compromise"
  | "ca-compromise"
  | "affiliation-changed"
  | "superseded"
  | "cessation-of-operation"
  | "certificate-hold";

export type PkiExportFormat =
  | "PEM"
  | "DER"
  | "PKCS7"
  | "PKCS7-chain"
  | "PKCS12"
  | "PFX"
  | "PEM-chain"
  | "PEM+key"
  | "cert-index";

export interface PkiSubject {
  CN: string;
  O?: string;
  OU?: string;
  C?: string;
  ST?: string;
  L?: string;
  emailAddress?: string;
}

export interface PkiExtensions {
  san?: string[];                 // Subject Alternative Names (DNS:foo, IP:1.2.3.4, email:...
  keyUsage?: string[];            // digitalSignature, keyCertSign, cRLSign, ...
  keyUsageCritical?: boolean;
  extKeyUsage?: string[];         // serverAuth, clientAuth, codeSigning, emailProtection, ...
  extKeyUsageCritical?: boolean;
  isCA?: boolean;
  basicConstraintsCritical?: boolean;
  pathLen?: number;               // BasicConstraints pathLenConstraint
  subjectKeyIdentifier?: boolean;
  authorityKeyIdentifier?: boolean;
  crlDistributionPoints?: string[];
  ocspResponders?: string[];
}

export interface PkiPrivateKey {
  id: string;
  name: string;
  comment: string;
  algorithm: PkiKeyAlgorithm;
  /** AES-256-GCM encrypted PEM via crypto.ts encryptField */
  pemEncrypted: string;
  /** Unencrypted PEM of the public key */
  publicKeyPem: string;
  /** SHA-256 fingerprint (hex) of the public key */
  fingerprint: string;
  createdAt: string;
  createdBy: string;
  allowedUsers: string[];
  allowedGroups: string[];
}

export interface PkiCsr {
  id: string;
  name: string;
  comment: string;
  subject: PkiSubject;
  extensions: PkiExtensions;
  /** PEM-encoded PKCS#10 CSR */
  pem: string;
  /** ID of the private key in this store used to create the CSR (if generated here) */
  keyId?: string;
  /** ID of the certificate that was issued from this CSR */
  signedCertId?: string;
  createdAt: string;
  createdBy: string;
  allowedUsers: string[];
  allowedGroups: string[];
}

export interface PkiCertificate {
  id: string;
  name: string;
  comment: string;
  type: PkiCertType;
  subject: PkiSubject;
  issuer: PkiSubject;
  /** Hex-encoded serial number */
  serial: string;
  /** ID of the issuing certificate in this store */
  issuerId?: string;
  /** ID of the private key in this store corresponding to this cert */
  keyId?: string;
  /** ID of the CSR this cert was issued from */
  csrId?: string;
  /** PEM-encoded certificate */
  pem: string;
  notBefore: string;
  notAfter: string;
  /** SHA-1 fingerprint (hex, colon-separated) */
  fingerprintSha1: string;
  /** SHA-256 fingerprint (hex, colon-separated) */
  fingerprintSha256: string;
  isRevoked: boolean;
  revokedAt?: string;
  revokeReason?: PkiRevocationReason;
  /** Tracks which expiry alert has already been sent (prevents re-alerting) */
  lastAlertedThreshold?: 30 | 7 | 1;
  createdAt: string;
  createdBy: string;
  allowedUsers: string[];
  allowedGroups: string[];
}

export interface PkiCrl {
  id: string;
  /** ID of the CA certificate that issued this CRL */
  caId: string;
  /** PEM-encoded CRL */
  pem: string;
  thisUpdate: string;
  nextUpdate: string;
  revokedCount: number;
  createdAt: string;
  createdBy: string;
}

export interface PkiTemplate {
  id: string;
  name: string;
  type: PkiCertType;
  subject: Partial<PkiSubject>;
  extensions: PkiExtensions;
  /** Default validity period in days */
  validityDays: number;
  createdAt: string;
}

export interface PkiStore {
  keys: PkiPrivateKey[];
  csrs: PkiCsr[];
  certs: PkiCertificate[];
  crls: PkiCrl[];
  templates: PkiTemplate[];
}

export interface PkiCertNode extends PkiCertificate {
  children: PkiCertNode[];
}

// === Crash Logging ===

export type CrashSource = "server" | "client";
export type CrashLevel = "error" | "fatal";

export interface CrashEntry {
  id: string;
  timestamp: string;
  source: CrashSource;
  level: CrashLevel;
  message: string;
  stack?: string;
  url?: string;
  method?: string;
  userAgent?: string;
  details?: Record<string, unknown>;
}
