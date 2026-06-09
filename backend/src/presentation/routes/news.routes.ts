import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { listPublishedNews } from "../../application/repositories/news.repository.js";

export async function newsRoutes(app: FastifyInstance) {
  app.get("/news", async (request) => {
    const query = z.object({ limit: z.coerce.number().min(1).max(50).default(20) }).parse(request.query);
    const posts = await listPublishedNews(query.limit);

    return {
      data: posts.map((post) => ({
        id: post.id,
        title: post.title,
        content: post.content,
        excerpt: post.content.length > 160 ? `${post.content.slice(0, 157)}...` : post.content,
        publishedAt: post.publishedAt,
        author: {
          id: post.author.id,
          name: `${post.author.firstName} ${post.author.lastName}`,
        },
      })),
    };
  });
}
