import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import https from "node:https";

export const DOT_EVENT = "starlim.question.created";
export const DOT_SCOPE = "starlim:consult";
export const hash = (value) => createHash("sha256").update(value).digest("hex");
export const nonce = () => randomBytes(32).toString("base64url");
export const pkce = (value) =>
  createHash("sha256").update(value).digest("base64url");
export function equal(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && timingSafeEqual(a, b);
}
export function validRedirect(value) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.hash &&
      url.hostname === "chatgpt.com" &&
      (url.pathname === "/connector_platform_oauth_redirect" ||
        /^\/connector\/oauth\/[a-zA-Z0-9_-]+$/.test(url.pathname))
    );
  } catch {
    return false;
  }
}
const blocked = new BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
])
  blocked.addSubnet(address, prefix, "ipv4");
const globalV6 = new BlockList();
globalV6.addSubnet("2000::", 3, "ipv6");
blocked.addSubnet("2001:db8::", 32, "ipv6");
blocked.addSubnet("2002::", 16, "ipv6");
blocked.addSubnet("2001::", 32, "ipv6");
export function publicAddress(address) {
  const family = isIP(address);
  return family === 4
    ? !blocked.check(address, "ipv4")
    : family === 6 &&
        globalV6.check(address, "ipv6") &&
        !blocked.check(address, "ipv6");
}
export function signingKey(secret) {
  if (
    typeof secret !== "string" ||
    !/^whsec_[A-Za-z0-9+/]+={0,2}$/.test(secret)
  )
    throw new Error("Invalid signing secret");
  const key = Buffer.from(secret.slice(6), "base64");
  if (key.length < 24 || key.length > 64)
    throw new Error("Invalid signing secret");
  return key;
}
export function signedHeaders(
  subscription,
  id,
  body,
  timestamp = Math.floor(Date.now() / 1000),
) {
  const signature = createHmac("sha256", signingKey(subscription.secret))
    .update(`${id}.${timestamp}.${body}`)
    .digest("base64");
  return {
    "Content-Type": "application/json",
    "webhook-id": id,
    "webhook-timestamp": String(timestamp),
    "webhook-signature": `v1,${signature}`,
    "X-MCP-Subscription-Id": subscription.id,
  };
}
// Validate DNS on every connection and pin the resolved address to prevent DNS rebinding.
export async function postWebhook(urlValue, body, headers, resolve = lookup) {
  const url = new URL(urlValue);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.hash ||
    (url.port && url.port !== "443")
  )
    throw new Error("Invalid callback URL");
  if (Buffer.byteLength(body) > 262144) throw new Error("Event too large");
  const addresses = await resolve(url.hostname, { all: true });
  if (
    !addresses.length ||
    addresses.some(({ address }) => !publicAddress(address))
  )
    throw new Error("Non-public callback address");
  const destination = addresses[0];
  return new Promise((resolveResponse, reject) => {
    const request = https.request(
      url,
      {
        method: "POST",
        headers,
        timeout: 10000,
        // Node's automatic family selection requests all addresses. Return the
        // pinned, validated address in the shape requested by its resolver.
        lookup: (_hostname, options, callback) =>
          options.all
            ? callback(null, [destination])
            : callback(null, destination.address, destination.family),
      },
      (response) => {
        let responseBody = "";
        response.on("data", (chunk) => {
          responseBody += chunk;
          if (responseBody.length > 16384)
            request.destroy(new Error("Callback response too large"));
        });
        response.on("end", () =>
          resolveResponse({
            status: response.statusCode ?? 500,
            body: responseBody,
          }),
        );
        response.on("error", reject);
      },
    );
    request.on("timeout", () => request.destroy(new Error("Callback timeout")));
    request.on("error", reject);
    request.end(body);
  });
}
export async function verifyCallback(subscription, send = postWebhook) {
  const challenge = nonce();
  const body = JSON.stringify({ type: "verification", challenge });
  const response = await send(
    subscription.url,
    body,
    signedHeaders(subscription, `verify_${nonce()}`, body),
  );
  let returned;
  try {
    returned = JSON.parse(response.body).challenge;
  } catch {
    /* invalid challenge */
  }
  if (
    response.status < 200 ||
    response.status >= 300 ||
    !equal(returned, challenge)
  )
    throw new Error("Callback verification failed");
}
export function questionEvent(request) {
  return {
    eventId: `question_${request.id}`,
    name: DOT_EVENT,
    timestamp: request.created_at,
    data: { requestId: request.id, question: request.question },
    cursor: null,
  };
}
export function retryDelay(attempt) {
  return Math.min(300000, 5000 * 2 ** Math.min(attempt, 6));
}
export function terminalDelivery(status) {
  return status === 410 || status === 413;
}
