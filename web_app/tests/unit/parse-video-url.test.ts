import { test } from "node:test";
import assert from "node:assert/strict";
import { parseVideoUrl } from "../../src/lib/parse-video-url";

test("Instagram reels and posts embed, reels upright", () => {
  assert.deepEqual(parseVideoUrl("https://www.instagram.com/reel/C9xYz_1-ab/?igsh=abc"), {
    provider: "instagram", videoId: "C9xYz_1-ab", embedUrl: "https://www.instagram.com/reel/C9xYz_1-ab/embed", vertical: true,
  });
  assert.equal(parseVideoUrl("https://instagram.com/reels/C9xYz/")?.embedUrl, "https://www.instagram.com/reel/C9xYz/embed");
  assert.equal(parseVideoUrl("https://www.instagram.com/p/C9xYz/")?.vertical, false);
  assert.equal(parseVideoUrl("https://www.instagram.com/maestro.school/"), null);
});

test("TikTok full links embed; short links and profiles do not", () => {
  assert.deepEqual(parseVideoUrl("https://www.tiktok.com/@teacher/video/7300000000000000000?lang=ru"), {
    provider: "tiktok", videoId: "7300000000000000000", embedUrl: "https://www.tiktok.com/player/v1/7300000000000000000", vertical: true,
  });
  assert.equal(parseVideoUrl("https://vt.tiktok.com/ZSabc/"), null);
  assert.equal(parseVideoUrl("https://www.tiktok.com/@teacher"), null);
});

test("YouTube Shorts are upright, ordinary videos wide", () => {
  assert.equal(parseVideoUrl("https://youtube.com/shorts/abc123")?.vertical, true);
  assert.equal(parseVideoUrl("https://www.youtube.com/watch?v=abc123")?.vertical, undefined);
});
