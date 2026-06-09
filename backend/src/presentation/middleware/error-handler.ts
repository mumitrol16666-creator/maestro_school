import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { AppError } from "../../domain/errors.js";
import { ZodError } from "zod";

export function errorHandler(
  error: FastifyError | Error,
  _request: FastifyRequest,
  reply: FastifyReply,
) {
  if (error instanceof AppError) {
    return reply.status(error.statusCode).send({
      error: {
        code: error.code ?? "APP_ERROR",
        message: error.message,
      },
    });
  }

  if (error instanceof ZodError) {
    return reply.status(400).send({
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid request",
        details: error.flatten(),
      },
    });
  }

  const statusCode = "statusCode" in error && typeof error.statusCode === "number"
    ? error.statusCode
    : 500;

  return reply.status(statusCode).send({
    error: {
      code: "INTERNAL_ERROR",
      message: statusCode < 500 ? error.message : "Internal server error",
    },
  });
}
