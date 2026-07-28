import { assertEquals } from "jsr:@std/assert@1";
import { timingSafeTextEqual } from "./crypto.ts";

Deno.test("timingSafeTextEqual accepts only the exact secret", async () => {
  assertEquals(
    await timingSafeTextEqual("a-long-secret", "a-long-secret"),
    true,
  );
  assertEquals(
    await timingSafeTextEqual("a-long-secret", "a-long-secreu"),
    false,
  );
  assertEquals(await timingSafeTextEqual("a-long-secret", ""), false);
});
