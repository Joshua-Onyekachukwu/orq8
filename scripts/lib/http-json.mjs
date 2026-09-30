/**
 * A JSON request that lets the process end.
 *
 * `fetch` was the obvious choice and the wrong one here: undici pools its
 * connection and keeps it referenced, so a script that fetches and then stops
 * never exits — and forcing it out with `process.exit()` aborts inside libuv on
 * Windows (`Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)`, exit 127),
 * which on a *passing* deployment turns a green gate red for no reason.
 *
 * `node:http` with `agent: false` and `connection: close` leaves no handle
 * behind, so a gate can set an exit code and stop like any other script. Zero
 * dependencies, which matters for a gate: nothing to install, nothing to break.
 */

import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";

export const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Send `method` to `url` and parse the body as JSON.
 *
 * Never throws: a network failure is a value (`ok: false`) because the caller's
 * job is to decide what an unreachable deployment means, and a gate that dies
 * with a stack trace reports less than one that says which host did not answer.
 */
export function requestJson(method, url, { body = undefined, headers = {}, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  return new Promise((resolve) => {
    let target;
    try {
      target = new URL(url);
    } catch {
      resolve({ ok: false, status: 0, error: `not a URL: ${url}`, body: null });
      return;
    }

    const payload = body === undefined ? null : Buffer.from(JSON.stringify(body), "utf8");
    const send = target.protocol === "https:" ? httpsRequest : httpRequest;
    const req = send(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || (target.protocol === "https:" ? 443 : 80),
        path: `${target.pathname}${target.search}`,
        method,
        headers: {
          accept: "application/json",
          ...(payload ? { "content-type": "application/json", "content-length": String(payload.length) } : {}),
          ...headers,
          connection: "close",
        },
        agent: false,
      },
      (res) => {
        let raw = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          raw += chunk;
        });
        res.on("end", () => {
          let parsed = null;
          try {
            parsed = JSON.parse(raw);
          } catch {
            /* a non-JSON body is reported as an empty one */
          }
          resolve({ ok: true, status: res.statusCode ?? 0, body: parsed });
        });
      },
    );

    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`no response within ${timeoutMs}ms`));
    });
    req.on("error", (err) => {
      resolve({ ok: false, status: 0, error: err instanceof Error ? err.message : String(err), body: null });
    });
    if (payload) req.write(payload);
    req.end();
  });
}

/** GET `url` and parse the body as JSON. */
export function getJson(url, options = {}) {
  return requestJson("GET", url, options);
}

/**
 * POST `json` to `url` and parse the body as JSON.
 *
 * A POST is how the gate fires the mail check: the deployment sends one real
 * message, so the request has a side effect by design and `POST` is the honest
 * verb for it.
 */
export function postJson(url, json, options = {}) {
  return requestJson("POST", url, { ...options, body: json ?? {} });
}
