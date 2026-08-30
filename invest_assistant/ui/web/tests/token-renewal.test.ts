import assert from "node:assert/strict";
import test from "node:test";

import { saveRenewedAccessToken } from "../src/api/token-renewal.ts";

test("saves the renewed access token returned by the API", () => {
  const stored = new Map<string, string>();
  const storage = {
    setItem(key: string, value: string) {
      stored.set(key, value);
    }
  };

  saveRenewedAccessToken("renewed-web-token", storage);

  assert.equal(stored.get("liuli.auth.token"), "renewed-web-token");
});
