// Shared password policy — used by both server routes and client components.

export interface PasswordContext {
  username?: string;
  fullName?: string;
}

export interface PasswordRule {
  id: string;
  label: string;
  test: (password: string, ctx: PasswordContext) => boolean;
}

export const PASSWORD_RULES: PasswordRule[] = [
  {
    id: "length",
    label: "At least 12 characters",
    test: (p) => p.length >= 12,
  },
  {
    id: "upper",
    label: "At least one uppercase letter",
    test: (p) => /[A-Z]/.test(p),
  },
  {
    id: "lower",
    label: "At least one lowercase letter",
    test: (p) => /[a-z]/.test(p),
  },
  {
    id: "digit",
    label: "At least one number",
    test: (p) => /[0-9]/.test(p),
  },
  {
    id: "special",
    label: "At least one special character (!@#$%^&* etc.)",
    test: (p) => /[^a-zA-Z0-9]/.test(p),
  },
  {
    id: "noUsername",
    label: "Does not contain your username",
    test: (p, ctx) =>
      !ctx.username ||
      ctx.username.length < 3 ||
      !p.toLowerCase().includes(ctx.username.toLowerCase()),
  },
  {
    id: "noFullName",
    label: "Does not contain your name",
    test: (p, ctx) => {
      if (!ctx.fullName) return true;
      const parts = ctx.fullName
        .split(/\s+/)
        .filter((w) => w.length >= 3);
      return !parts.some((part) =>
        p.toLowerCase().includes(part.toLowerCase())
      );
    },
  },
  {
    id: "noDocit",
    label: 'Does not contain "doc-it" or "docit"',
    test: (p) => !/(doc-?it)/i.test(p),
  },
];

/** Returns labels of all failing rules. Empty array means password is valid. */
export function validatePassword(
  password: string,
  ctx: PasswordContext = {}
): string[] {
  return PASSWORD_RULES.filter((r) => !r.test(password, ctx)).map(
    (r) => r.label
  );
}

export function isPasswordValid(
  password: string,
  ctx: PasswordContext = {}
): boolean {
  return PASSWORD_RULES.every((r) => r.test(password, ctx));
}
