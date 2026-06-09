import { prisma, notDeleted } from "../../infrastructure/database/prisma.js";

export async function listPublishedNews(limit = 20) {
  return prisma.newsPost.findMany({
    where: { ...notDeleted, isPublished: true },
    orderBy: { publishedAt: "desc" },
    take: limit,
    select: {
      id: true,
      title: true,
      content: true,
      publishedAt: true,
      author: { select: { id: true, firstName: true, lastName: true } },
    },
  });
}
