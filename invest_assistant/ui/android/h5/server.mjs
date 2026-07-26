import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import { brotliCompressSync, gzipSync, constants as zlibConstants } from "node:zlib";

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const host = option("--host", "0.0.0.0");
const port = Number(option("--port", "5174"));
const apiTarget = (process.env.VITE_API_PROXY_TARGET || "http://127.0.0.1:8000").replace(/\/$/, "");
const distRoot = resolve("dist");
const compressedCache = new Map();
const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".md", "text/markdown; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
  [".woff2", "font/woff2"]
]);

function requestBody(request) {
  return new Promise((resolveBody, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => resolveBody(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

async function proxyApi(request, response, url) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (
      value !== undefined
      && !["host", "connection", "content-length", "accept-encoding"].includes(name)
    ) {
      headers.set(name, Array.isArray(value) ? value.join(", ") : value);
    }
  }
  headers.set("accept-encoding", "identity");
  const method = request.method || "GET";
  const body = method === "GET" || method === "HEAD" ? undefined : await requestBody(request);
  const upstream = await fetch(`${apiTarget}${url.pathname}${url.search}`, {
    method,
    headers,
    body,
    redirect: "manual"
  });
  response.statusCode = upstream.status;
  for (const [name, value] of upstream.headers) {
    if (!["connection", "content-encoding", "content-length", "transfer-encoding"].includes(name)) {
      response.setHeader(name, value);
    }
  }
  if (method === "HEAD" || !upstream.body) {
    response.end();
    return;
  }
  Readable.fromWeb(upstream.body).pipe(response);
}

function compressedBody(filePath, source, acceptEncoding) {
  const compressible = /\.(?:css|html|js|json|md|svg)$/i.test(filePath);
  if (!compressible) return { body: source, encoding: null };
  if (acceptEncoding.includes("br")) {
    const key = `${filePath}:br`;
    if (!compressedCache.has(key)) {
      compressedCache.set(key, brotliCompressSync(source, {
        params: {
          [zlibConstants.BROTLI_PARAM_QUALITY]: 8
        }
      }));
    }
    return { body: compressedCache.get(key), encoding: "br" };
  }
  if (acceptEncoding.includes("gzip")) {
    const key = `${filePath}:gzip`;
    if (!compressedCache.has(key)) {
      compressedCache.set(key, gzipSync(source, { level: 9 }));
    }
    return { body: compressedCache.get(key), encoding: "gzip" };
  }
  return { body: source, encoding: null };
}

async function serveStatic(request, response, url) {
  const requestedPath = decodeURIComponent(url.pathname);
  const relativePath = requestedPath === "/" ? "index.html" : requestedPath.replace(/^\/+/, "");
  let filePath = resolve(distRoot, relativePath);
  if (!filePath.startsWith(`${distRoot}${sep}`) && filePath !== distRoot) {
    response.writeHead(403).end("Forbidden");
    return;
  }
  let fileStat = await stat(filePath).catch(() => null);
  if (!fileStat?.isFile()) {
    filePath = resolve(distRoot, "index.html");
    fileStat = await stat(filePath).catch(() => null);
  }
  if (!fileStat?.isFile()) {
    response.writeHead(503).end("Run npm run build before npm run serve.");
    return;
  }
  const source = await readFile(filePath);
  const { body, encoding } = compressedBody(
    filePath,
    source,
    request.headers["accept-encoding"] || ""
  );
  const immutable = requestedPath.startsWith("/assets/");
  response.setHeader(
    "Cache-Control",
    immutable ? "public, max-age=31536000, immutable" : "no-cache"
  );
  response.setHeader("Content-Type", mimeTypes.get(extname(filePath)) || "application/octet-stream");
  response.setHeader("Content-Length", body.length);
  response.setHeader("Vary", "Accept-Encoding");
  if (encoding) response.setHeader("Content-Encoding", encoding);
  if (request.method === "HEAD") response.end();
  else response.end(body);
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
    if (url.pathname.startsWith("/api/")) {
      await proxyApi(request, response, url);
    } else {
      await serveStatic(request, response, url);
    }
  } catch (error) {
    console.error(error);
    if (!response.headersSent) response.writeHead(502);
    response.end("Bad Gateway");
  }
});

server.listen(port, host, () => {
  console.log(`Liuli H5 production server listening on http://${host}:${port}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
