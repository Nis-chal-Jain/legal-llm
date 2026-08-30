import { extractFileText, fileExtension } from "@/lib/extract";

export const runtime = "nodejs";

const MAX_BYTES = 20 * 1024 * 1024;

export async function POST(request: Request) {
  const form = await request.formData();
  const files = form
    .getAll("files")
    .filter((entry): entry is File => entry instanceof File);

  if (files.length === 0) {
    return Response.json({ error: "No files uploaded." }, { status: 400 });
  }

  const extracted: { name: string; size: number; text: string }[] = [];

  for (const file of files) {
    if (file.size > MAX_BYTES) {
      return Response.json(
        { error: `${file.name} exceeds the 20MB limit.` },
        { status: 400 },
      );
    }

    try {
      const text = await extractFileText(file);
      extracted.push({
        name: file.name,
        size: file.size,
        text: text || `(No extractable text in ${fileExtension(file.name) || "file"})`,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : `Failed to read ${file.name}`;
      return Response.json({ error: message }, { status: 400 });
    }
  }

  return Response.json({ files: extracted });
}
