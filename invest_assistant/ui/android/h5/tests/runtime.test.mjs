import { execFileSync, spawn } from "node:child_process";
import { createServer } from "node:http";
import { once } from "node:events";
import { readFileSync, statSync } from "node:fs";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";

const previewPort = 15174;
let apiServer;
let previewProcess;

async function waitForUrl(url) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
    } catch {
      // The preview process is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function stopOwnedProcess(child) {
  if (!child?.pid || child.exitCode !== null) return;
  if (process.platform === "win32") {
    try {
      execFileSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" });
    } catch {
      // Process may have exited between the check and taskkill.
    }
    return;
  }
  child.kill("SIGTERM");
}

before(async () => {
  apiServer = createServer((request, response) => {
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ proxied: request.url === "/api/auth/me" }));
  });
  apiServer.listen(0, "127.0.0.1");
  await once(apiServer, "listening");
  const apiPort = apiServer.address().port;
  const command = process.platform === "win32"
    ? (process.env.ComSpec || "cmd.exe")
    : "npm";
  const args = process.platform === "win32"
    ? [
        "/d",
        "/s",
        "/c",
        `npm.cmd run serve -- --host 127.0.0.1 --port ${previewPort}`
      ]
    : ["run", "serve", "--", "--host", "127.0.0.1", "--port", String(previewPort)];
  previewProcess = spawn(
    command,
    args,
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        VITE_API_PROXY_TARGET: `http://127.0.0.1:${apiPort}`
      },
      stdio: "ignore"
    }
  );
  await waitForUrl(`http://127.0.0.1:${previewPort}/`);
});

after(async () => {
  stopOwnedProcess(previewProcess);
  if (apiServer) {
    apiServer.close();
    await once(apiServer, "close");
  }
});

describe("production H5 runtime", () => {
  it("serves hashed assets without the Vite development client", async () => {
    const response = await fetch(`http://127.0.0.1:${previewPort}/`);
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.match(html, /\/assets\/[^"']+\.[a-z0-9_-]+/i);
    assert.doesNotMatch(html, /\/@vite\/client|react-refresh/i);
    assert.doesNotMatch(readFileSync("dist/index.html", "utf8"), /\/@vite\/client|react-refresh/i);
  });

  it("keeps the API proxy active in production mode", async () => {
    const response = await fetch(`http://127.0.0.1:${previewPort}/api/auth/me`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { proxied: true });
  });

  it("compresses hashed assets and gives them immutable cache headers", async () => {
    const html = await fetch(`http://127.0.0.1:${previewPort}/`).then((response) => response.text());
    const assetPath = html.match(/\/(assets\/[^"']+\.js)/)?.[1];
    assert.ok(assetPath);

    const response = await fetch(`http://127.0.0.1:${previewPort}/${assetPath}`, {
      headers: { "Accept-Encoding": "br, gzip" }
    });
    assert.equal(response.headers.get("content-encoding"), "br");
    assert.match(response.headers.get("cache-control") ?? "", /public.*max-age=31536000.*immutable/);
    const encodedSize = Number(response.headers.get("content-length"));
    assert.ok(encodedSize > 0);
    assert.ok(encodedSize < statSync(`dist/${assetPath}`).size / 2);
  });

  it("keeps the initial route shell below the mobile transfer budget", () => {
    const html = readFileSync("dist/index.html", "utf8");
    const entryPath = html.match(/\/(assets\/[^"']+\.js)/)?.[1];
    assert.ok(entryPath);
    assert.ok(
      statSync(`dist/${entryPath}`).size < 300_000,
      "initial route shell must stay below 300KB before compression"
    );
  });
});
