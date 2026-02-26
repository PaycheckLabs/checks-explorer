import { ImageResponse } from "@vercel/og";
import qrcode from "qrcode-generator-es6";
import { isValidSerialFormat, normalizeSerial } from "../../../../lib/serial";

export const config = {
  runtime: "edge",
};

export default async function handler(req: Request) {
  const reqUrl = new URL(req.url);
  const origin = reqUrl.origin;

  const last = reqUrl.pathname.split("/").pop() || "";
  const rawSerial = last.replace(/\.png$/i, "");
  const serial = normalizeSerial(rawSerial);

  if (!isValidSerialFormat(serial)) {
    return new Response("Invalid serial", { status: 400 });
  }

  // Always use the baked per-serial image
  const bgUrl = `${origin}/checks/testnet/${encodeURIComponent(serial)}.png`;

  // QR must route to the actual serial page
  const pageUrl = `${origin}/testnet/${encodeURIComponent(serial)}`;

  // Output size used by Explorer UI
  const W = 1200;
  const H = 800;

  // QR placement tuned for your baked templates
  const PAD_RIGHT = 120;
  const QR_SIZE = 280;
  const QR_Y = 360;
  const QR_X_BASE = W - PAD_RIGHT - QR_SIZE;
  const QR_X_NUDGE = 75;
  const QR_X = QR_X_BASE + QR_X_NUDGE;

  let qrDataUrl: string | null = null;

  // QR generation is best effort. If it fails, return the card image anyway.
  try {
    const qr = new qrcode(0, "M");
    qr.addData(pageUrl);
    qr.make();

    const qrSvg = qr.createSvgTag({ cellSize: 6, margin: 0 });
    qrDataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(qrSvg)}`;
  } catch {
    qrDataUrl = null;
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: W,
          height: H,
          position: "relative",
          backgroundColor: "#0b0f1a",
        }}
      >
        <img
          src={bgUrl}
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: W,
            height: H,
          }}
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
}
