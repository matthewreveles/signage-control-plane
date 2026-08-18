import { timingSafeEqual } from "crypto";

export function hasValidUploadKey(
  supplied: string | null | undefined,
) {
  const expected = process.env.GSPAN_UPLOAD_KEY;

  if (!expected || !supplied) return false;

  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(supplied);

  if (expectedBuffer.length !== suppliedBuffer.length) {
    return false;
  }

  return timingSafeEqual(
    expectedBuffer,
    suppliedBuffer,
  );
}
