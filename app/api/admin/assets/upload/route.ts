import {
  handleUpload,
  type HandleUploadBody,
} from "@vercel/blob/client";

import { NextResponse } from "next/server";

import { hasValidUploadKey } from "@/lib/upload-auth";

export const runtime = "nodejs";

export async function POST(
  request: Request,
): Promise<NextResponse> {
  const body =
    (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,

      onBeforeGenerateToken: async (
        pathname,
        clientPayload,
      ) => {
        let suppliedKey = "";

        try {
          const payload = JSON.parse(
            clientPayload || "{}",
          );

          suppliedKey =
            typeof payload.uploadKey === "string"
              ? payload.uploadKey
              : "";
        } catch {
          suppliedKey = "";
        }

        if (!hasValidUploadKey(suppliedKey)) {
          throw new Error("Invalid upload key");
        }

        if (!pathname.startsWith("gspan-assets/")) {
          throw new Error(
            "Invalid asset pathname",
          );
        }

        return {
          allowedContentTypes: [
            "image/jpeg",
            "image/png",
            "image/webp",
          ],
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({
            source: "GSPAN_ASSET_LIBRARY",
          }),
        };
      },

      onUploadCompleted: async ({ blob }) => {
        console.log(
          "G-SPAN Blob upload completed:",
          blob.pathname,
        );
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Upload authorization failed",
      },
      { status: 400 },
    );
  }
}
