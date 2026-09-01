import { prisma, notDeleted } from "../../infrastructure/database/prisma.js";

export async function listPublishedNews(limit = 20, audience: "student" | "parent" = "student") {
  return prisma.newsPost.findMany({
    where: {
      ...notDeleted,
      isPublished: true,
      ...(audience === "parent" ? { showToParents: true } : { showToStudents: true }),
    },
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
