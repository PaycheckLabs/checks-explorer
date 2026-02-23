import { ImageResponse } from "@vercel/og";
import type { NextRequest } from "next/server";
import qrcode from "qrcode-generator-es6";

import serials from "../../../../data/testnet-serials.json";
import { isValidSerialFormat, normalizeSerial } from "../../../../lib/serial";

export const config = {
  runtime: "edge",
};

type SerialRecord = {
  chainId: number;
  network: string;
  contract: string;
  tokenId: number;
  mintTx?: string;
  redeemTx?: string;
  transferTx?: string;
  voidTx?: string;
  claimableAt?: number;
};

const DEV_SENDER = "0x3E8f069a088369B62CAB761633b80fBCB941a379";
const DEV_RECEIVER = "0x0D5d6388e3E512a94a52284B36DB802De2226330";

function shortAddr(addr: string): string {
  const a = (addr || "").trim();
  if (!a.startsWith("0x") || a.length < 10) return a || "—";
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

async function fetchFontSafe(url: string): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}

export default async function handler(req: NextRequest) {
  try {
    const reqUrl = new URL(req.url);
    const origin = reqUrl.origin;

    const last = reqUrl.pathname.split("/").pop() || "";
    const rawSerial = last.replace(/\.png$/i, "");
    const serial = normalizeSerial(rawSerial);

    if (!isValidSerialFormat(serial)) {
      return new Response("Invalid serial", { status: 400 });
    }

    const record =
      (serials as Record<string, SerialRecord | undefined>)[serial] || null;

    // Assets are referenced directly, no base64 conversion
    const bgUrl = `${origin}/check-bg.png`;

    // Load fonts (optional)
    const [kanitRegular, kanitMedium] = await Promise.all([
      fetchFontSafe(`${origin}/fonts/Kanit-Regular.ttf`),
      fetchFontSafe(`${origin}/fonts/Kanit-Medium.ttf`),
    ]);

    const fonts =
      kanitRegular && kanitMedium
        ? [
            { name: "Kanit", data: kanitRegular, weight: 400 as const, style: "normal" as const },
            { name: "Kanit", data: kanitMedium, weight: 500 as const, style: "normal" as const },
          ]
        : undefined;

    // QR points to serial page
    const pageUrl = `${origin}/testnet/${serial}`;
    const qr = new qrcode(0, "M");
    qr.addData(pageUrl);
    qr.make();
    const qrSvg = qr.createSvgTag({ cellSize: 6, margin: 0 });
    const qrDataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(qrSvg)}`;

    // Header placeholders for M1
    const tokenName = "Mock USD";
    const tokenSymbol = "mUSD";
    const amountNumber = "100";
    const titleText = "Testnet Payment Check";

    // Body values
    const typeValue = "Payment";
    const sentDateValue = "Testnet";
    const senderValue = shortAddr(DEV_SENDER);
    const receiverValue = shortAddr(DEV_RECEIVER);
    const conditionsValue =
      record?.claimableAt && record.claimableAt > 0 ? "Postdated" : "None";

    // Layout constants (tune later)
    const PAD_X = 84;

    const TOKEN_ROW_Y = 46;
    const TITLE_Y = 132;

    const VALUE_X = 430;
    const TYPE_Y = 360;
    const SENT_Y = 424;
    const SENDER_Y = 488;
    const RECEIVER_Y = 552;
    const CONDITIONS_Y = 616;

    const QR_SIZE = 280;
    const QR_X = 1200 - PAD_X - QR_SIZE;
    const QR_Y = 360;

    const SERIAL_BOTTOM_PAD = 54;

    return new ImageResponse(
      (
        <div
          style={{
            width: 1200,
            height: 800,
            position: "relative",
            background: "#0b1220",
          }}
        >
          {/* Background template */}
          <img
            src={bgUrl}
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

          {/* Token icon placeholder */}
          <div
            style={{
              position: "absolute",
              left: PAD_X,
              top: TOKEN_ROW_Y,
              width: 54,
              height: 54,
              borderRadius: 999,
              background: "rgba(255,255,255,0.16)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "rgba(255,255,255,0.92)",
              fontFamily: "Kanit, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
              fontWeight: 500,
              fontSize: 22,
            }}
          >
            {tokenSymbol[0]}
          </div>

          {/* Token name (Kanit Regular 18) */}
          <div
            style={{
              position: "absolute",
              left: PAD_X + 72,
              top: TOKEN_ROW_Y + 10,
              color: "rgba(255,255,255,0.92)",
              fontFamily: "Kanit, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
              fontWeight: 400,
              fontSize: 18,
            }}
          >
            {tokenName}
          </div>

          {/* Amount (Kanit Medium 22; symbol dimmer) */}
          <div
            style={{
              position: "absolute",
              right: PAD_X,
              top: TOKEN_ROW_Y + 6,
              display: "flex",
              gap: 10,
              alignItems: "baseline",
              fontFamily: "Kanit, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
              fontWeight: 500,
              fontSize: 22,
              color: "rgba(255,255,255,0.92)",
            }}
          >
            <span>{amountNumber}</span>
            <span style={{ opacity: 0.78 }}>{tokenSymbol}</span>
          </div>

          {/* Title (Kanit Medium 24) */}
          <div
            style={{
              position: "absolute",
              left: PAD_X,
              top: TITLE_Y,
              color: "rgba(255,255,255,0.92)",
              fontFamily: "Kanit, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
              fontWeight: 500,
              fontSize: 24,
            }}
          >
            {titleText}
          </div>

          {/* Values column (Kanit Medium 16) */}
          <div
            style={{
              position: "absolute",
              left: VALUE_X,
              top: 0,
              color: "rgba(255,255,255,0.92)",
              fontFamily: "Kanit, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
              fontWeight: 500,
              fontSize: 16,
              lineHeight: "24px",
              letterSpacing: "-0.1px",
            }}
          >
            <div style={{ position: "absolute", top: TYPE_Y }}>{typeValue}</div>
            <div style={{ position: "absolute", top: SENT_Y }}>{sentDateValue}</div>
            <div style={{ position: "absolute", top: SENDER_Y }}>{senderValue}</div>
            <div style={{ position: "absolute", top: RECEIVER_Y }}>{receiverValue}</div>
            <div style={{ position: "absolute", top: CONDITIONS_Y }}>{conditionsValue}</div>
          </div>

          {/* QR */}
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

          {/* Serial */}
          <div
            style={{
              position: "absolute",
              right: PAD_X,
              bottom: SERIAL_BOTTOM_PAD,
              color: "rgba(255,255,255,0.86)",
              fontFamily: "Kanit, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
              fontWeight: 500,
              fontSize: 16,
              letterSpacing: "-0.1px",
            }}
          >
            {serial}
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 800,
        headers: {
          "cache-control": "public, no-transform, max-age=600",
        },
        ...(fonts ? { fonts } : {}),
      }
    );
  } catch {
    // Absolute failsafe: always return a PNG so the browser never shows "contains errors"
    return new ImageResponse(
      (
        <div
          style={{
            width: 1200,
            height: 800,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#0b1220",
            color: "#ffffff",
            fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
            fontSize: 26,
            padding: 40,
            textAlign: "center",
          }}
        >
          Checks Explorer image error. Open Vercel logs for /api/checks/image to see the stack trace.
        </div>
      ),
      { width: 1200, height: 800 }
    );
  }
}
