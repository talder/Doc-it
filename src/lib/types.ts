// === User & Auth ===

export type SpaceRole = "admin" | "writer" | "reader";

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
}

export type SanitizedUser = Omit<User, "passwordHash">;

export interface Session {
  username: string;
  createdAt: string;
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

export interface DocFile {
  name: string;
  filename: string;
  category: string;
  space: string;
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

// === API result ===

export interface Result<T> {
  success: boolean;
  data?: T;
  error?: string;
}
