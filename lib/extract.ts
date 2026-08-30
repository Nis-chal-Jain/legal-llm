import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";

const MAX_BYTES = 20 * 1024 * 1024;
const ALLOWED = new Set([".pdf", ".txt", ".docx", ".md"]);

export function fileExtension(name: string) {
  const i = name.lastIndexOf(".");
  return i === -1 ? "" : name.slice(i).toLowerCase();
}

export async function extractFileText(file: File) {
  if (file.size > MAX_BYTES) {
    throw new Error("File exceeds the 20MB limit.");
  }

  const ext = fileExtension(file.name);
  if (!ALLOWED.has(ext)) {
    throw new Error("Unsupported file type. Use PDF, TXT, DOCX, or MD.");
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  if (ext === ".pdf") {
    const pdf = await getDocumentProxy(bytes);
    const result = await extractText(pdf, { mergePages: true });
    const text = Array.isArray(result.text) ? result.text.join("\n\n") : result.text;
    return text.trim();
  }

  if (ext === ".docx") {
    const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
    return result.value.trim();
  }

  return new TextDecoder("utf-8").decode(bytes).trim();
}
