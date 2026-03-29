/**
 * CMDB Network Scanner — discovers devices on local networks.
 *
 * Two-phase discovery:
 * 1. ARP/ping sweep to find alive hosts (works on all device types)
 * 2. TCP port scan on alive hosts to identify device type
 *
 * No external dependencies (no nmap required).
 */

import net from "net";
import dns from "dns/promises";
import { execSync } from "child_process";
import { randomUUID } from "crypto";
import { readCmdb, writeCmdb } from "./cmdb";
import type { ScanConfig, ScanResult, DiscoveredDevice, CmdbData } from "./cmdb";

// ── Port → device type heuristics ────────────────────────────────────

const PORT_TYPE_MAP: Record<number, { type: string; typeId: string }> = {
  22:    { type: "Server",          typeId: "type-server" },
  80:    { type: "Server",          typeId: "type-server" },
  443:   { type: "Server",          typeId: "type-server" },
  3389:  { type: "Desktop",         typeId: "type-desktop" },
  161:   { type: "Switch",          typeId: "type-switch" },
  623:   { type: "Server",          typeId: "type-server" },
  9100:  { type: "Printer",         typeId: "type-printer" },
  515:   { type: "Printer",         typeId: "type-printer" },
  5060:  { type: "Phone",           typeId: "type-phone" },
  8443:  { type: "Firewall",        typeId: "type-firewall" },
  8080:  { type: "Server",          typeId: "type-server" },
  135:   { type: "Desktop",         typeId: "type-desktop" },
  445:   { type: "Desktop",         typeId: "type-desktop" },
};

const DEFAULT_PORTS = [22, 80, 443, 135, 445, 3389, 9100, 161, 8080, 8443, 53, 5060];

function guessDeviceType(openPorts: number[]): { type: string; typeId: string } {
  for (const port of [9100, 515]) if (openPorts.includes(port)) return PORT_TYPE_MAP[port];
  for (const port of [5060]) if (openPorts.includes(port)) return PORT_TYPE_MAP[port];
  for (const port of [8443]) if (openPorts.includes(port)) return PORT_TYPE_MAP[port];
  for (const port of [161]) if (openPorts.includes(port)) return PORT_TYPE_MAP[port];
  if (openPorts.includes(3389) && !openPorts.includes(22)) return PORT_TYPE_MAP[3389];
  if (openPorts.includes(135) || openPorts.includes(445)) return { type: "Desktop", typeId: "type-desktop" };
  if (openPorts.includes(22) || openPorts.includes(80) || openPorts.includes(443)) return { type: "Server", typeId: "type-server" };
  return { type: "Other", typeId: "type-other" };
}

// ── IP range expansion ───────────────────────────────────────────────

function ipToNum(ip: string): number {
  return ip.split(".").reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
}

function numToIp(num: number): string {
  return [(num >>> 24) & 255, (num >>> 16) & 255, (num >>> 8) & 255, num & 255].join(".");
}

export function expandIpRange(range: string): string[] {
  const ips: string[] = [];
  const cidrMatch = range.match(/^(\d+\.\d+\.\d+\.\d+)\/(\d+)$/);
  if (cidrMatch) {
    const base = ipToNum(cidrMatch[1]);
    const prefix = parseInt(cidrMatch[2], 10);
    const hostBits = 32 - prefix;
    const count = 1 << hostBits;
    const network = (base & ((0xFFFFFFFF << hostBits) >>> 0)) >>> 0;
    for (let i = 1; i < count - 1 && ips.length < 1024; i++) {
      ips.push(numToIp((network + i) >>> 0));
    }
    return ips;
  }
  const rangeMatch = range.match(/^(\d+\.\d+\.\d+\.\d+)-(\d+\.\d+\.\d+\.\d+)$/);
  if (rangeMatch) {
    const start = ipToNum(rangeMatch[1]);
    const end = ipToNum(rangeMatch[2]);
    for (let n = start; n <= end && ips.length < 1024; n++) ips.push(numToIp(n));
    return ips;
  }
  if (/^\d+\.\d+\.\d+\.\d+$/.test(range)) return [range];
  return ips;
}

// ── Phase 1: ARP-based host discovery ────────────────────────────────
// Reads the OS ARP table + triggers a ping sweep to populate it.
// This finds ALL devices on the local segment, not just ones with open TCP ports.

function discoverAliveHosts(ipRange: string): Map<string, string> {
  const alive = new Map<string, string>(); // ip → hostname
  const rangeIps = new Set(expandIpRange(ipRange));
  const isMac = process.platform === "darwin";

  // Phase 1a: Read existing ARP table (already populated from normal traffic)
  //           Then do a targeted ping sweep for IPs not yet in the table.
  try {
    // Use -n to skip DNS resolution (arp -a can take 10+ seconds due to DNS lookups)
    const arpOutput = execSync("arp -an 2>/dev/null", { encoding: "utf-8", timeout: 5000 });
    // Format: hostname (ip) at mac on iface [...]
    for (const line of arpOutput.split("\n")) {
      // Skip incomplete entries
      if (line.includes("(incomplete)") || line.includes("ff:ff:ff:ff:ff:ff")) continue;
      // Extract IP from parentheses
      const ipMatch = line.match(/\((\d+\.\d+\.\d+\.\d+)\)/);
      if (!ipMatch) continue;
      const ip = ipMatch[1];
      if (!rangeIps.has(ip)) continue;
      // Check there's an actual MAC address (not incomplete)
      const macMatch = line.match(/at\s+([0-9a-fA-F:]+)/);
      if (!macMatch) continue;
      // Extract hostname (everything before the first parenthesis)
      const hostname = line.split("(")[0].trim().replace(/^\?\s*$/, "") || "";
      alive.set(ip, hostname || ip);
    }
  } catch { /* ARP failed */ }

  // Phase 1b: Ping IPs not yet in ARP table (batches of 20, keeps it fast)
  const missingIps = [...rangeIps].filter((ip) => !alive.has(ip));
  if (missingIps.length > 0 && missingIps.length <= 254) {
    const pingFlag = isMac ? "-t 1" : "-W 1";
    for (let i = 0; i < missingIps.length; i += 20) {
      const batch = missingIps.slice(i, i + 20);
      const cmds = batch.map((ip) => `ping -c 1 ${pingFlag} ${ip} >/dev/null 2>&1 &`).join("\n");
      try { execSync(`bash -c '${cmds}\nwait'`, { timeout: 5000, stdio: "ignore" }); } catch { /* ok */ }
    }
    // Re-read ARP table after pings
    try {
      const arpOutput2 = execSync("arp -an 2>/dev/null", { encoding: "utf-8", timeout: 5000 });
      for (const line of arpOutput2.split("\n")) {
        if (line.includes("(incomplete)") || line.includes("ff:ff:ff:ff:ff:ff")) continue;
        const ipMatch = line.match(/\((\d+\.\d+\.\d+\.\d+)\)/);
        if (!ipMatch) continue;
        const ip = ipMatch[1];
        if (!rangeIps.has(ip) || alive.has(ip)) continue;
        const macMatch = line.match(/at\s+([0-9a-fA-F:]+)/);
        if (!macMatch) continue;
        const hostname = line.split("(")[0].trim().replace(/^\?\s*$/, "") || "";
        alive.set(ip, hostname || ip);
      }
    } catch { /* ok */ }
  }

  // Fallback for Linux: try ip neigh
  if (alive.size === 0) {
    try {
      const neighOutput = execSync("ip neigh 2>/dev/null", { encoding: "utf-8", timeout: 5000 });
      for (const line of neighOutput.split("\n")) {
        if (!line.includes("REACHABLE") && !line.includes("STALE") && !line.includes("DELAY")) continue;
        const m = line.match(/^(\d+\.\d+\.\d+\.\d+)\s/);
        if (m && rangeIps.has(m[1])) alive.set(m[1], m[1]);
      }
    } catch { /* ok */ }
  }

  return alive;
}

// ── Phase 2: TCP port probe ──────────────────────────────────────────

function probeTcpPort(ip: string, port: number, timeoutMs: number = 1500): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let resolved = false;
    const done = (open: boolean) => {
      if (resolved) return;
      resolved = true;
      try { socket.destroy(); } catch { /* ignore */ }
      resolve(open);
    };
    const hardTimer = setTimeout(() => done(false), timeoutMs + 500);
    socket.setTimeout(timeoutMs);
    socket.on("connect", () => { clearTimeout(hardTimer); done(true); });
    socket.on("timeout", () => { clearTimeout(hardTimer); done(false); });
    socket.on("error", () => { clearTimeout(hardTimer); done(false); });
    try { socket.connect(port, ip); } catch { clearTimeout(hardTimer); done(false); }
  });
}

// ── Reverse DNS ──────────────────────────────────────────────────────

async function reverseLookup(ip: string): Promise<string> {
  try {
    const hostnames = await dns.reverse(ip);
    return hostnames[0] || ip;
  } catch {
    return ip;
  }
}

// ── Scan a single alive host ─────────────────────────────────────────

async function scanAliveHost(ip: string, arpHostname: string, ports: number[], data: CmdbData): Promise<DiscoveredDevice> {
  // Probe all ports concurrently
  const results = await Promise.allSettled(ports.map(async (port) => ({ port, open: await probeTcpPort(ip, port) })));
  const openPorts: number[] = [];
  for (const r of results) {
    if (r.status === "fulfilled" && r.value.open) openPorts.push(r.value.port);
  }

  // Try reverse DNS, fall back to ARP hostname, fall back to IP
  let hostname = arpHostname;
  if (!hostname || hostname === ip) {
    hostname = await reverseLookup(ip);
  }

  const guess = openPorts.length > 0 ? guessDeviceType(openPorts) : { type: "Other", typeId: "type-other" };
  const existing = data.assets.find(
    (a) => a.ipAddresses.includes(ip) || a.name.toLowerCase() === hostname.toLowerCase(),
  );

  return {
    ip,
    hostname,
    openPorts,
    guessedType: guess.type,
    guessedTypeId: guess.typeId,
    alreadyExists: !!existing,
    existingAssetId: existing?.id,
  };
}

// ── Run a full scan ──────────────────────────────────────────────────

export async function runNetworkScan(configId: string): Promise<ScanResult> {
  const data = await readCmdb();
  const config = data.scanConfigs.find((c) => c.id === configId);
  if (!config) throw new Error("Scan config not found");

  const ports = config.ports.length > 0 ? config.ports : DEFAULT_PORTS;

  const result: ScanResult = {
    id: randomUUID(),
    configId: config.id,
    configName: config.name,
    status: "running",
    startedAt: new Date().toISOString(),
    scannedCount: 0,
    discoveredDevices: [],
  };

  data.scanResults = [result, ...data.scanResults.slice(0, 19)];
  await writeCmdb(data);

  try {
    // Phase 1: Discover alive hosts via ARP
    const aliveHosts = discoverAliveHosts(config.ipRange);
    const aliveList = [...aliveHosts.entries()]; // [ip, hostname][]
    result.scannedCount = aliveList.length;

    // Phase 2: Port scan alive hosts in batches
    const BATCH_SIZE = 10;
    for (let i = 0; i < aliveList.length; i += BATCH_SIZE) {
      const batch = aliveList.slice(i, i + BATCH_SIZE);
      const hostResults = await Promise.allSettled(
        batch.map(([ip, hostname]) => scanAliveHost(ip, hostname, ports, data)),
      );
      for (const hr of hostResults) {
        if (hr.status === "fulfilled") result.discoveredDevices.push(hr.value);
      }

      // Save progress
      if (i > 0 && i % 30 === 0) {
        const pd = await readCmdb();
        const pidx = pd.scanResults.findIndex((r) => r.id === result.id);
        if (pidx >= 0) { pd.scanResults[pidx] = { ...result }; await writeCmdb(pd); }
      }
    }

    result.status = "completed";
    result.completedAt = new Date().toISOString();
  } catch (err) {
    result.status = "failed";
    result.completedAt = new Date().toISOString();
    result.error = err instanceof Error ? err.message : String(err);
  }

  // Persist final result
  const freshData = await readCmdb();
  const idx = freshData.scanResults.findIndex((r) => r.id === result.id);
  if (idx >= 0) freshData.scanResults[idx] = result;
  else freshData.scanResults.unshift(result);
  freshData.scanResults = freshData.scanResults.slice(0, 20);
  await writeCmdb(freshData);

  return result;
}

// ── Scan Config CRUD ─────────────────────────────────────────────────

export async function addScanConfig(fields: Omit<ScanConfig, "id" | "createdAt">): Promise<ScanConfig> {
  const data = await readCmdb();
  const config: ScanConfig = { id: randomUUID(), ...fields, createdAt: new Date().toISOString() };
  data.scanConfigs.push(config);
  await writeCmdb(data);
  return config;
}

export async function deleteScanConfig(id: string): Promise<boolean> {
  const data = await readCmdb();
  const before = data.scanConfigs.length;
  data.scanConfigs = data.scanConfigs.filter((c) => c.id !== id);
  if (data.scanConfigs.length === before) return false;
  await writeCmdb(data);
  return true;
}
