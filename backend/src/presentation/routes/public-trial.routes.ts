import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { BadRequestError } from "../../domain/errors.js";
import { postOnlineLessonBooking } from "../../infrastructure/crm/crm-client.js";

const trialBookingSchema = z.object({
  firstName: z.string().trim().min(1).max(128),
  lastName: z.string().trim().min(1).max(128),
  phone: z.string().trim().min(10).max(32),
  direction: z.string().trim().min(1).max(255),
  level: z.string().trim().min(1).max(128),
  preferredTime: z.string().trim().min(1).max(512),
  comment: z.string().trim().max(4000).optional(),
});

export async function publicTrialRoutes(app: FastifyInstance) {
  app.post(
    "/trial-bookings",
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: "15 minutes",
        },
      },
    },
    async (request, reply) => {
      const body = trialBookingSchema.parse(request.body);
      const externalSourceId = `public-trial-${randomUUID()}`;

      try {
        const booking = await postOnlineLessonBooking({
          externalSourceId,
          requestType: "trial",
          name: body.firstName,
          lastName: body.lastName,
          phone: body.phone,
          direction: body.direction,
          level: body.level,
          preferredTime: body.preferredTime,
          comment: body.comment,
        });

        return reply.status(201).send({
          data: {
            bookingId: booking.crmBookingId,
            status: booking.status,
            replyChannel: "whatsapp",
          },
        });
      } catch (error) {
        console.error(
          "[public-trial] Failed to create CRM booking:",
          error instanceof Error ? error.message : error,
        );
        throw new BadRequestError(
          "Не удалось отправить заявку. Попробуйте ещё раз через несколько минут.",
          "CRM_BOOKING_FAILED",
        );
      }
    },
  );
}
