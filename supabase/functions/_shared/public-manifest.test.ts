import { assertEquals } from "jsr:@std/assert@1";
import {
  consumeRateLimit,
  omitHiddenRecognitionItems,
  publicManifestMatchesRelease,
  publicManifestResponseHeaders,
  type RateWindow,
  sanitizePublicManifest,
} from "./public-manifest.ts";

Deno.test("hidden recognition items stay internal and never reach TV/share", () => {
  assertEquals(
    omitHiddenRecognitionItems({
      schema: "unite-vinhdanh-release",
      playlist: [
        { id: "visible", kind: "recognition" },
        { id: "hidden", kind: "recognition", visibility_hidden: true },
        { id: "video", kind: "video" },
      ],
    }),
    {
      schema: "unite-vinhdanh-release",
      playlist: [
        { id: "visible", kind: "recognition" },
        { id: "video", kind: "video" },
      ],
    },
  );
});

Deno.test("public manifest must match its validated release identity", () => {
  assertEquals(
    publicManifestMatchesRelease(
      {
        import_batch_id: "batch-1",
        period_id: "2026-07",
      },
      "batch-1",
      "2026-07",
    ),
    true,
  );
  assertEquals(
    publicManifestMatchesRelease(
      {
        import_batch_id: "batch-old",
        period_id: "2026-07",
      },
      "batch-1",
      "2026-07",
    ),
    false,
  );
  assertEquals(
    publicManifestMatchesRelease(
      {
        import_batch_id: "batch-1",
        period_id: "2026-08",
      },
      "batch-1",
      "2026-07",
    ),
    false,
  );
  assertEquals(
    publicManifestMatchesRelease(
      {
        import_batch_id: "batch-1",
      },
      "batch-1",
      "2026-07",
    ),
    true,
  );
});

Deno.test("public manifest keeps approved display fields and removes internals", () => {
  assertEquals(
    sanitizePublicManifest({
      schema: "unite-vinhdanh-release",
      visibility_revision: "internal-revision",
      apiKey: "must-not-leak",
      authorization: "Bearer must-not-leak",
      playlist: [{
        title: "Thống Soái",
        mediaPath: "internal/video.mp4",
        media_url: "https://signed.example/video.mp4",
        bucket: "vinhdanh-media",
        recognition_board: {
          entries: [{
            rank: 1,
            employee_id: "U261:DOC1",
            employee_code: "U261",
            entity_code: "U261",
            name: "Trần Thị Huế",
            revenue: 960000,
            photo_path: "u261/photo.jpg",
            avatar_url: "https://signed.example/photo.jpg",
            sourceRowKeys: ["DS_KV:3:U261"],
            credentials: { token: "must-not-leak" },
          }],
        },
      }],
    }),
    {
      schema: "unite-vinhdanh-release",
      playlist: [{
        title: "Thống Soái",
        media_url: "https://signed.example/video.mp4",
        recognition_board: {
          entries: [{
            rank: 1,
            name: "Trần Thị Huế",
            revenue: 960000,
            avatar_url: "https://signed.example/photo.jpg",
          }],
        },
      }],
    },
  );
});

Deno.test("public manifest never reuses dynamic signed URLs from cache", () => {
  assertEquals(
    publicManifestResponseHeaders(),
    { "Cache-Control": "no-store" },
  );
});

Deno.test("public manifest limiter resets its fixed window", () => {
  const windows = new Map<string, RateWindow>();
  assertEquals(consumeRateLimit(windows, "ip", 0, 2, 1000).allowed, true);
  assertEquals(consumeRateLimit(windows, "ip", 10, 2, 1000).allowed, true);
  assertEquals(consumeRateLimit(windows, "ip", 20, 2, 1000), {
    allowed: false,
    retryAfterSeconds: 1,
  });
  assertEquals(consumeRateLimit(windows, "ip", 1000, 2, 1000).allowed, true);
});
