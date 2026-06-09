import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { env } from "../../config/env.js";
import { BadRequestError, NotFoundError } from "../../domain/errors.js";
import { authenticate, requireContentAdmin, requirePermission } from "../guards/auth.guards.js";

const folders = ["images", "pdf", "files"] as const;
type MediaFolder = typeof folders[number];

const mediaGuards = () => [authenticate, requireContentAdmin, requirePermission("catalog.manage")];
const uploadRoot = path.resolve(env.UPLOAD_DIR);

function folderFor(mime: string): MediaFolder {
  if (mime.startsWith("image/")) return "images";
  if (mime === "application/pdf") return "pdf";
  return "files";
}

function publicUrl(request: { protocol: string; host: string }, folder: string, filename: string) {
  return `${request.protocol}://${request.host}/api/v1/media/${folder}/${filename}`;
}

export async function mediaRoutes(app: FastifyInstance) {
  app.get("/admin/media", { preHandler: mediaGuards() }, async (request) => {
    const items = [];
    for (const folder of folders) {
      const directory = path.join(uploadRoot, folder);
      await mkdir(directory, { recursive: true });
      for (const filename of await readdir(directory)) {
        const details = await stat(path.join(directory, filename));
        if (!details.isFile()) continue;
        items.push({
          filename,
          folder,
          size: details.size,
          createdAt: details.birthtime,
          url: publicUrl(request, folder, filename),
        });
      }
    }
    items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return { data: items };
  });

  app.post("/admin/media", { preHandler: mediaGuards() }, async (request, reply) => {
    const body = z.object({
      filename: z.string().min(1).max(255),
      mimeType: z.string().min(1).max(255),
      base64: z.string().min(1),
    }).parse(request.body);
    const bytes = Buffer.from(body.base64, "base64");
    if (bytes.length > 20 * 1024 * 1024) throw new BadRequestError("File is larger than 20 MB");
    const folder = folderFor(body.mimeType);
    const extension = path.extname(body.filename).toLowerCase().replace(/[^a-z0-9.]/g, "");
    const filename = `${randomUUID()}${extension}`;
    const directory = path.join(uploadRoot, folder);
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, filename), bytes);

    return reply.status(201).send({
      data: {
        filename,
        folder,
        mimeType: body.mimeType,
        size: bytes.length,
        url: publicUrl(request, folder, filename),
      },
    });
  });

  app.get("/media/:folder/:filename", async (request, reply) => {
    const { folder, filename } = z.object({
      folder: z.enum(folders),
      filename: z.string().regex(/^[a-zA-Z0-9._-]+$/),
    }).parse(request.params);
    const filePath = path.join(uploadRoot, folder, filename);
    let bytes: Buffer;
    try {
      bytes = await readFile(filePath);
    } catch {
      throw new NotFoundError("Media file");
    }
    const extension = path.extname(filename).toLowerCase();
    const mime = extension === ".pdf" ? "application/pdf"
      : extension === ".png" ? "image/png"
      : extension === ".jpg" || extension === ".jpeg" ? "image/jpeg"
      : extension === ".webp" ? "image/webp"
      : "application/octet-stream";
    return reply.type(mime).send(bytes);
  });

  app.delete("/admin/media/:folder/:filename", { preHandler: mediaGuards() }, async (request) => {
    const { folder, filename } = z.object({
      folder: z.enum(folders),
      filename: z.string().regex(/^[a-zA-Z0-9._-]+$/),
    }).parse(request.params);
    const filePath = path.join(uploadRoot, folder, filename);
    try {
      await unlink(filePath);
    } catch {
      throw new NotFoundError("Media file");
    }
    return { data: { deleted: true, folder, filename } };
  });
}
