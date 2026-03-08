/**
 * Unicode-safe base64 encode/decode for JSON objects.
 * Standard btoa() fails on non-Latin1 characters (em-dashes, accented letters, etc.).
 * These helpers percent-encode the JSON first, collapse to Latin1, then base64.
 * Available in both browser and Node.js 18+ (btoa/atob are global Web APIs).
 */

export const toSafeB64 = (obj: object): string => {
  const json = JSON.stringify(obj);
  return btoa(
    encodeURIComponent(json).replace(/%([0-9A-F]{2})/gi, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    )
  );
};

export const fromSafeB64 = (b64: string): unknown => {
  const json = decodeURIComponent(
    atob(b64).split("").map(c => "%" + c.charCodeAt(0).toString(16).padStart(2, "0")).join("")
  );
  return JSON.parse(json);
};
