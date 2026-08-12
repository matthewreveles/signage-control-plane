import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function createDeviceToken() {
  return randomBytes(32).toString("base64url");
}

export function hashDeviceToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function requestHasValidDeviceToken(
  request: Request,
  expectedHash: string | null,
  options: { allowLegacy?: boolean } = {},
) {
  if (!expectedHash) return options.allowLegacy === true;

  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
  if (!token) return false;

  const actual = Buffer.from(hashDeviceToken(token));
  const expected = Buffer.from(expectedHash);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
