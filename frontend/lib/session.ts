const encoder = new TextEncoder();

function toBase64Url(input: Uint8Array): string {
  let binary = "";
  input.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(input: string): Uint8Array {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function importKey(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function sign(payload: string, secret: string): Promise<string> {
  const key = await importKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return toBase64Url(new Uint8Array(signature));
}

export async function createSignedValue(
  kind: "session" | "onboarded",
  secret: string,
  maxAgeSeconds: number,
): Promise<string> {
  const payload = toBase64Url(
    encoder.encode(
      JSON.stringify({
        kind,
        exp: Date.now() + maxAgeSeconds * 1000,
      }),
    ),
  );

  const signature = await sign(payload, secret);
  return `${payload}.${signature}`;
}

export async function verifySignedValue(
  value: string | undefined,
  kind: "session" | "onboarded",
  secret: string,
): Promise<boolean> {
  if (!value) return false;
  const [payload, signature] = value.split(".");
  if (!payload || !signature) return false;

  const expected = await sign(payload, secret);
  if (expected !== signature) return false;

  try {
    const parsed = JSON.parse(new TextDecoder().decode(fromBase64Url(payload))) as {
      kind?: string;
      exp?: number;
    };
    return parsed.kind === kind && typeof parsed.exp === "number" && parsed.exp > Date.now();
  } catch {
    return false;
  }
}
