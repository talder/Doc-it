/**
 * Helpdesk AI — KB article suggestions via TF-IDF keyword matching,
 * ticket auto-classification, and SLA breach prediction.
 *
 * No external AI dependencies — pure algorithmic approach using
 * term frequency–inverse document frequency for text similarity.
 */

import { readTickets, readConfig } from "./helpdesk";
import type { Ticket, TicketFilters } from "./helpdesk";
import { filterTickets } from "./helpdesk";

// ══════════════════════════════════════════════════════════════════════
//  TF-IDF keyword extraction
// ══════════════════════════════════════════════════════════════════════

const STOP_WORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "shall", "can", "need", "must", "to", "of",
  "in", "for", "on", "with", "at", "by", "from", "as", "into", "through",
  "during", "before", "after", "above", "below", "between", "out", "off",
  "over", "under", "again", "further", "then", "once", "here", "there",
  "when", "where", "why", "how", "all", "both", "each", "few", "more",
  "most", "other", "some", "such", "no", "nor", "not", "only", "own",
  "same", "so", "than", "too", "very", "just", "because", "but", "and",
  "or", "if", "while", "about", "up", "it", "its", "this", "that", "i",
  "we", "you", "he", "she", "they", "me", "him", "her", "us", "them",
  "my", "your", "his", "our", "their", "what", "which", "who", "whom",
]);

function tokenize(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

function termFrequency(tokens: string[]): Map<string, number> {
  const freq = new Map<string, number>();
  for (const t of tokens) freq.set(t, (freq.get(t) || 0) + 1);
  const max = Math.max(...freq.values(), 1);
  for (const [k, v] of freq) freq.set(k, v / max);
  return freq;
}

function cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0, magA = 0, magB = 0;
  for (const [k, v] of a) {
    magA += v * v;
    if (b.has(k)) dot += v * b.get(k)!;
  }
  for (const [, v] of b) magB += v * v;
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

// ══════════════════════════════════════════════════════════════════════
//  KB Article Suggestions
// ══════════════════════════════════════════════════════════════════════

export interface ArticleSuggestion {
  docName: string;
  title: string;
  score: number;
  category: string;
}

/**
 * Find KB articles similar to the given ticket subject + description.
 * Reads markdown docs from the configured KB space.
 */
export async function suggestArticles(subject: string, description: string, maxResults = 5): Promise<ArticleSuggestion[]> {
  const cfg = await readConfig();
  const kbSlug = cfg.kbSpaceSlug;
  if (!kbSlug) return [];

  try {
    const fs = await import("fs/promises");
    const path = await import("path");
    const docsDir = path.join(process.cwd(), "docs", kbSlug);

    // Read all markdown files
    const categories = await fs.readdir(docsDir).catch(() => [] as string[]);
    const articles: { name: string; title: string; content: string; category: string }[] = [];

    for (const cat of categories) {
      const catPath = path.join(docsDir, cat);
      const stat = await fs.stat(catPath).catch(() => null);
      if (!stat?.isDirectory()) continue;

      const files = await fs.readdir(catPath).catch(() => [] as string[]);
      for (const file of files) {
        if (!file.endsWith(".md")) continue;
        const content = await fs.readFile(path.join(catPath, file), "utf-8").catch(() => "");
        // Extract title from first heading or frontmatter
        const titleMatch = content.match(/^#\s+(.+)$/m) || content.match(/^title:\s*(.+)$/m);
        articles.push({
          name: file.replace(/\.md$/, ""),
          title: titleMatch?.[1] || file.replace(/\.md$/, ""),
          content,
          category: cat,
        });
      }
    }

    if (articles.length === 0) return [];

    // Compute similarity
    const queryTokens = tokenize(`${subject} ${description}`);
    const queryTf = termFrequency(queryTokens);

    const scored = articles.map((a) => {
      const tf = termFrequency(tokenize(`${a.title} ${a.content}`));
      return { ...a, score: cosineSimilarity(queryTf, tf) };
    });

    return scored
      .filter((a) => a.score > 0.05)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults)
      .map((a) => ({ docName: a.name, title: a.title, score: Math.round(a.score * 100) / 100, category: a.category }));
  } catch {
    return [];
  }
}

// ══════════════════════════════════════════════════════════════════════
//  Ticket Auto-Classification (category suggestion)
// ══════════════════════════════════════════════════════════════════════

export interface ClassificationSuggestion {
  category: string;
  confidence: number;
}

/**
 * Suggest a category for a new ticket based on similarity to
 * previously categorized tickets.
 */
export async function classifyTicket(subject: string, description: string, topN = 3): Promise<ClassificationSuggestion[]> {
  const data = await readTickets();
  const categorized = data.tickets.filter((t) => t.category && t.category.length > 0);
  if (categorized.length < 5) return []; // Not enough data

  const queryTf = termFrequency(tokenize(`${subject} ${description}`));

  // Group tickets by category, compute centroid TF vector
  const categoryTickets = new Map<string, Ticket[]>();
  for (const t of categorized) {
    if (!categoryTickets.has(t.category)) categoryTickets.set(t.category, []);
    categoryTickets.get(t.category)!.push(t);
  }

  const results: ClassificationSuggestion[] = [];
  for (const [category, tickets] of categoryTickets) {
    // Average similarity across all tickets in category
    let totalSim = 0;
    for (const t of tickets) {
      const tf = termFrequency(tokenize(`${t.subject} ${t.description}`));
      totalSim += cosineSimilarity(queryTf, tf);
    }
    const avgSim = totalSim / tickets.length;
    if (avgSim > 0.02) {
      results.push({ category, confidence: Math.round(avgSim * 100) / 100 });
    }
  }

  return results.sort((a, b) => b.confidence - a.confidence).slice(0, topN);
}

// ══════════════════════════════════════════════════════════════════════
//  SLA Breach Prediction
// ══════════════════════════════════════════════════════════════════════

export interface SlaPrediction {
  ticketId: string;
  predictedResolutionMinutes: number;
  slaResolutionMinutes: number;
  breachProbability: number; // 0-1
  riskLevel: "low" | "medium" | "high";
}

/**
 * Predict SLA breach probability for open tickets based on
 * historical average resolution times by priority and category.
 */
export async function predictSlaBreaches(filters?: TicketFilters): Promise<SlaPrediction[]> {
  const data = await readTickets();
  const cfg = await readConfig();

  // Build historical stats: avg resolution time by priority × category
  const resolved = data.tickets.filter((t) => t.resolvedAt && t.createdAt);
  const stats = new Map<string, { totalMin: number; count: number }>();

  for (const t of resolved) {
    const key = `${t.priority}:${t.category || "general"}`;
    const resMin = (new Date(t.resolvedAt!).getTime() - new Date(t.createdAt).getTime()) / 60_000;
    if (resMin > 0 && resMin < 60 * 24 * 30) { // Exclude outliers > 30 days
      const s = stats.get(key) || { totalMin: 0, count: 0 };
      s.totalMin += resMin;
      s.count++;
      stats.set(key, s);
    }
  }

  // Predict for open tickets
  let open = data.tickets.filter((t) => !["Resolved", "Closed"].includes(t.status) && t.slaResolutionDue);
  if (filters) open = filterTickets(open, filters);

  const predictions: SlaPrediction[] = [];
  for (const t of open) {
    const key = `${t.priority}:${t.category || "general"}`;
    const s = stats.get(key) || stats.get(`${t.priority}:general`);
    if (!s || s.count < 2) continue;

    const avgResolutionMin = s.totalMin / s.count;
    const slaPolicy = cfg.slaPolicies.find((p) => p.isDefault);
    const slaPc = slaPolicy?.priorities.find((p) => p.priority === t.priority);
    const slaMin = slaPc?.resolutionTimeMinutes || 0;
    if (slaMin <= 0) continue;

    // Account for paused time
    const pausedMin = t.slaPausedMinutes || 0;
    const effectiveSlaMin = slaMin + pausedMin;

    const breachProb = Math.min(1, Math.max(0, avgResolutionMin / effectiveSlaMin));
    predictions.push({
      ticketId: t.id,
      predictedResolutionMinutes: Math.round(avgResolutionMin),
      slaResolutionMinutes: effectiveSlaMin,
      breachProbability: Math.round(breachProb * 100) / 100,
      riskLevel: breachProb > 0.8 ? "high" : breachProb > 0.5 ? "medium" : "low",
    });
  }

  return predictions.sort((a, b) => b.breachProbability - a.breachProbability);
}
