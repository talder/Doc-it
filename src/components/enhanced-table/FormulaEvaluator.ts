import type { DbColumn, DbRow } from "@/lib/types";

/**
 * Evaluate a simple formula expression against a row.
 *
 * Supported:
 *   prop("Column Name")  — returns the value of that column
 *   now()                — current date ISO string
 *   if(cond, then, else)
 *   Arithmetic: + - * /
 *   String concatenation with +
 *   Comparisons: ==, !=, >, <, >=, <=
 *   Literals: "string", 123, true, false
 */
export function evaluateFormula(
  formula: string,
  row: DbRow,
  columns: DbColumn[],
): unknown {
  try {
    const colByName = new Map(columns.map((c) => [c.name.toLowerCase(), c]));

    // Tokenize: split into tokens handling strings, parentheses, operators, identifiers
    const tokens = tokenize(formula);
    const ctx: EvalContext = { row, colByName, pos: 0, tokens };
    const result = parseExpression(ctx);
    return result;
  } catch {
    return "#ERROR";
  }
}

interface EvalContext {
  row: DbRow;
  colByName: Map<string, DbColumn>;
  pos: number;
  tokens: Token[];
}

type Token =
  | { type: "string"; value: string }
  | { type: "number"; value: number }
  | { type: "bool"; value: boolean }
  | { type: "ident"; value: string }
  | { type: "op"; value: string }
  | { type: "paren"; value: "(" | ")" }
  | { type: "comma" };

function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (ch === '"' || ch === "'") {
      const q = ch;
      let s = "";
      i++;
      while (i < expr.length && expr[i] !== q) { s += expr[i]; i++; }
      i++; // closing quote
      tokens.push({ type: "string", value: s });
      continue;
    }
    if (ch === "(" || ch === ")") { tokens.push({ type: "paren", value: ch }); i++; continue; }
    if (ch === ",") { tokens.push({ type: "comma" }); i++; continue; }
    if (/[+\-*/]/.test(ch)) { tokens.push({ type: "op", value: ch }); i++; continue; }
    if (ch === "=" && expr[i + 1] === "=") { tokens.push({ type: "op", value: "==" }); i += 2; continue; }
    if (ch === "!" && expr[i + 1] === "=") { tokens.push({ type: "op", value: "!=" }); i += 2; continue; }
    if (ch === ">" && expr[i + 1] === "=") { tokens.push({ type: "op", value: ">=" }); i += 2; continue; }
    if (ch === "<" && expr[i + 1] === "=") { tokens.push({ type: "op", value: "<=" }); i += 2; continue; }
    if (ch === ">" || ch === "<") { tokens.push({ type: "op", value: ch }); i++; continue; }
    // Number
    if (/[0-9.]/.test(ch)) {
      let num = "";
      while (i < expr.length && /[0-9.]/.test(expr[i])) { num += expr[i]; i++; }
      tokens.push({ type: "number", value: parseFloat(num) });
      continue;
    }
    // Identifier
    if (/[a-zA-Z_]/.test(ch)) {
      let id = "";
      while (i < expr.length && /[a-zA-Z0-9_]/.test(expr[i])) { id += expr[i]; i++; }
      if (id === "true") tokens.push({ type: "bool", value: true });
      else if (id === "false") tokens.push({ type: "bool", value: false });
      else tokens.push({ type: "ident", value: id });
      continue;
    }
    i++; // skip unknown
  }
  return tokens;
}

function peek(ctx: EvalContext): Token | null {
  return ctx.tokens[ctx.pos] || null;
}

function consume(ctx: EvalContext): Token {
  return ctx.tokens[ctx.pos++];
}

function parseExpression(ctx: EvalContext): unknown {
  return parseComparison(ctx);
}

function parseComparison(ctx: EvalContext): unknown {
  let left = parseAddSub(ctx);
  while (peek(ctx)?.type === "op" && ["==", "!=", ">", "<", ">=", "<="].includes((peek(ctx) as any).value)) {
    const op = (consume(ctx) as { type: "op"; value: string }).value;
    const right = parseAddSub(ctx);
    const l = Number(left), r = Number(right);
    switch (op) {
      case "==": left = left === right || l === r; break;
      case "!=": left = left !== right && l !== r; break;
      case ">": left = l > r; break;
      case "<": left = l < r; break;
      case ">=": left = l >= r; break;
      case "<=": left = l <= r; break;
    }
  }
  return left;
}

function parseAddSub(ctx: EvalContext): unknown {
  let left = parseMulDiv(ctx);
  while (peek(ctx)?.type === "op" && ["+", "-"].includes((peek(ctx) as any).value)) {
    const op = (consume(ctx) as { type: "op"; value: string }).value;
    const right = parseMulDiv(ctx);
    if (op === "+") {
      if (typeof left === "string" || typeof right === "string") left = String(left) + String(right);
      else left = Number(left) + Number(right);
    } else {
      left = Number(left) - Number(right);
    }
  }
  return left;
}

function parseMulDiv(ctx: EvalContext): unknown {
  let left = parsePrimary(ctx);
  while (peek(ctx)?.type === "op" && ["*", "/"].includes((peek(ctx) as any).value)) {
    const op = (consume(ctx) as { type: "op"; value: string }).value;
    const right = parsePrimary(ctx);
    if (op === "*") left = Number(left) * Number(right);
    else left = Number(right) !== 0 ? Number(left) / Number(right) : "#DIV/0";
  }
  return left;
}

function parsePrimary(ctx: EvalContext): unknown {
  const t = peek(ctx);
  if (!t) return "";

  if (t.type === "string") { consume(ctx); return t.value; }
  if (t.type === "number") { consume(ctx); return t.value; }
  if (t.type === "bool") { consume(ctx); return t.value; }

  if (t.type === "paren" && t.value === "(") {
    consume(ctx); // (
    const val = parseExpression(ctx);
    if (peek(ctx)?.type === "paren") consume(ctx); // )
    return val;
  }

  if (t.type === "ident") {
    const name = t.value.toLowerCase();
    consume(ctx);

    // Function call
    if (peek(ctx)?.type === "paren" && (peek(ctx) as any).value === "(") {
      consume(ctx); // (
      const args: unknown[] = [];
      while (peek(ctx) && !(peek(ctx)!.type === "paren" && (peek(ctx) as any).value === ")")) {
        args.push(parseExpression(ctx));
        if (peek(ctx)?.type === "comma") consume(ctx);
      }
      if (peek(ctx)?.type === "paren") consume(ctx); // )

      switch (name) {
        case "prop": {
          const colName = String(args[0] || "").toLowerCase();
          const col = ctx.colByName.get(colName);
          return col ? ctx.row.cells[col.id] ?? "" : "";
        }
        case "now": return new Date().toISOString().slice(0, 10);
        case "if": return args[0] ? args[1] : args[2];
        case "len": return String(args[0] || "").length;
        case "lower": return String(args[0] || "").toLowerCase();
        case "upper": return String(args[0] || "").toUpperCase();
        case "round": return Math.round(Number(args[0] || 0));
        case "abs": return Math.abs(Number(args[0] || 0));
        case "min": return Math.min(...args.map(Number));
        case "max": return Math.max(...args.map(Number));
        default: return "#UNKNOWN_FN";
      }
    }

    // Bare identifier treated as prop shorthand
    const col = ctx.colByName.get(name);
    return col ? ctx.row.cells[col.id] ?? "" : "";
  }

  consume(ctx);
  return "";
}
