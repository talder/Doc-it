/**
 * Helpdesk Email-to-Ticket — IMAP poller.
 *
 * Polls an IMAP mailbox on a configurable interval.
 * - New emails → create ticket (requesterType: "portal")
 * - Reply emails (subject contains ticket ID like INC-0001) → add comment
 *
 * Uses the native `net` + `tls` + `crypto` modules only; no external IMAP lib.
 * Kept intentionally simple: fetches UNSEEN messages, marks them as SEEN.
 *
 * Config stored in helpdesk.json under `imapConfig`.
 */

import * as net from "net";
import * as tls from "tls";
import { readConfig } from "./helpdesk";
import { createTicket, addComment, readTickets } from "./helpdesk";

// ── Minimal IMAP helpers ─────────────────────────────────────────────

interface ImapConfig {
  host: string;
  port: number;
  tls: boolean;
  user: string;
  passEncrypted: string;
  folder: string;
  pollIntervalSec: number;
  enabled: boolean;
}

interface ParsedEmail {
  from: string;
  fromEmail: string;
  subject: string;
  body: string;
  messageId?: string;
}

/** Extract the first ticket ID (INC-NNNN, SR-NNNN, PRB-NNNN) from a subject. */
function extractTicketId(subject: string): string | null {
  const match = subject.match(/\b(INC|SR|PRB)-\d{4,}\b/);
  return match ? match[0] : null;
}

/** Parse a raw email into structured fields. */
function parseRawEmail(raw: string): ParsedEmail {
  const headerEnd = raw.indexOf("\r\n\r\n");
  const headers = headerEnd > 0 ? raw.slice(0, headerEnd) : raw;
  const body = headerEnd > 0 ? raw.slice(headerEnd + 4) : "";

  const getHeader = (name: string): string => {
    const re = new RegExp(`^${name}:\\s*(.+)$`, "im");
    const m = headers.match(re);
    return m ? m[1].trim() : "";
  };

  const fromRaw = getHeader("From");
  const emailMatch = fromRaw.match(/<([^>]+)>/);
  const fromEmail = emailMatch ? emailMatch[1] : fromRaw.replace(/^.*<|>.*$/g, "").trim();
  const fromName = fromRaw.replace(/<.*>/, "").replace(/"/g, "").trim() || fromEmail;

  // Strip quoted-printable soft line breaks
  let cleanBody = body.replace(/=\r?\n/g, "");
  // Strip HTML tags for a basic text extraction
  cleanBody = cleanBody.replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/\s{2,}/g, " ").trim();

  return {
    from: fromName,
    fromEmail,
    subject: getHeader("Subject"),
    body: cleanBody.slice(0, 4000), // cap at 4k chars
    messageId: getHeader("Message-ID"),
  };
}

// ── IMAP connection (simplified, line-based) ─────────────────────────

class SimpleImap {
  private socket!: net.Socket;
  private buffer = "";
  private tag = 0;
  private responseResolve?: (lines: string[]) => void;
  private collected: string[] = [];

  async connect(config: ImapConfig): Promise<void> {
    return new Promise((resolve, reject) => {
      const onConnect = () => {
        this.socket.on("data", (data) => this.onData(data.toString()));
        // Wait for server greeting
        setTimeout(resolve, 500);
      };

      if (config.tls) {
        this.socket = tls.connect({ host: config.host, port: config.port, rejectUnauthorized: false }, onConnect);
      } else {
        this.socket = net.createConnection({ host: config.host, port: config.port }, onConnect);
      }
      this.socket.setTimeout(30_000);
      this.socket.on("error", reject);
      this.socket.on("timeout", () => reject(new Error("IMAP connection timeout")));
    });
  }

  private onData(chunk: string) {
    this.buffer += chunk;
    const lines = this.buffer.split("\r\n");
    this.buffer = lines.pop() || "";
    for (const line of lines) {
      this.collected.push(line);
      if (line.startsWith(`A${this.tag} `)) {
        this.responseResolve?.(this.collected);
        this.collected = [];
      }
    }
  }

  private async command(cmd: string): Promise<string[]> {
    this.tag++;
    const tagStr = `A${this.tag}`;
    return new Promise((resolve, reject) => {
      this.collected = [];
      this.responseResolve = resolve;
      this.socket.write(`${tagStr} ${cmd}\r\n`, (err) => { if (err) reject(err); });
      setTimeout(() => reject(new Error(`IMAP timeout on: ${cmd}`)), 15_000);
    });
  }

  async login(user: string, pass: string): Promise<void> {
    await this.command(`LOGIN "${user}" "${pass}"`);
  }

  async select(folder: string): Promise<void> {
    await this.command(`SELECT "${folder}"`);
  }

  async searchUnseen(): Promise<string[]> {
    const lines = await this.command("SEARCH UNSEEN");
    const searchLine = lines.find((l) => l.startsWith("* SEARCH"));
    if (!searchLine) return [];
    return searchLine.replace("* SEARCH", "").trim().split(/\s+/).filter(Boolean);
  }

  async fetchMessage(seqNum: string): Promise<string> {
    const lines = await this.command(`FETCH ${seqNum} (BODY[HEADER] BODY[TEXT])`);
    return lines.join("\r\n");
  }

  async markSeen(seqNum: string): Promise<void> {
    await this.command(`STORE ${seqNum} +FLAGS (\\Seen)`);
  }

  async logout(): Promise<void> {
    try { await this.command("LOGOUT"); } catch { /* ignore */ }
    this.socket?.destroy();
  }
}

// ── Polling logic ────────────────────────────────────────────────────

async function decryptPass(encrypted: string): Promise<string> {
  // If the password is stored with our field encryption, decrypt it
  if (encrypted.startsWith("ENC:")) {
    try {
      const { decryptField } = await import("./crypto");
      return decryptField(encrypted);
    } catch { /* fallback to raw */ }
  }
  return encrypted;
}

export async function pollMailbox(): Promise<{ created: number; replied: number; errors: string[] }> {
  const cfg = await readConfig();
  const imap = cfg.imapConfig;
  if (!imap?.enabled) return { created: 0, replied: 0, errors: [] };

  const stats = { created: 0, replied: 0, errors: [] as string[] };
  const client = new SimpleImap();

  try {
    await client.connect(imap);
    const password = await decryptPass(imap.passEncrypted);
    await client.login(imap.user, password);
    await client.select(imap.folder || "INBOX");

    const unseenIds = await client.searchUnseen();
    if (unseenIds.length === 0) return stats;

    const ticketData = await readTickets();

    for (const seqNum of unseenIds.slice(0, 50)) { // cap at 50 per poll
      try {
        const raw = await client.fetchMessage(seqNum);
        const email = parseRawEmail(raw);
        if (!email.fromEmail || !email.subject) continue;

        const existingTicketId = extractTicketId(email.subject);

        if (existingTicketId) {
          // Thread reply → add comment to existing ticket
          const ticket = ticketData.tickets.find((t) => t.id === existingTicketId);
          if (ticket) {
            await addComment(existingTicketId, {
              author: email.fromEmail,
              authorType: "portal",
              content: `**Email from ${email.from} (${email.fromEmail}):**\n\n${email.body}`,
              isInternal: false,
              attachments: [],
            });
            stats.replied++;
          } else {
            // Ticket not found, create new
            await createTicket({
              subject: email.subject,
              description: email.body,
              requester: email.fromEmail,
              requesterEmail: email.fromEmail,
              requesterType: "portal",
            });
            stats.created++;
          }
        } else {
          // New email → create ticket
          await createTicket({
            subject: email.subject,
            description: email.body,
            requester: email.fromEmail,
            requesterEmail: email.fromEmail,
            requesterType: "portal",
          });
          stats.created++;
        }

        await client.markSeen(seqNum);
      } catch (err) {
        stats.errors.push(`Message ${seqNum}: ${String(err)}`);
      }
    }
  } catch (err) {
    stats.errors.push(`Connection: ${String(err)}`);
  } finally {
    await client.logout();
  }

  return stats;
}
