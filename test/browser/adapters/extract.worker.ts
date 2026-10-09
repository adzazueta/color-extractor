/// <reference lib="webworker" />
import { extractColors } from "@/browser/index.js";

type Request =
  | { readonly kind: "bytes"; readonly bytes: Uint8Array }
  | { readonly kind: "blob"; readonly blob: Blob }
  | { readonly kind: "url"; readonly url: string };

self.addEventListener("message", (event: MessageEvent<Request>) => {
  const request = event.data;
  const input =
    request.kind === "bytes" ? request.bytes : request.kind === "blob" ? request.blob : request.url;
  extractColors(input).then(
    (result) => self.postMessage({ ok: true, result }),
    (error: unknown) =>
      self.postMessage({
        ok: false,
        code: (error as { code?: string }).code,
        message: String(error),
      }),
  );
});
