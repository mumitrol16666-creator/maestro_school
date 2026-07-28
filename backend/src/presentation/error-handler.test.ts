import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import { validationErrorMessage } from "./middleware/error-handler.js";

test("validation errors prefer a localized field message", () => {
  const schema = z.object({
    phone: z.string().min(10, "Укажите корректный номер телефона"),
  });
  const result = schema.safeParse({ phone: "123" });
  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(validationErrorMessage(result.error), "Укажите корректный номер телефона");
  }
});

test("validation errors use a Russian fallback for default Zod messages", () => {
  const result = z.object({ login: z.string().min(3) }).safeParse({ login: "" });
  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(validationErrorMessage(result.error), "Проверьте правильность заполнения полей");
  }
});
