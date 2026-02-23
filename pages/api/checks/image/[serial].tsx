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

    const bgUrl = `${origin}/check-bg.png`;

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

    const pageUrl = `${origin}/testnet/${serial}`;
    const qr = new qrcode(0, "M");
    qr.addData(pageUrl);
    qr.make();
    const qrSvg = qr.createSvgTag({ cellSize: 6, margin: 0 });
    const qrDataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(qrSvg)}`;

    // Header placeholders (M1)
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

    // ===== Layout constants (tune these only) =====
    const PAD_X = 84;

    // Header row
    const TOKEN_ROW_Y = 44;
    const TOKEN_ICON_SIZE = 56;

    // Title
    const TITLE_Y = 128;

    // Values column
    const VALUE_X = 430;
    const TYPE_Y = 356;
    const SENT_Y = 420;
    const SENDER_Y = 484;
    const RECEIVER_Y = 548;
    const CONDITIONS_Y = 612;

    // QR
    const QR_SIZE = 280;
    const QR_X = 1200 - PAD_X - QR_SIZE;
    const QR_Y = 360;

    // Footer serial
    const SERIAL_BOTTOM_PAD = 54;

    // ===== Typography (scaled closer to Example) =====
    const TOKEN_NAME_SIZE = 22;     // was 18
    const AMOUNT_SIZE = 40;         // was 22
    const TITLE_SIZE = 52;          // was 24
    const VALUE_SIZE = 24;          // was 16
    const SERIAL_SIZE = 22;         // was 16

    return new ImageResponse(
      (
        <div
          style={{
            width: 1200,
            height: 800,
            position: "relative",
            background: "#0b1220",
            display: "flex",
          }}
        >
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

          {/* Token icon */}
          <div
            style={{
              position: "absolute",
              left: PAD_X,
              top: TOKEN_ROW_Y,
              width: TOKEN_ICON_SIZE,
              height: TOKEN_ICON_SIZE,
              borderRadius: 999,
              background: "rgba(255,255,255,0.16)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "rgba(255,255,255,0.92)",
              fontFamily: "Kanit, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
              fontWeight: 500,
              fontSize: 24,
            }}
          >
            {/* Nudge down slightly so Kanit centers visually */}
            <span style={{ transform: "translateY(1px)" }}>{tokenSymbol[0]}</span>
          </div>

          {/* Token name */}
          <div
            style={{
              position: "absolute",
              left: PAD_X + TOKEN_ICON_SIZE + 18,
              top: TOKEN_ROW_Y + 14,
              color: "rgba(255,255,255,0.92)",
              fontFamily: "Kanit, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
              fontWeight: 400,
              fontSize: TOKEN_NAME_SIZE,
            }}
          >
            {tokenName}
          </div>

          {/* Amount (bigger, symbol dimmer) */}
          <div
            style={{
              position: "absolute",
              right: PAD_X,
              top: TOKEN_ROW_Y + 6,
              display: "flex",
              gap: 12,
              alignItems: "baseline",
              fontFamily: "Kanit, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
              fontWeight: 500,
              fontSize: AMOUNT_SIZE,
              color: "rgba(255,255,255,0.92)",
            }}
          >
            <span>{amountNumber}</span>
            <span style={{ opacity: 0.78, fontWeight: 500 }}>{tokenSymbol}</span>
          </div>

          {/* Title (much larger, aligned above Minted line) */}
          <div
            style={{
              position: "absolute",
              left: PAD_X,
              top: TITLE_Y,
              color: "rgba(255,255,255,0.92)",
              fontFamily: "Kanit, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
              fontWeight: 500,
              fontSize: TITLE_SIZE,
            }}
          >
            {titleText}
          </div>

          {/* Values (bigger) */}
          <div
            style={{
              position: "absolute",
              left: VALUE_X,
              top: 0,
              color: "rgba(255,255,255,0.92)",
              fontFamily: "Kanit, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
              fontWeight: 500,
              fontSize: VALUE_SIZE,
              lineHeight: "32px",
              letterSpacing: "-0.1px",
              display: "flex",
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

          {/* Serial (bigger, match footer feel) */}
          <div
            style={{
              position: "absolute",
              right: PAD_X,
              bottom: SERIAL_BOTTOM_PAD,
              color: "rgba(255,255,255,0.86)",
              fontFamily: "Kanit, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
              fontWeight: 500,
              fontSize: SERIAL_SIZE,
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
          Checks Explorer image error. Check Vercel logs for /api/checks/image.
        </div>
      ),
      { width: 1200, height: 800 }
    );
  }
}
