import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { BadRequestError, NotFoundError } from "../../domain/errors.js";
import { listMaterialUsagesByUrlSuffix } from "../../application/repositories/cms.repository.js";
import {
  deleteMediaFile,
  getMediaInfo,
  inferMimeType,
  mediaDirectory,
  mediaFilePath,
  mediaFolderFor,
  mediaFolders,
  mediaPath,
  readMediaMetadata,
  type MediaFolder,
  updateMediaMetadata,
  writeMediaFile,
} from "../../application/services/media-storage.service.js";
import { authenticate, requireContentAdmin, requirePermission } from "../guards/auth.guards.js";
import { authorizeMediaRequest } from "../guards/media-session.js";

const mediaGuards = () => [authenticate, requireContentAdmin, requirePermission("catalog.manage")];
const mediaReadGuards = [authenticate, requirePermission("offline_school.read")];

export async function mediaRoutes(app: FastifyInstance) {
  app.get("/admin/media", { preHandler: mediaReadGuards }, async (request) => {
    const query = z.object({
      search: z.string().optional(),
      folder: z.enum(mediaFolders).optional(),
    }).parse(request.query);
    const folders = query.folder ? [query.folder] as MediaFolder[] : mediaFolders;
    const search = query.search?.trim().toLowerCase() ?? "";
    const items = (await Promise.all(folders.map(async (folder) => {
      const directory = mediaDirectory(folder);
      await mkdir(directory, { recursive: true });
      const filenames = (await readdir(directory)).filter((filename) => !filename.endsWith(".meta.json"));
      return Promise.all(filenames.map((filename) => getMediaInfo(folder, filename, request)));
    }))).flat().filter((item) => item !== null);
    const filtered = search
      ? items.filter((item) => item.title.toLowerCase().includes(search)
        || item.originalFilename.toLowerCase().includes(search)
        || item.filename.toLowerCase().includes(search))
      : items;
    filtered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return { data: filtered };
  });

  app.post("/admin/media", { preHandler: mediaGuards() }, async (request, reply) => {
    const body = z.object({
      filename: z.string().min(1).max(255),
      mimeType: z.string().min(1).max(255),
      title: z.string().trim().min(1).max(255).optional(),
      description: z.string().trim().max(2000).optional(),
      base64: z.string().min(1),
    }).parse(request.body);
    const bytes = Buffer.from(body.base64, "base64");
    if (bytes.length > 20 * 1024 * 1024) throw new BadRequestError("File is larger than 20 MB");
    const mimeType = inferMimeType(body.filename, body.mimeType);
    const folder = mediaFolderFor(mimeType);
    const extension = path.extname(body.filename).toLowerCase().replace(/[^a-z0-9.]/g, "");
    const filename = `${randomUUID()}${extension}`;
    await writeMediaFile(folder, filename, bytes, {
      originalFilename: body.filename,
      mimeType,
      title: body.title || body.filename,
      description: body.description,
    });

    return reply.status(201).send({
      data: {
        filename,
        originalFilename: body.filename,
        title: body.title || body.filename,
        description: body.description || null,
        folder,
        mimeType,
        size: bytes.length,
        createdAt: new Date(),
        url: mediaPath(folder, filename),
      },
    });
  });

  // Plan 1.12: files are no longer public. Signed-in users load them through the header session
  // or the media cookie; avatars stay public for CRM. Video and audio seek with HTTP ranges.
  app.get("/media/:folder/:filename", async (request, reply) => {
    const { folder, filename } = z.object({
      folder: z.enum(mediaFolders),
      filename: z.string().regex(/^[a-zA-Z0-9._-]+$/),
    }).parse(request.params);
    const query = z.object({ download: z.enum(["1", "true"]).optional() }).parse(request.query);
    if (filename.endsWith(".meta.json")) throw new NotFoundError("Media file");
    const access = await authorizeMediaRequest(request, folder, filename);
    const filePath = mediaFilePath(folder, filename);
    let size: number;
    try {
      const info = await stat(filePath);
      if (!info.isFile()) throw new Error("not a file");
      size = info.size;
    } catch {
      throw new NotFoundError("Media file");
    }
    const extension = path.extname(filename).toLowerCase();
    const metadata = await readMediaMetadata(folder, filename);
    const mime = metadata?.mimeType || inferMimeType(filename, "");
    if (query.download) {
      const requestedName = metadata?.title?.trim() || metadata?.originalFilename || filename;
      const originalExtension = path.extname(metadata?.originalFilename || filename);
      const downloadName = path.extname(requestedName) ? requestedName : `${requestedName}${originalExtension || extension}`;
      reply.header("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(downloadName)}`);
    }
    reply.header("Cache-Control", access === "public" ? "public, max-age=3600" : "private, max-age=3600");
    reply.header("Vary", "Cookie, Authorization");
    reply.header("Accept-Ranges", "bytes");
    // PDFs are previewed in a frame on the site itself.
    reply.header("X-Frame-Options", "SAMEORIGIN");
    reply.type(mime);

    const range = /^bytes=(\d*)-(\d*)$/.exec(String(request.headers.range ?? ""));
    if (range && size > 0) {
      let start = range[1] ? Number(range[1]) : size - Number(range[2]);
      let end = range[1] && range[2] ? Number(range[2]) : size - 1;
      if (!range[1]) start = Math.max(0, start);
      end = Math.min(end, size - 1);
      if (!Number.isFinite(start) || start > end || start >= size) {
        return reply.status(416).header("Content-Range", `bytes */${size}`).send();
      }
      reply.status(206);
      reply.header("Content-Range", `bytes ${start}-${end}/${size}`);
      reply.header("Content-Length", String(end - start + 1));
      return reply.send(createReadStream(filePath, { start, end }));
    }
    reply.header("Content-Length", String(size));
    return reply.send(createReadStream(filePath));
  });

  app.patch("/admin/media/:folder/:filename", { preHandler: mediaGuards() }, async (request) => {
    const { folder, filename } = z.object({
      folder: z.enum(mediaFolders),
      filename: z.string().regex(/^[a-zA-Z0-9._-]+$/),
    }).parse(request.params);
    const { title, description } = z.object({
      title: z.string().trim().min(1).max(255).optional(),
      description: z.string().trim().max(2000).nullable().optional(),
    }).refine((body) => body.title !== undefined || body.description !== undefined, "Metadata is required").parse(request.body);
    try {
      await updateMediaMetadata(folder, filename, { title, description });
      const media = await getMediaInfo(folder, filename, request);
      if (!media) throw new NotFoundError("Media file");
      return { data: media };
    } catch {
      throw new NotFoundError("Media file");
    }
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
