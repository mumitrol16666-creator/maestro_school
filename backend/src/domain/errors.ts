export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code?: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(404, `${resource} not found`, "NOT_FOUND");
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized") {
    super(401, message, "UNAUTHORIZED");
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden") {
    super(403, message, "FORBIDDEN");
  }
}

export class BadRequestError extends AppError {
  constructor(message: string, code = "BAD_REQUEST") {
    super(400, message, code);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, code = "CONFLICT", details?: Record<string, unknown>) {
    super(409, message, code, details);
  }
}

/** The lesson belongs to a paid course the user has not paid for. 403, the client shows the paywall. */
export class CoursePaymentRequiredError extends AppError {
  constructor(courseId: string) {
    super(403, "Этот урок входит в платный курс. Оплатите курс, чтобы продолжить.", "COURSE_PAYMENT_REQUIRED", { courseId });
  }
}
