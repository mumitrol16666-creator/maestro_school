import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { BadRequestError, NotFoundError } from "../../domain/errors.js";
import { listMaterialUsagesByUrlSuffix } from "../../application/repositories/cms.repository.js";
import {
  deleteMediaFile,
  getMediaInfo,
  mediaDirectory,
  mediaFilePath,
  mediaFolderFor,
  mediaFolders,
  writeMediaFile,
} from "../../application/services/media-storage.service.js";
import { authenticate, requireContentAdmin, requirePermission } from "../guards/auth.guards.js";

const mediaGuards = () => [authenticate, requireContentAdmin, requirePermission("catalog.manage")];

export async function mediaRoutes(app: FastifyInstance) {
  app.get("/admin/media", { preHandler: mediaGuards() }, async (request) => {
    const items = (await Promise.all(mediaFolders.map(async (folder) => {
      const directory = mediaDirectory(folder);
      await mkdir(directory, { recursive: true });
      const filenames = (await readdir(directory)).filter((filename) => !filename.endsWith(".meta.json"));
      return Promise.all(filenames.map((filename) => getMediaInfo(folder, filename, request)));
    }))).flat().filter((item) => item !== null);
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
    const folder = mediaFolderFor(body.mimeType);
    const extension = path.extname(body.filename).toLowerCase().replace(/[^a-z0-9.]/g, "");
    const filename = `${randomUUID()}${extension}`;
    await writeMediaFile(folder, filename, bytes, { originalFilename: body.filename, mimeType: body.mimeType });

    return reply.status(201).send({
      data: {
        filename,
        originalFilename: body.filename,
        folder,
        mimeType: body.mimeType,
        size: bytes.length,
        createdAt: new Date(),
        url: `${request.protocol}://${request.host}/api/v1/media/${folder}/${filename}`,
      },
    });
  });

  app.get("/media/:folder/:filename", async (request, reply) => {
    const { folder, filename } = z.object({
      folder: z.enum(mediaFolders),
      filename: z.string().regex(/^[a-zA-Z0-9._-]+$/),
    }).parse(request.params);
    if (filename.endsWith(".meta.json")) throw new NotFoundError("Media file");
    const filePath = mediaFilePath(folder, filename);
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
      folder: z.enum(mediaFolders),
      filename: z.string().regex(/^[a-zA-Z0-9._-]+$/),
    }).parse(request.params);
    try {
      await deleteMediaFile(folder, filename);
    } catch {
      throw new NotFoundError("Media file");
    }
    return { data: { deleted: true, folder, filename } };
  });

  app.get("/admin/media/:folder/:filename/usages", { preHandler: mediaGuards() }, async (request) => {
    const { folder, filename } = z.object({
      folder: z.enum(mediaFolders),
      filename: z.string().regex(/^[a-zA-Z0-9._-]+$/),
    }).parse(request.params);
    return { data: await listMaterialUsagesByUrlSuffix(`/api/v1/media/${folder}/${filename}`) };
  });
}
