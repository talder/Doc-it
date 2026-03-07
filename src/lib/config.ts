import fs from "fs/promises";
import path from "path";

const CONFIG_DIR = path.join(process.cwd(), "config");
const DOCS_DIR = path.join(process.cwd(), "docs");
const ARCHIVE_DIR = path.join(process.cwd(), "archive");
const HISTORY_DIR = path.join(process.cwd(), "history");

export function getConfigDir() {
  return CONFIG_DIR;
}

export function getDocsDir() {
  return DOCS_DIR;
}

export function getSpaceDir(spaceSlug: string) {
  return path.join(DOCS_DIR, spaceSlug);
}

export function getCategoryDir(spaceSlug: string, categoryPath: string) {
  return path.join(DOCS_DIR, spaceSlug, categoryPath);
}

export function getAttachmentsDir(spaceSlug: string, categoryPath: string) {
  return path.join(DOCS_DIR, spaceSlug, categoryPath, "attachments");
}

export function getArchiveDir() {
  return ARCHIVE_DIR;
}

export function getArchiveSpaceDir(spaceSlug: string) {
  return path.join(ARCHIVE_DIR, spaceSlug);
}

export function getArchiveCategoryDir(spaceSlug: string, categoryPath: string) {
  return path.join(ARCHIVE_DIR, spaceSlug, categoryPath);
}

export function getHistoryDir(spaceSlug: string, categoryPath: string, docName: string) {
  return path.join(HISTORY_DIR, spaceSlug, categoryPath, docName);
}

export async function ensureDir(dir: string) {
  try {
    await fs.access(dir);
  } catch {
    await fs.mkdir(dir, { recursive: true });
  }
}

export async function ensureConfigDir() {
  await ensureDir(CONFIG_DIR);
}

export async function readJsonConfig<T>(filename: string, defaultValue: T): Promise<T> {
  await ensureConfigDir();
  const filePath = path.join(CONFIG_DIR, filename);
  try {
    const data = await fs.readFile(filePath, "utf-8");
    return JSON.parse(data) as T;
  } catch {
    return defaultValue;
  }
}

export async function writeJsonConfig<T>(filename: string, data: T) {
  await ensureConfigDir();
  const filePath = path.join(CONFIG_DIR, filename);
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
}
