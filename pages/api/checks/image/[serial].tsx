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

  // QR routes to the clean canonical link
  const pageUrl = `${origin}/${serial}`;

  const qr = new qrcode(0, "M");
  qr.addData(pageUrl);
  qr.make();
  const qrSvg = qr.createSvgTag({ cellSize: 6, margin: 0 });
  const qrDataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(qrSvg)}`;

  // QR placement
  const PAD_RIGHT = 120;
  const QR_SIZE = 280;
  const QR_Y = 360;

  const QR_X_BASE = 1200 - PAD_RIGHT - QR_SIZE;

  // If your last "almost perfect" was around 72, push it 3px more:
  const QR_X_NUDGE = 75; // +3px
  const QR_X = QR_X_BASE + QR_X_NUDGE;

  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 800,
          position: "relative",
          display: "flex",
          background: "#0b1220",
        }}
      >
        <img
          src={chosenImg}
          width={1200}
          height={800}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />

        <div
          style={{
            position: "absolute",
            left: QR_X,
            top: QR_Y,
            width: QR_SIZE,
            height: QR_SIZE,
            background: "#ffffff",
            borderRadius: 16,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 14,
          }}
        >
          <img src={qrDataUrl} width={QR_SIZE - 28} height={QR_SIZE - 28} />
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 800,
      headers: {
        "cache-control": "public, no-transform, max-age=600",
      },
    }
  );
}
