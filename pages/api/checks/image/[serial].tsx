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

// M1 testnet: set these to your two Amoy dev wallet public addresses.
// Do not put private keys here.
const DEV_SENDER = "0xISSUER_ADDRESS_HERE";
const DEV_RECEIVER = "0xHOLDER_ADDRESS_HERE";

function shortAddr(addr: string): string {
  const a = (addr || "").trim();
  if (!a.startsWith("0x") || a.length < 10) return a || "—";
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function statusFromRecord(record: SerialRecord | null): string {
  if (!record) return "UNKNOWN";
  if (record.voidTx) return "VOIDED";
  if (record.redeemTx) return "REDEEMED";
  if (record.mintTx) return "MINTED";
  return "MINTED";
}

export default async function handler(req: NextRequest) {
  const url = new URL(req.url);
  const origin = url.origin;

  const last = url.pathname.split("/").pop() || "";
  const rawSerial = last.replace(/\.png$/i, "");
  const serial = normalizeSerial(rawSerial);

  if (!isValidSerialFormat(serial)) {
    return new Response("Invalid serial", { status: 400 });
  }

  const record =
    (serials as Record<string, SerialRecord | undefined>)[serial] || null;

  const status = statusFromRecord(record);

  // QR points to the serial page, origin-aware for previews
  const pageUrl = `${origin}/testnet/${serial}`;

  // Base template background
  const bgUrl = `${origin}/check-bg.png`;

  // QR -> SVG -> data url (Edge-friendly)
  const qr = new qrcode(0, "M");
  qr.addData(pageUrl);
  qr.make();
  const qrSvg = qr.createSvgTag({ cellSize: 6, margin: 0 });
  const qrDataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(qrSvg)}`;

  // Values to fill in (safe placeholders for M1)
  const typeValue = "Payment";
  const sentDateValue = "Testnet"; // placeholder until we add real timestamps
  const senderValue = shortAddr(DEV_SENDER);
  const receiverValue = shortAddr(DEV_RECEIVER);
  const conditionsValue =
    record?.claimableAt && record.claimableAt > 0 ? "Postdated" : "Instant Claim";

  // Layout tuned for your 1200x800 blank template
  // You will tweak only these numbers to perfect alignment.
  const PAD_X = 84;

  // Value column placement
  const VALUE_X = 430;
  const ROW_Y0 = 363;
  const ROW_GAP = 64;

  // QR placement (right side)
  const QR_CARD_SIZE = 280;
  const QR_CARD_X = 880;
  const QR_CARD_Y = 360;

  // Serial placement (bottom-right)
  const SERIAL_Y = 724;

  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 800,
          position: "relative",
          display: "flex",
          fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
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

        {/* Status badge (top-right). Remove later if you want ultra-minimal. */}
        <div
          style={{
            position: "absolute",
            right: PAD_X,
            top: 120,
            padding: "10px 14px",
            borderRadius: 999,
            fontSize: 16,
            fontWeight: 900,
            background: "rgba(255,255,255,0.14)",
            color: "rgba(255,255,255,0.92)",
          }}
        >
          {status}
        </div>

        {/* Values overlays */}
        <div
          style={{
            position: "absolute",
            left: VALUE_X,
            top: ROW_Y0,
            display: "flex",
            flexDirection: "column",
            gap: ROW_GAP,
            fontSize: 34,
            fontWeight: 900,
            color: "rgba(255,255,255,0.92)",
          }}
        >
          <div>{typeValue}</div>
          <div>{sentDateValue}</div>
          <div>{senderValue}</div>
          <div>{receiverValue}</div>
          <div>{conditionsValue}</div>
        </div>

        {/* QR card */}
        <div
          style={{
            position: "absolute",
            left: QR_CARD_X,
            top: QR_CARD_Y,
            width: QR_CARD_SIZE,
            height: QR_CARD_SIZE,
            background: "#ffffff",
            borderRadius: 16,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 14,
          }}
        >
          <img
            src={qrDataUrl}
            width={QR_CARD_SIZE - 28}
            height={QR_CARD_SIZE - 28}
          />
        </div>

        {/* Serial bottom-right */}
        <div
          style={{
            position: "absolute",
            right: PAD_X,
            top: SERIAL_Y,
            fontSize: 30,
            fontWeight: 950,
            color: "rgba(255,255,255,0.92)",
            letterSpacing: 1,
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
    }
  );
}
