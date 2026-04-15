"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  BookOpen,
  Play,
  FlaskConical,
  ChevronDown,
  ChevronRight,
  CheckCircle,
  XCircle,
  Loader2,
  Copy,
  Check,
  Send,
} from "lucide-react";
import { copyToClipboard } from "@/lib/clipboard";

// ── Types ──────────────────────────────────────────────────────────────────────

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
type AuthLevel = "none" | "user" | "admin";
type ParamType = "path" | "body" | "query";

interface ParamDef {
  name: string;
  type: ParamType;
  required: boolean;
  description: string;
  example?: string;
}

interface EndpointDef {
  id: string;
  method: Method;
  path: string; // uses {param} notation
  summary: string;
  description?: string;
  auth: AuthLevel;
  params?: ParamDef[];
}

interface EndpointGroup {
  name: string;
  endpoints: EndpointDef[];
}

// ── Endpoint catalog ───────────────────────────────────────────────────────────

const GROUPS: EndpointGroup[] = [
  {
    name: "Authentication",
    endpoints: [
      { id: "get-me", method: "GET", path: "/api/auth/me", summary: "Get current authenticated user", auth: "user" },
      {
        id: "login", method: "POST", path: "/api/auth/login", summary: "Log in with username + password", auth: "none",
        params: [
          { name: "username", type: "body", required: true, description: "Username", example: "admin" },
          { name: "password", type: "body", required: true, description: "Password", example: "secret" },
        ],
      },
      { id: "logout", method: "POST", path: "/api/auth/logout", summary: "End the current session", auth: "user" },
      {
        id: "register", method: "POST", path: "/api/auth/register", summary: "Register a new account (when open)", auth: "none",
        params: [
          { name: "username", type: "body", required: true, description: "Username" },
          { name: "password", type: "body", required: true, description: "Password (min 6 chars)" },
        ],
      },
      { id: "get-profile", method: "GET", path: "/api/auth/profile", summary: "Get profile (fullName, email, preferences)", auth: "user" },
      {
        id: "put-profile", method: "PUT", path: "/api/auth/profile", summary: "Update profile or change password", auth: "user",
        params: [
          { name: "fullName", type: "body", required: false, description: "Display name" },
          { name: "email", type: "body", required: false, description: "Email address" },
          { name: "currentPassword", type: "body", required: false, description: "Required when changing password" },
          { name: "newPassword", type: "body", required: false, description: "New password" },
        ],
      },
      { id: "get-admins", method: "GET", path: "/api/auth/admins", summary: "List admin users (username + email)", auth: "user" },
    ],
  },
  {
    name: "API Keys",
    endpoints: [
      { id: "list-api-keys", method: "GET", path: "/api/auth/api-keys", summary: "List your API keys", auth: "user" },
      {
        id: "create-api-key", method: "POST", path: "/api/auth/api-keys", summary: "Create an API key", auth: "user",
        params: [
          { name: "name", type: "body", required: true, description: "Descriptive name", example: "CI pipeline" },
          { name: "expiresAt", type: "body", required: false, description: "ISO 8601 expiry date (omit for no expiry)", example: "2026-12-31T00:00:00.000Z" },
        ],
      },
      {
        id: "revoke-api-key", method: "DELETE", path: "/api/auth/api-keys/{id}", summary: "Revoke an API key", auth: "user",
        params: [{ name: "id", type: "path", required: true, description: "Key UUID" }],
      },
    ],
  },
  {
    name: "Service Keys (Admin)",
    endpoints: [
      { id: "list-svc-keys", method: "GET", path: "/api/admin/service-keys", summary: "List all service keys", auth: "admin" },
      {
        id: "create-svc-key", method: "POST", path: "/api/admin/service-keys", summary: "Create a service key", auth: "admin",
        params: [
          { name: "name", type: "body", required: true, description: "Descriptive name" },
          { name: "permissions", type: "body", required: true, description: 'Object: {"spaceSlug":"reader|writer|admin"} — use "*" for all spaces', example: '{"*":"reader"}' },
          { name: "expiresAt", type: "body", required: false, description: "ISO 8601 expiry date (optional)" },
        ],
      },
      {
        id: "revoke-svc-key", method: "DELETE", path: "/api/admin/service-keys/{id}", summary: "Revoke a service key", auth: "admin",
        params: [{ name: "id", type: "path", required: true, description: "Key UUID" }],
      },
    ],
  },
  {
    name: "Spaces",
    endpoints: [
      { id: "list-spaces", method: "GET", path: "/api/spaces", summary: "List all accessible spaces", auth: "user" },
      {
        id: "create-space", method: "POST", path: "/api/spaces", summary: "Create a space (admin)", auth: "admin",
        params: [{ name: "name", type: "body", required: true, description: "Space display name" }],
      },
      {
        id: "get-space", method: "GET", path: "/api/spaces/{slug}", summary: "Get a single space", auth: "user",
        params: [{ name: "slug", type: "path", required: true, description: "Space slug", example: "my-space" }],
      },
      {
        id: "update-space", method: "PUT", path: "/api/spaces/{slug}", summary: "Update space name or permissions", auth: "user",
        params: [
          { name: "slug", type: "path", required: true, description: "Space slug" },
          { name: "name", type: "body", required: false, description: "New name" },
          { name: "permissions", type: "body", required: false, description: 'Object: {"username":"reader|writer|admin"}' },
        ],
      },
      {
        id: "delete-space", method: "DELETE", path: "/api/spaces/{slug}", summary: "Delete a space (admin)", auth: "admin",
        params: [{ name: "slug", type: "path", required: true, description: "Space slug" }],
      },
      {
        id: "get-members", method: "GET", path: "/api/spaces/{slug}/members", summary: "List space members with roles", auth: "user",
        params: [{ name: "slug", type: "path", required: true, description: "Space slug" }],
      },
      {
        id: "get-statuses", method: "GET", path: "/api/spaces/{slug}/statuses", summary: "Get document status map", auth: "user",
        params: [{ name: "slug", type: "path", required: true, description: "Space slug" }],
      },
      {
        id: "get-tags", method: "GET", path: "/api/spaces/{slug}/tags", summary: "List all tags in a space", auth: "user",
        params: [{ name: "slug", type: "path", required: true, description: "Space slug" }],
      },
    ],
  },
  {
    name: "Documents",
    endpoints: [
      {
        id: "list-docs", method: "GET", path: "/api/spaces/{slug}/docs", summary: "List documents (optionally filtered by category)", auth: "user",
        params: [
          { name: "slug", type: "path", required: true, description: "Space slug" },
          { name: "category", type: "query", required: false, description: "Category path filter" },
        ],
      },
      {
        id: "create-doc", method: "POST", path: "/api/spaces/{slug}/docs", summary: "Create a document", auth: "user",
        params: [
          { name: "slug", type: "path", required: true, description: "Space slug" },
          { name: "name", type: "body", required: true, description: "File name (no extension)" },
          { name: "category", type: "body", required: true, description: "Category path" },
          { name: "content", type: "body", required: false, description: "Initial Markdown content" },
        ],
      },
      {
        id: "get-doc", method: "GET", path: "/api/spaces/{slug}/docs/{name}", summary: "Get document content + metadata", auth: "user",
        params: [
          { name: "slug", type: "path", required: true, description: "Space slug" },
          { name: "name", type: "path", required: true, description: "Document name" },
          { name: "category", type: "query", required: true, description: "Category path" },
        ],
      },
      {
        id: "update-doc", method: "PUT", path: "/api/spaces/{slug}/docs/{name}", summary: "Update document content", auth: "user",
        params: [
          { name: "slug", type: "path", required: true, description: "Space slug" },
          { name: "name", type: "path", required: true, description: "Document name" },
          { name: "content", type: "body", required: true, description: "New Markdown content" },
          { name: "category", type: "body", required: true, description: "Category path" },
        ],
      },
      {
        id: "delete-doc", method: "DELETE", path: "/api/spaces/{slug}/docs/{name}", summary: "Delete (archive) a document", auth: "user",
        params: [
          { name: "slug", type: "path", required: true, description: "Space slug" },
          { name: "name", type: "path", required: true, description: "Document name" },
          { name: "category", type: "query", required: true, description: "Category path" },
        ],
      },
      {
        id: "rename-doc", method: "POST", path: "/api/spaces/{slug}/docs/{name}/rename", summary: "Rename a document", auth: "user",
        params: [
          { name: "slug", type: "path", required: true, description: "Space slug" },
          { name: "name", type: "path", required: true, description: "Current name" },
          { name: "newName", type: "body", required: true, description: "New name" },
          { name: "category", type: "body", required: true, description: "Category path" },
        ],
      },
      {
        id: "move-doc", method: "POST", path: "/api/spaces/{slug}/docs/{name}/move", summary: "Move document to another category", auth: "user",
        params: [
          { name: "slug", type: "path", required: true, description: "Space slug" },
          { name: "name", type: "path", required: true, description: "Document name" },
          { name: "sourceCategory", type: "body", required: true, description: "Source category" },
          { name: "category", type: "body", required: true, description: "Target category" },
        ],
      },
      {
        id: "set-doc-status", method: "PUT", path: "/api/spaces/{slug}/docs/{name}/status", summary: "Set document review status", auth: "user",
        params: [
          { name: "slug", type: "path", required: true, description: "Space slug" },
          { name: "name", type: "path", required: true, description: "Document name" },
          { name: "status", type: "body", required: true, description: '"draft" | "in-review" | "published"' },
          { name: "category", type: "body", required: true, description: "Category path" },
        ],
      },
      {
        id: "list-doc-history", method: "GET", path: "/api/spaces/{slug}/docs/{name}/history", summary: "List document revisions", auth: "user",
        params: [
          { name: "slug", type: "path", required: true, description: "Space slug" },
          { name: "name", type: "path", required: true, description: "Document name" },
          { name: "category", type: "query", required: true, description: "Category path" },
        ],
      },
    ],
  },
  {
    name: "Categories",
    endpoints: [
      {
        id: "list-categories", method: "GET", path: "/api/spaces/{slug}/categories", summary: "List all categories", auth: "user",
        params: [{ name: "slug", type: "path", required: true, description: "Space slug" }],
      },
      {
        id: "create-category", method: "POST", path: "/api/spaces/{slug}/categories", summary: "Create a category", auth: "user",
        params: [
          { name: "slug", type: "path", required: true, description: "Space slug" },
          { name: "name", type: "body", required: true, description: "Category name" },
          { name: "parentPath", type: "body", required: false, description: "Parent category (for nesting)" },
        ],
      },
    ],
  },
  {
    name: "Enhanced Tables",
    endpoints: [
      {
        id: "list-dbs", method: "GET", path: "/api/spaces/{slug}/databases", summary: "List enhanced tables", auth: "user",
        params: [{ name: "slug", type: "path", required: true, description: "Space slug" }],
      },
      {
        id: "create-db", method: "POST", path: "/api/spaces/{slug}/databases", summary: "Create an enhanced table", auth: "user",
        params: [
          { name: "slug", type: "path", required: true, description: "Space slug" },
          { name: "name", type: "body", required: true, description: "Table name" },
          { name: "columns", type: "body", required: true, description: 'Array of column defs: [{name,type}]', example: '[{"name":"Title","type":"text"}]' },
        ],
      },
      {
        id: "get-db", method: "GET", path: "/api/spaces/{slug}/databases/{dbId}", summary: "Get enhanced table schema", auth: "user",
        params: [
          { name: "slug", type: "path", required: true, description: "Space slug" },
          { name: "dbId", type: "path", required: true, description: "Enhanced Table ID" },
        ],
      },
      {
        id: "list-rows", method: "GET", path: "/api/spaces/{slug}/databases/{dbId}/rows", summary: "List enhanced table rows", auth: "user",
        params: [
          { name: "slug", type: "path", required: true, description: "Space slug" },
          { name: "dbId", type: "path", required: true, description: "Enhanced Table ID" },
        ],
      },
      {
        id: "create-row", method: "POST", path: "/api/spaces/{slug}/databases/{dbId}/rows", summary: "Create a row", auth: "user",
        params: [
          { name: "slug", type: "path", required: true, description: "Space slug" },
          { name: "dbId", type: "path", required: true, description: "Enhanced Table ID" },
          { name: "data", type: "body", required: true, description: "Object: column name → value", example: '{"Title":"My row"}' },
        ],
      },
    ],
  },
  {
    name: "Attachments",
    endpoints: [
      {
        id: "list-attachments", method: "GET", path: "/api/spaces/{slug}/attachments", summary: "List attachments", auth: "user",
        params: [{ name: "slug", type: "path", required: true, description: "Space slug" }],
      },
    ],
  },
  {
    name: "CMDB",
    endpoints: [
      { id: "cmdb-list", method: "GET", path: "/api/cmdb", summary: "List all CMDB data (CIs, types, relationships, services, compliance, vulnerabilities, etc.)", auth: "user",
        params: [
          { name: "q", type: "query", required: false, description: "Search query (min 2 chars)" },
          { name: "containerId", type: "query", required: false, description: "Filter by container/group ID" },
        ],
      },
      { id: "cmdb-create-ci", method: "POST", path: "/api/cmdb", summary: "Create a CI", auth: "user",
        params: [
          { name: "action", type: "body", required: true, description: '"createAsset"', example: "createAsset" },
          { name: "name", type: "body", required: true, description: "CI name / hostname" },
          { name: "containerId", type: "body", required: true, description: "Group ID" },
          { name: "typeId", type: "body", required: false, description: "CI type ID (e.g. type-server)" },
          { name: "ipAddresses", type: "body", required: false, description: "Array of IP addresses" },
          { name: "tags", type: "body", required: false, description: "Array of tag strings" },
        ],
      },
      { id: "cmdb-update-ci", method: "POST", path: "/api/cmdb", summary: "Update a CI", auth: "user",
        params: [
          { name: "action", type: "body", required: true, description: '"updateCmdbItem"', example: "updateCmdbItem" },
          { name: "id", type: "body", required: true, description: "CI ID (e.g. AST-0001)" },
          { name: "name", type: "body", required: false, description: "New name" },
          { name: "status", type: "body", required: false, description: '"Active" | "Maintenance" | "Decommissioned" | "Ordered"' },
          { name: "tags", type: "body", required: false, description: "Array of tag strings" },
        ],
      },
      { id: "cmdb-delete-ci", method: "POST", path: "/api/cmdb", summary: "Delete a CI", auth: "user",
        params: [
          { name: "action", type: "body", required: true, description: '"deleteCmdbItem"', example: "deleteCmdbItem" },
          { name: "id", type: "body", required: true, description: "CI ID" },
        ],
      },
      { id: "cmdb-bulk-update", method: "POST", path: "/api/cmdb", summary: "Bulk update CIs", auth: "user",
        params: [
          { name: "action", type: "body", required: true, description: '"bulkUpdate"', example: "bulkUpdate" },
          { name: "ids", type: "body", required: true, description: "Array of CI IDs" },
          { name: "updates", type: "body", required: true, description: 'Object: {status?, owner?, typeId?, containerId?, addTags?}' },
        ],
      },
      { id: "cmdb-agent-report", method: "POST", path: "/api/cmdb/agent-report", summary: "Submit agent inventory report", auth: "user",
        params: [
          { name: "hostname", type: "body", required: true, description: "Machine hostname" },
          { name: "os", type: "body", required: false, description: "OS name and version" },
          { name: "ipAddresses", type: "body", required: false, description: "Array of IP addresses" },
          { name: "hardwareInfo", type: "body", required: false, description: "Object: {cpu, cpuCores, ramMb, disks, nics}" },
          { name: "softwareInventory", type: "body", required: false, description: "Array: [{name, version, publisher?}]" },
        ],
      },
      { id: "cmdb-agent-script", method: "GET", path: "/api/cmdb/agent-script", summary: "Download inventory agent script", auth: "none",
        params: [
          { name: "os", type: "query", required: false, description: '"linux" | "macos" | "windows" (default: linux)' },
          { name: "key", type: "query", required: false, description: "Service API key to embed in script" },
          { name: "url", type: "query", required: false, description: "Base URL (default: current host)" },
        ],
      },
      { id: "cmdb-scan", method: "POST", path: "/api/cmdb", summary: "Run network scan", auth: "user",
        params: [
          { name: "action", type: "body", required: true, description: '"runScan"', example: "runScan" },
          { name: "configId", type: "body", required: true, description: "Scan config ID" },
        ],
      },
      { id: "cmdb-create-vuln", method: "POST", path: "/api/cmdb", summary: "Create a vulnerability entry", auth: "user",
        params: [
          { name: "action", type: "body", required: true, description: '"createVulnerability"', example: "createVulnerability" },
          { name: "title", type: "body", required: true, description: "Vulnerability title" },
          { name: "cveId", type: "body", required: false, description: "CVE ID (e.g. CVE-2024-1234)" },
          { name: "severity", type: "body", required: false, description: '"critical" | "high" | "medium" | "low"' },
          { name: "affectedAssetIds", type: "body", required: false, description: "Array of CI IDs" },
        ],
      },
      { id: "cmdb-create-cr", method: "POST", path: "/api/cmdb", summary: "Create a change request (RFC)", auth: "user",
        params: [
          { name: "action", type: "body", required: true, description: '"createChangeRequest"', example: "createChangeRequest" },
          { name: "title", type: "body", required: true, description: "Change request title" },
          { name: "risk", type: "body", required: false, description: '"low" | "medium" | "high" | "critical"' },
          { name: "rollbackPlan", type: "body", required: false, description: "Rollback plan description" },
          { name: "affectedAssetIds", type: "body", required: false, description: "Array of CI IDs" },
        ],
      },
      { id: "cmdb-impact", method: "POST", path: "/api/cmdb", summary: "Analyze impact of a CI", auth: "user",
        params: [
          { name: "action", type: "body", required: true, description: '"analyzeImpact"', example: "analyzeImpact" },
          { name: "assetId", type: "body", required: true, description: "CI ID to analyze" },
          { name: "direction", type: "body", required: false, description: '"upstream" | "downstream" | "both" (default: both)' },
          { name: "maxDepth", type: "body", required: false, description: "Max traversal depth (default: 10)" },
        ],
      },
    ],
  },
  {
    name: "Users (Admin)",
    endpoints: [
      { id: "list-users", method: "GET", path: "/api/users", summary: "List all users", auth: "admin" },
      {
        id: "create-user", method: "POST", path: "/api/users", summary: "Create a user", auth: "admin",
        params: [
          { name: "username", type: "body", required: true, description: "Username" },
          { name: "password", type: "body", required: true, description: "Password" },
          { name: "isAdmin", type: "body", required: false, description: "Boolean" },
        ],
      },
      {
        id: "update-user", method: "PUT", path: "/api/users/{username}", summary: "Toggle user admin status", auth: "admin",
        params: [
          { name: "username", type: "path", required: true, description: "Username" },
          { name: "isAdmin", type: "body", required: true, description: "Boolean" },
        ],
      },
      {
        id: "delete-user", method: "DELETE", path: "/api/users/{username}", summary: "Delete a user", auth: "admin",
        params: [{ name: "username", type: "path", required: true, description: "Username" }],
      },
    ],
  },
  {
    name: "On-Call Reports",
    endpoints: [
      {
        id: "list-oncall", method: "GET", path: "/api/oncall", summary: "List on-call entries with optional filtering", auth: "user",
        params: [
          { name: "from", type: "query", required: false, description: "Start date (YYYY-MM-DD)" },
          { name: "to", type: "query", required: false, description: "End date (YYYY-MM-DD)" },
          { name: "q", type: "query", required: false, description: "Search text" },
        ],
      },
      {
        id: "create-oncall", method: "POST", path: "/api/oncall", summary: "Create an on-call report entry", auth: "user",
        params: [
          { name: "date", type: "body", required: true, description: "Date (YYYY-MM-DD)", example: "2026-04-15" },
          { name: "time", type: "body", required: true, description: "Time (HH:MM)", example: "03:15" },
          { name: "description", type: "body", required: true, description: "Problem description" },
          { name: "workingTime", type: "body", required: false, description: "Duration (e.g. 1h30m, 45m)" },
          { name: "solution", type: "body", required: false, description: "Solution description" },
          { name: "assistedBy", type: "body", required: false, description: "Array of usernames who assisted" },
        ],
      },
      {
        id: "get-oncall", method: "GET", path: "/api/oncall/{id}", summary: "Get a single on-call entry", auth: "user",
        params: [{ name: "id", type: "path", required: true, description: "On-call entry ID (e.g. ONC-000001)" }],
      },
      {
        id: "update-oncall-solution", method: "PATCH", path: "/api/oncall/{id}", summary: "Update the solution field (only field editable after creation)", auth: "user",
        params: [
          { name: "id", type: "path", required: true, description: "On-call entry ID" },
          { name: "solution", type: "body", required: true, description: "Updated solution text" },
        ],
      },
      {
        id: "delete-oncall", method: "DELETE", path: "/api/oncall/{id}", summary: "Delete an on-call entry (admin only)", auth: "admin",
        params: [{ name: "id", type: "path", required: true, description: "On-call entry ID" }],
      },
      { id: "oncall-stats", method: "GET", path: "/api/oncall/stats", summary: "Get on-call statistics, per-registrar breakdown, and heatmap", auth: "user",
        params: [{ name: "days", type: "query", required: false, description: "Heatmap period in days (default 90)" }],
      },
      { id: "oncall-users", method: "GET", path: "/api/oncall/users", summary: "List users available for assisted-by picker", auth: "user" },
      { id: "get-oncall-settings", method: "GET", path: "/api/oncall/settings", summary: "Get on-call settings (admin)", auth: "admin" },
      {
        id: "put-oncall-settings", method: "PUT", path: "/api/oncall/settings", summary: "Update on-call settings (admin)", auth: "admin",
        params: [
          { name: "allowedUsers", type: "body", required: false, description: "Array of usernames allowed to use on-call" },
          { name: "emailEnabled", type: "body", required: false, description: "Boolean — enable weekly email digest" },
          { name: "emailRecipients", type: "body", required: false, description: "Array of email addresses" },
        ],
      },
    ],
  },
  {
    name: "Change Log",
    endpoints: [
      {
        id: "list-changelog", method: "GET", path: "/api/changelog", summary: "List change log entries with optional filtering", auth: "user",
        params: [
          { name: "q", type: "query", required: false, description: "Search text" },
          { name: "from", type: "query", required: false, description: "Start date (YYYY-MM-DD)" },
          { name: "to", type: "query", required: false, description: "End date (YYYY-MM-DD)" },
          { name: "category", type: "query", required: false, description: "Category filter" },
          { name: "system", type: "query", required: false, description: "System name filter" },
          { name: "systems", type: "query", required: false, description: "Set to \"1\" to return known system names only" },
        ],
      },
      {
        id: "create-changelog", method: "POST", path: "/api/changelog", summary: "Create a new change log entry", auth: "user",
        params: [
          { name: "date", type: "body", required: true, description: "Date (YYYY-MM-DD)" },
          { name: "system", type: "body", required: true, description: "System or hostname affected" },
          { name: "category", type: "body", required: true, description: "Disk | Network | Security | Software | Hardware | Configuration | Other" },
          { name: "description", type: "body", required: true, description: "What was changed" },
          { name: "impact", type: "body", required: true, description: "Impact description" },
          { name: "risk", type: "body", required: true, description: "Low | Medium | High | Critical" },
          { name: "status", type: "body", required: true, description: "Completed | Failed | Rolled Back" },
        ],
      },
    ],
  },
  {
    name: "Search",
    endpoints: [
      {
        id: "search-docs", method: "GET", path: "/api/spaces/{slug}/search", summary: "Search documents, content, tags, and enhanced table rows", auth: "user",
        params: [
          { name: "slug", type: "path", required: true, description: "Space slug" },
          { name: "q", type: "query", required: true, description: "Search query (min 2 chars)" },
          { name: "category", type: "query", required: false, description: "Filter by category" },
          { name: "tag", type: "query", required: false, description: "Filter by tag" },
          { name: "author", type: "query", required: false, description: "Filter by author" },
          { name: "classification", type: "query", required: false, description: "public | internal | confidential | restricted" },
          { name: "from", type: "query", required: false, description: "Updated after date (YYYY-MM-DD)" },
          { name: "to", type: "query", required: false, description: "Updated before date (YYYY-MM-DD)" },
        ],
      },
    ],
  },
  {
    name: "Tags",
    endpoints: [
      {
        id: "list-tags", method: "GET", path: "/api/spaces/{slug}/tags", summary: "List all tags in a space with document counts", auth: "user",
        params: [{ name: "slug", type: "path", required: true, description: "Space slug" }],
      },
      {
        id: "rename-tag", method: "PATCH", path: "/api/spaces/{slug}/tags", summary: "Rename a tag across all documents and tables", auth: "user",
        params: [
          { name: "slug", type: "path", required: true, description: "Space slug" },
          { name: "oldName", type: "body", required: true, description: "Current tag name" },
          { name: "newName", type: "body", required: true, description: "New tag name" },
        ],
      },
      {
        id: "delete-tag", method: "DELETE", path: "/api/spaces/{slug}/tags", summary: "Delete a tag from all documents and tables", auth: "user",
        params: [
          { name: "slug", type: "path", required: true, description: "Space slug" },
          { name: "tagName", type: "body", required: true, description: "Tag name to delete" },
        ],
      },
    ],
  },
  {
    name: "System",
    endpoints: [
      { id: "get-version", method: "GET", path: "/api/version", summary: "Get Doc-it server version", auth: "none" },
      { id: "system-events", method: "GET", path: "/api/system/events", summary: "SSE stream for shutdown warnings and real-time notifications", auth: "user" },
      { id: "admin-shutdown", method: "POST", path: "/api/admin/shutdown", summary: "Trigger 60-second shutdown countdown for all connected clients", auth: "admin" },
    ],
  },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

const METHOD_COLORS: Record<Method, string> = {
  GET: "bg-blue-100 text-blue-700",
  POST: "bg-green-100 text-green-700",
  PUT: "bg-yellow-100 text-yellow-700",
  PATCH: "bg-orange-100 text-orange-700",
  DELETE: "bg-red-100 text-red-700",
};

const AUTH_BADGE: Record<AuthLevel, { label: string; cls: string }> = {
  none: { label: "Public", cls: "bg-gray-100 text-gray-500" },
  user: { label: "Auth required", cls: "bg-purple-100 text-purple-700" },
  admin: { label: "Admin only", cls: "bg-red-100 text-red-600" },
};

function methodBadge(m: Method) {
  return (
    <span className={`px-1.5 py-0.5 text-[10px] font-bold font-mono rounded ${METHOD_COLORS[m]}`}>
      {m}
    </span>
  );
}

function buildUrl(path: string, pathVals: Record<string, string>, queryVals: Record<string, string>) {
  let url = path.replace(/\{(\w+)\}/g, (_, k) => encodeURIComponent(pathVals[k] ?? `{${k}}`));
  const qs = Object.entries(queryVals)
    .filter(([, v]) => v.trim())
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
  if (qs) url += "?" + qs;
  return url;
}

function buildBody(ep: EndpointDef, bodyVals: Record<string, string>): string {
  const bodyParams = ep.params?.filter((p) => p.type === "body") ?? [];
  if (!bodyParams.length) return "";
  const obj: Record<string, unknown> = {};
  for (const p of bodyParams) {
    const v = bodyVals[p.name]?.trim();
    if (!v) continue;
    // Try to parse as JSON, fall back to string
    try { obj[p.name] = JSON.parse(v); } catch { obj[p.name] = v; }
  }
  return JSON.stringify(obj, null, 2);
}

// ── Documentation tab ──────────────────────────────────────────────────────────

function DocsTab() {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(["Authentication"]));
  const [copiedPath, setCopiedPath] = useState<string | null>(null);

  const toggle = (name: string) =>
    setExpanded((prev) => {
      const n = new Set(prev);
      n.has(name) ? n.delete(name) : n.add(name);
      return n;
    });

  const copyPath = async (id: string, text: string) => {
    await copyToClipboard(text);
    setCopiedPath(id);
    setTimeout(() => setCopiedPath(null), 1500);
  };

  return (
    <div className="space-y-4">
      {/* Auth info */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
        <h3 className="font-semibold text-blue-900 mb-2">Authentication</h3>
        <p className="text-sm text-blue-800 mb-3">
          All authenticated endpoints accept a bearer token in the <code className="font-mono bg-blue-100 px-1 rounded">Authorization</code> header.
          User keys inherit the owner&apos;s permissions; service keys carry explicit per-space roles.
        </p>
        <div className="font-mono text-xs bg-blue-100 rounded p-2 text-blue-900">
          Authorization: Bearer dk_u_&lt;40 hex chars&gt;
          <br />
          Authorization: Bearer dk_s_&lt;40 hex chars&gt;
        </div>
      </div>

      {GROUPS.map((g) => (
        <div key={g.name} className="bg-surface rounded-xl border border-border overflow-hidden">
          <button
            onClick={() => toggle(g.name)}
            className="w-full flex items-center justify-between px-5 py-3 hover:bg-muted/30 transition-colors"
          >
            <span className="font-semibold text-text-primary">{g.name}</span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-text-muted">{g.endpoints.length} endpoints</span>
              {expanded.has(g.name) ? <ChevronDown className="w-4 h-4 text-text-muted" /> : <ChevronRight className="w-4 h-4 text-text-muted" />}
            </div>
          </button>
          {expanded.has(g.name) && (
            <div className="divide-y divide-border border-t border-border">
              {g.endpoints.map((ep) => {
                const auth = AUTH_BADGE[ep.auth];
                return (
                  <div key={ep.id} className="px-5 py-3">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      {methodBadge(ep.method)}
                      <code className="text-sm font-mono text-text-primary">{ep.path}</code>
                      <button
                        onClick={() => copyPath(ep.id, ep.path)}
                        className="p-0.5 rounded text-text-muted hover:text-text-secondary transition-colors"
                        title="Copy path"
                      >
                        {copiedPath === ep.id ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      </button>
                      <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${auth.cls}`}>{auth.label}</span>
                    </div>
                    <p className="text-sm text-text-secondary mb-2">{ep.summary}</p>
                    {ep.params && ep.params.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {ep.params.map((p) => (
                          <div key={p.name} className="flex items-baseline gap-2 text-xs">
                            <code className="font-mono text-accent-text bg-accent-light px-1 rounded">{p.name}</code>
                            <span className={`px-1 rounded text-[10px] font-medium ${
                              p.type === "path" ? "bg-orange-100 text-orange-700" :
                              p.type === "query" ? "bg-teal-100 text-teal-700" :
                              "bg-gray-100 text-gray-600"
                            }`}>{p.type}</span>
                            {!p.required && <span className="text-text-muted italic">optional</span>}
                            <span className="text-text-muted">{p.description}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Try It tab ─────────────────────────────────────────────────────────────────

const ALL_ENDPOINTS = GROUPS.flatMap((g) => g.endpoints);

function TryItTab() {
  const [token, setToken] = useState("");
  const [selectedId, setSelectedId] = useState(ALL_ENDPOINTS[0].id);
  const [pathVals, setPathVals] = useState<Record<string, string>>({});
  const [queryVals, setQueryVals] = useState<Record<string, string>>({});
  const [bodyVals, setBodyVals] = useState<Record<string, string>>({});
  const [response, setResponse] = useState<{ status: number; body: string } | null>(null);
  const [running, setRunning] = useState(false);

  const ep = ALL_ENDPOINTS.find((e) => e.id === selectedId)!;

  const handleSelect = (id: string) => {
    setSelectedId(id);
    setPathVals({});
    setQueryVals({});
    setBodyVals({});
    setResponse(null);
  };

  const previewUrl = buildUrl(ep.path, pathVals, queryVals);

  const run = async () => {
    setRunning(true);
    setResponse(null);
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const bodyStr = buildBody(ep, bodyVals);
    if (bodyStr) headers["Content-Type"] = "application/json";

    try {
      const res = await fetch(previewUrl, {
        method: ep.method,
        headers,
        body: bodyStr || undefined,
      });
      let body = "";
      try { body = JSON.stringify(await res.json(), null, 2); } catch { body = await res.text(); }
      setResponse({ status: res.status, body });
    } catch (err) {
      setResponse({ status: 0, body: String(err) });
    } finally {
      setRunning(false);
    }
  };

  const pathParams = ep.params?.filter((p) => p.type === "path") ?? [];
  const queryParams = ep.params?.filter((p) => p.type === "query") ?? [];
  const bodyParams = ep.params?.filter((p) => p.type === "body") ?? [];

  return (
    <div className="grid grid-cols-[260px_1fr] gap-5 min-h-[70vh]">
      {/* Endpoint picker */}
      <div className="bg-surface rounded-xl border border-border overflow-hidden self-start">
        {GROUPS.map((g) => (
          <div key={g.name}>
            <div className="px-3 py-1.5 text-[10px] font-semibold text-text-muted uppercase tracking-wider bg-muted/30 border-b border-border">
              {g.name}
            </div>
            {g.endpoints.map((e) => (
              <button
                key={e.id}
                onClick={() => handleSelect(e.id)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm border-b border-border/50 last:border-0 transition-colors ${
                  e.id === selectedId ? "bg-accent-light text-accent-text" : "hover:bg-muted/30 text-text-secondary"
                }`}
              >
                <span className={`text-[9px] font-bold font-mono px-1 py-0.5 rounded ${METHOD_COLORS[e.method]}`}>{e.method}</span>
                <span className="truncate text-xs">{e.summary}</span>
              </button>
            ))}
          </div>
        ))}
      </div>

      {/* Request form */}
      <div className="space-y-4">
        {/* Token */}
        <div className="bg-surface rounded-xl border border-border p-4">
          <label className="block text-xs font-medium text-gray-600 mb-1">Bearer Token (API key or leave blank for cookie session)</label>
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            className="w-full px-3 py-1.5 text-sm font-mono border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[var(--color-input-bg)] text-text-primary"
            placeholder="dk_u_... or dk_s_..."
          />
        </div>

        {/* Endpoint + params */}
        <div className="bg-surface rounded-xl border border-border p-4 space-y-3">
          <div className="flex items-center gap-2">
            {methodBadge(ep.method)}
            <code className="text-sm font-mono text-text-primary flex-1">{previewUrl}</code>
          </div>

          {pathParams.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">Path Parameters</p>
              <div className="space-y-2">
                {pathParams.map((p) => (
                  <div key={p.name} className="flex items-center gap-2">
                    <label className="text-xs font-mono text-orange-700 w-24 shrink-0">{p.name}</label>
                    <input
                      type="text"
                      value={pathVals[p.name] ?? ""}
                      onChange={(e) => setPathVals({ ...pathVals, [p.name]: e.target.value })}
                      placeholder={p.example ?? p.description}
                      className="flex-1 px-2 py-1 text-sm border border-border rounded focus:outline-none focus:ring-1 focus:ring-blue-400 bg-[var(--color-input-bg)] text-text-primary"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {queryParams.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">Query Parameters</p>
              <div className="space-y-2">
                {queryParams.map((p) => (
                  <div key={p.name} className="flex items-center gap-2">
                    <label className="text-xs font-mono text-teal-700 w-24 shrink-0">{p.name}</label>
                    <input
                      type="text"
                      value={queryVals[p.name] ?? ""}
                      onChange={(e) => setQueryVals({ ...queryVals, [p.name]: e.target.value })}
                      placeholder={p.example ?? p.description}
                      className="flex-1 px-2 py-1 text-sm border border-border rounded focus:outline-none focus:ring-1 focus:ring-blue-400 bg-[var(--color-input-bg)] text-text-primary"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {bodyParams.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">Body Parameters</p>
              <div className="space-y-2">
                {bodyParams.map((p) => (
                  <div key={p.name} className="flex items-start gap-2">
                    <label className="text-xs font-mono text-gray-600 w-24 shrink-0 pt-1.5">
                      {p.name}{p.required && <span className="text-red-500">*</span>}
                    </label>
                    <input
                      type="text"
                      value={bodyVals[p.name] ?? ""}
                      onChange={(e) => setBodyVals({ ...bodyVals, [p.name]: e.target.value })}
                      placeholder={p.example ?? p.description}
                      className="flex-1 px-2 py-1 text-sm border border-border rounded focus:outline-none focus:ring-1 focus:ring-blue-400 bg-[var(--color-input-bg)] text-text-primary"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={run}
            disabled={running}
            className="flex items-center gap-2 px-4 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-accent-hover disabled:opacity-50 transition-colors"
          >
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {running ? "Sending…" : "Send Request"}
          </button>
        </div>

        {/* Response */}
        {response && (
          <div className="bg-surface rounded-xl border border-border p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className={`px-2 py-0.5 text-xs font-bold rounded ${
                response.status >= 200 && response.status < 300 ? "bg-green-100 text-green-700" :
                response.status >= 400 ? "bg-red-100 text-red-700" :
                "bg-gray-100 text-gray-600"
              }`}>
                {response.status || "Error"}
              </span>
              <span className="text-xs text-text-muted">Response</span>
            </div>
            <pre className="text-xs font-mono text-text-primary bg-[var(--color-surface-alt)] rounded p-3 overflow-auto max-h-80 whitespace-pre-wrap">
              {response.body}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Tests tab ──────────────────────────────────────────────────────────────────

interface TestCase {
  id: string;
  label: string;
  run: (token: string) => Promise<{ ok: boolean; message: string }>;
}

const TEST_SUITE: TestCase[] = [
  {
    id: "unauth-me",
    label: "GET /api/auth/me without auth returns 401",
    run: async () => {
      const res = await fetch("/api/auth/me", { headers: {} });
      // 401 expected (or needsSetup which is a 200 with needsSetup:true)
      const data = await res.json().catch(() => ({}));
      if (res.status === 401 || data.needsSetup) return { ok: true, message: `Status ${res.status} ✓` };
      return { ok: false, message: `Expected 401, got ${res.status}` };
    },
  },
  {
    id: "auth-me",
    label: "GET /api/auth/me with valid token returns user",
    run: async (token) => {
      if (!token) return { ok: false, message: "No token provided — skip" };
      const res = await fetch("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 200) {
        const data = await res.json();
        if (data.user?.username) return { ok: true, message: `Authenticated as "${data.user.username}" ✓` };
      }
      return { ok: false, message: `Status ${res.status}` };
    },
  },
  {
    id: "fake-token",
    label: "GET /api/auth/me with invalid token returns 401",
    run: async () => {
      const res = await fetch("/api/auth/me", { headers: { Authorization: "Bearer dk_u_0000000000000000000000000000000000000000000000" } });
      if (res.status === 401) return { ok: true, message: "Status 401 ✓" };
      return { ok: false, message: `Expected 401, got ${res.status}` };
    },
  },
  {
    id: "list-api-keys",
    label: "GET /api/auth/api-keys returns keys array",
    run: async (token) => {
      if (!token) return { ok: false, message: "No token — skip" };
      const res = await fetch("/api/auth/api-keys", { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 200) {
        const data = await res.json();
        if (Array.isArray(data.keys)) return { ok: true, message: `${data.keys.length} key(s) ✓` };
      }
      return { ok: false, message: `Status ${res.status}` };
    },
  },
  {
    id: "create-key-no-name",
    label: "POST /api/auth/api-keys with missing name returns 400",
    run: async (token) => {
      if (!token) return { ok: false, message: "No token — skip" };
      const res = await fetch("/api/auth/api-keys", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res.status === 400) return { ok: true, message: "Status 400 ✓" };
      return { ok: false, message: `Expected 400, got ${res.status}` };
    },
  },
  {
    id: "list-spaces",
    label: "GET /api/spaces returns array",
    run: async (token) => {
      if (!token) return { ok: false, message: "No token — skip" };
      const res = await fetch("/api/spaces", { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 200) {
        const data = await res.json();
        if (Array.isArray(data)) return { ok: true, message: `${data.length} space(s) ✓` };
      }
      return { ok: false, message: `Status ${res.status}` };
    },
  },
  {
    id: "spaces-unauth",
    label: "GET /api/spaces without auth returns 401",
    run: async () => {
      const res = await fetch("/api/spaces");
      if (res.status === 401) return { ok: true, message: "Status 401 ✓" };
      return { ok: false, message: `Expected 401, got ${res.status}` };
    },
  },
  {
    id: "list-users-nonadmin",
    label: "GET /api/users with non-admin user key returns 403",
    run: async (token) => {
      if (!token) return { ok: false, message: "No token — skip" };
      // We cannot know ahead of time if this token is admin.
      // Check the /api/auth/me first to determine role.
      const meRes = await fetch("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } });
      if (!meRes.ok) return { ok: false, message: "Could not determine user role" };
      const me = await meRes.json();
      const res = await fetch("/api/users", { headers: { Authorization: `Bearer ${token}` } });
      if (me.user?.isAdmin) {
        if (res.status === 200) return { ok: true, message: "Admin: Status 200 ✓" };
        return { ok: false, message: `Admin expected 200, got ${res.status}` };
      } else {
        if (res.status === 403) return { ok: true, message: "Non-admin: Status 403 ✓" };
        return { ok: false, message: `Non-admin expected 403, got ${res.status}` };
      }
    },
  },
  {
    id: "svc-keys-nonadmin",
    label: "GET /api/admin/service-keys without admin returns 403",
    run: async (token) => {
      if (!token) return { ok: false, message: "No token — skip" };
      const meRes = await fetch("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } });
      if (!meRes.ok) return { ok: false, message: "Could not determine user role" };
      const me = await meRes.json();
      if (me.user?.isAdmin) return { ok: true, message: "Admin user — test not applicable ✓" };
      const res = await fetch("/api/admin/service-keys", { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 403) return { ok: true, message: "Non-admin: Status 403 ✓" };
      return { ok: false, message: `Non-admin expected 403, got ${res.status}` };
    },
  },
  {
    id: "profile-update",
    label: "PUT /api/auth/profile with invalid body returns 400 or processes gracefully",
    run: async (token) => {
      if (!token) return { ok: false, message: "No token — skip" };
      const res = await fetch("/api/auth/profile", {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: "wrongpassword", newPassword: "newpass123" }),
      });
      // Should return 400 (wrong current password) not 500
      if (res.status === 400) return { ok: true, message: "Rejected bad password: 400 ✓" };
      if (res.status === 200) return { ok: true, message: "Accepted (password matched) ✓" };
      return { ok: false, message: `Unexpected status ${res.status}` };
    },
  },
];

interface TestResult {
  id: string;
  status: "pending" | "running" | "ok" | "fail";
  message: string;
}

function TestsTab() {
  const [token, setToken] = useState("");
  const [results, setResults] = useState<TestResult[]>(() =>
    TEST_SUITE.map((t) => ({ id: t.id, status: "pending", message: "" }))
  );
  const [running, setRunning] = useState(false);

  const runAll = useCallback(async () => {
    setRunning(true);
    setResults(TEST_SUITE.map((t) => ({ id: t.id, status: "pending", message: "" })));

    for (const tc of TEST_SUITE) {
      setResults((prev) =>
        prev.map((r) => (r.id === tc.id ? { ...r, status: "running" } : r))
      );
      try {
        const result = await tc.run(token);
        setResults((prev) =>
          prev.map((r) =>
            r.id === tc.id ? { ...r, status: result.ok ? "ok" : "fail", message: result.message } : r
          )
        );
      } catch (err) {
        setResults((prev) =>
          prev.map((r) =>
            r.id === tc.id ? { ...r, status: "fail", message: String(err) } : r
          )
        );
      }
    }
    setRunning(false);
  }, [token]);

  const passed = results.filter((r) => r.status === "ok").length;
  const failed = results.filter((r) => r.status === "fail").length;
  const done = passed + failed;

  return (
    <div className="space-y-5">
      <div className="bg-surface rounded-xl border border-border p-5 space-y-3">
        <p className="text-sm text-text-secondary">
          Run the automated test battery against the live API. Provide an API key to test authenticated endpoints.
          Some tests adjust their expected result based on the role of the provided token.
        </p>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Bearer Token (optional — for authenticated tests)</label>
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            className="w-full px-3 py-1.5 text-sm font-mono border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[var(--color-input-bg)] text-text-primary"
            placeholder="dk_u_... or dk_s_..."
          />
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={runAll}
            disabled={running}
            className="flex items-center gap-2 px-4 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-accent-hover disabled:opacity-50 transition-colors"
          >
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {running ? "Running…" : "Run All Tests"}
          </button>
          {done > 0 && (
            <span className="text-sm text-text-muted">
              {passed}/{done} passed
              {failed > 0 && <span className="text-red-600 ml-1">({failed} failed)</span>}
            </span>
          )}
        </div>
      </div>

      <div className="bg-surface rounded-xl border border-border overflow-hidden">
        {results.map((r, i) => {
          const tc = TEST_SUITE[i];
          return (
            <div key={r.id} className="flex items-start gap-3 px-5 py-3 border-b border-border/50 last:border-0">
              <div className="mt-0.5 shrink-0">
                {r.status === "pending" && <div className="w-4 h-4 rounded-full border-2 border-gray-300" />}
                {r.status === "running" && <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />}
                {r.status === "ok" && <CheckCircle className="w-4 h-4 text-green-500" />}
                {r.status === "fail" && <XCircle className="w-4 h-4 text-red-500" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm ${r.status === "fail" ? "text-red-700" : "text-text-primary"}`}>{tc.label}</p>
                {r.message && <p className="text-xs text-text-muted mt-0.5">{r.message}</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

type Tab = "docs" | "try" | "tests";

export default function ApiDocsPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("docs");

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "docs", label: "Documentation", icon: <BookOpen className="w-4 h-4" /> },
    { id: "try", label: "Try It", icon: <Play className="w-4 h-4" /> },
    { id: "tests", label: "Tests", icon: <FlaskConical className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen bg-surface-alt">
      <div className="max-w-5xl mx-auto py-8 px-4">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => router.push("/")}
            className="p-2 rounded-lg hover:bg-muted-hover text-gray-500 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-text-primary">API Documentation</h1>
            <p className="text-sm text-text-muted mt-0.5">Explore, test and interact with the doc-it REST API</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-lg w-fit">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                tab === t.id ? "bg-surface text-gray-900 shadow-sm" : "text-gray-500 hover:text-text-secondary"
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        {tab === "docs" && <DocsTab />}
        {tab === "try" && <TryItTab />}
        {tab === "tests" && <TestsTab />}
      </div>
    </div>
  );
}
