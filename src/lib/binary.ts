import { unzipSync } from "fflate";

export async function sha256Hex(data: ArrayBuffer | Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Printable ASCII strings of at least `min` chars, like the Unix `strings` tool. */
export function extractStrings(bytes: Uint8Array, min = 6, maxTotal = 400_000): string {
  const out: string[] = [];
  let current = "";
  let total = 0;
  for (let i = 0; i < bytes.length && total < maxTotal; i++) {
    const b = bytes[i]!;
    if (b >= 0x20 && b < 0x7f) {
      current += String.fromCharCode(b);
    } else {
      if (current.length >= min) {
        out.push(current);
        total += current.length + 1;
      }
      current = "";
    }
  }
  if (current.length >= min) out.push(current);
  return out.join("\n");
}

const ARCHIVE_EXTENSIONS = [".jar", ".zip", ".mrpack", ".nupkg", ".vsix"];

export function isArchive(name: string): boolean {
  const lower = name.toLowerCase();
  return ARCHIVE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export interface ExtractedFile {
  path: string;
  text: string;
}

/**
 * Turns a release asset into scannable text: archives (.jar, .zip…) are
 * unpacked and each entry becomes text (source as-is, compiled classes and
 * binaries through string extraction). Other files go through `strings`.
 */
export function assetToTexts(name: string, bytes: Uint8Array, maxEntries = 400): ExtractedFile[] {
  if (!isArchive(name)) return [{ path: name, text: extractStrings(bytes) }];
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes);
  } catch {
    return [{ path: name, text: extractStrings(bytes) }];
  }
  const files: ExtractedFile[] = [];
  for (const [path, data] of Object.entries(entries)) {
    if (files.length >= maxEntries) break;
    if (path.endsWith("/") || data.length === 0) continue;
    const lower = path.toLowerCase();
    const isText = /\.(json|toml|txt|properties|cfg|yml|yaml|js|lua|py|ps1|bat|sh|mf)$/.test(lower);
    const text = isText ? new TextDecoder().decode(data.subarray(0, 200_000)) : extractStrings(data, 6, 100_000);
    files.push({ path: `${name}!/${path}`, text });
  }
  return files;
}
