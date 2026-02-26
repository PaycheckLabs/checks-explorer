import { ImageResponse } from "@vercel/og";
import type { NextRequest } from "next/server";
import qrcode from "qrcode-generator-es6";
import { isValidSerialFormat, normalizeSerial } from "../../../../lib/serial";

export const config = {
  runtime: "edge",
};

// Use GET instead of HEAD (more reliable across CDNs)
async function urlOk(url: string): Promise<boolean> {
  try {
    const res = await fetch(url);
    return res.ok;
  } catch {
    return false;
  }
}

export default async function handler(req: NextRequest) {
  const reqUrl = new URL(req.url);
  const origin = reqUrl.origin;

  const last = reqUrl.pathname.split("/").pop() || "";
  const rawSerial = last.replace(/\.png$/i, "");
  const serial = normalizeSerial(rawSerial);

  if (!isValidSerialFormat(serial)) {
    return new Response("Invalid serial", { status: 400 });
  }

  // Prefer baked per-serial image, fallback to generic bg if missing
  const serialImg = `${origin}/checks/testnet/${encodeURIComponent(serial)}.png`;
  const fallbackImg = `${origin}/check-bg.png`;
  const chosenImg = (await urlOk(serialImg)) ? serialImg : fallbackImg;

  // QR must route to the actual serial page
  const pageUrl = `${origin}/testnet/${encodeURIComponent(serial)}`;

  const qr = new qrcode(0, "M");
  qr.addData(pageUrl);
  qr.make();

  const qrSvg = qr.createSvgTag({ cellSize: 6, margin: 0 });
  const qrDataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(qrSvg)}`;

  // Image output size (stable)
  const W = 1200;
  const H = 800;

  // QR placement tuned for your baked template
  const PAD_RIGHT = 120;
  const QR_SIZE = 280;
  const QR_Y = 360;
  const QR_X_BASE = W - PAD_RIGHT - QR_SIZE;

  // Keep this as the only tuning knob if you ever need micro-adjustments
  const QR_X_NUDGE = 75;
  const QR_X = QR_X_BASE + QR_X_NUDGE;

  return new ImageResponse(
    (
      <div
        style={{
          width: W,
          height: H,
          position: "relative",
          backgroundColor: "#000",
        }}
      >
        <img
          src={chosenImg}
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: W,
            height: H,
          }}
        />

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
