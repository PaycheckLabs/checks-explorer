import { ImageResponse } from "@vercel/og";
import qrcode from "qrcode-generator-es6";
import { isValidSerialFormat, normalizeSerial } from "../../../../lib/serial";

export const config = { runtime: "edge" };

function toBase64(ab: ArrayBuffer) {
  // Edge-safe base64 (no Buffer)
  const bytes = new Uint8Array(ab);
  let binary = "";
  const chunk = 0x4000; // 16KB chunks to avoid call stack issues
  for (let i = 0; i < bytes.length; i += chunk) {
    const slice = bytes.subarray(i, i + chunk);
    for (let j = 0; j < slice.length; j++) binary += String.fromCharCode(slice[j]);
  }
  return btoa(binary);
}

export default async function handler(req: Request) {
  try {
    const reqUrl = new URL(req.url);
    const origin = reqUrl.origin;

    const last = reqUrl.pathname.split("/").pop() || "";
    const rawSerial = last.replace(/\.png$/i, "");
    const serial = normalizeSerial(rawSerial);

    if (!isValidSerialFormat(serial)) {
      return new Response("Invalid serial", { status: 400 });
    }

    // Always try baked per-serial image first
    const serialImgUrl = `${origin}/checks/testnet/${encodeURIComponent(serial)}.png`;
    const fallbackImgUrl = `${origin}/check-bg.png`;

    let bgRes = await fetch(serialImgUrl);
    if (!bgRes.ok) bgRes = await fetch(fallbackImgUrl);
    if (!bgRes.ok) {
      return new Response("Missing background image", { status: 404 });
    }

    const bgAb = await bgRes.arrayBuffer();
    const bgB64 = toBase64(bgAb);
    const bgDataUrl = `data:image/png;base64,${bgB64}`;

    // QR routes to the actual serial page
    const pageUrl = `${origin}/testnet/${encodeURIComponent(serial)}`;

    let qrDataUrl: string | null = null;
    try {
      const qr = new qrcode(0, "M");
      qr.addData(pageUrl);
      qr.make();
      const qrSvg = qr.createSvgTag({ cellSize: 6, margin: 0 });
      qrDataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(qrSvg)}`;
    } catch {
      qrDataUrl = null;
    }

    const W = 1200;
    const H = 800;

    // QR placement tuned for your baked templates
    const PAD_RIGHT = 120;
    const QR_SIZE = 280;
    const QR_Y = 360;
    const QR_X_BASE = W - PAD_RIGHT - QR_SIZE;
    const QR_X_NUDGE = 75;
    const QR_X = QR_X_BASE + QR_X_NUDGE;

    return new ImageResponse(
      (
        <div style={{ width: W, height: H, position: "relative", background: "#0b0f1a" }}>
          <img
            src={bgDataUrl}
            style={{ position: "absolute", left: 0, top: 0, width: W, height: H }}
          />

          {qrDataUrl ? (
            <img
              src={qrDataUrl}
              style={{
                position: "absolute",
                left: QR_X,
                top: QR_Y,
                width: QR_SIZE,
                height: QR_SIZE,
              }}
            />
          ) : null}
        </div>
      ),
      {
        width: W,
        height: H,
        headers: {
          "cache-control": "public, no-transform, max-age=600",
        },
      }
    );
  } catch (e: any) {
    // If anything blows up, return a readable error (so we can debug quickly)
    return new Response(`Image endpoint failed: ${String(e?.message || e)}`, {
      status: 500,
    });
  }
}
