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

function shortAddr(addr: string): string {
  if (!addr) return "";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function shortHash(hash?: string): string {
  if (!hash) return "";
  return `${hash.slice(0, 10)}…${hash.slice(-8)}`;
}

function statusFromRecord(record: SerialRecord | null): string {
  if (!record) return "UNKNOWN";
  if (record.voidTx) return "VOIDED";
  if (record.redeemTx) return "REDEEMED";
  if (record.mintTx) return "MINTED";
  return "MINTED";
}

function statusBadgeStyle(status: string) {
  // Keep it simple and consistent: neutral palette, no risky colors
  switch (status) {
    case "REDEEMED":
      return { background: "#0f172a", color: "#ffffff" };
    case "VOIDED":
      return { background: "#111827", color: "#ffffff" };
    case "MINTED":
      return { background: "#111827", color: "#ffffff" };
    default:
      return { background: "#334155", color: "#ffffff" };
  }
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

  // Use request origin so preview deployments generate correct QR URLs
  const pagePath = `/testnet/${serial}`;
  const pageUrl = `${origin}${pagePath}`;

  // QR -> SVG -> data url (pure JS, Edge friendly)
  const qr = new qrcode(0, "M");
  qr.addData(pageUrl);
  qr.make();
  const qrSvg = qr.createSvgTag({ cellSize: 6, margin: 0 });
  const qrDataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(qrSvg)}`;

  const networkLine = record
    ? `${record.network} (chainId ${record.chainId})`
    : "Polygon Amoy (chainId 80002)";

  const contractShort = record ? shortAddr(record.contract) : "";
  const tokenIdText = record ? String(record.tokenId) : "";
  const mintTxShort = record?.mintTx ? shortHash(record.mintTx) : "";
  const redeemTxShort = record?.redeemTx ? shortHash(record.redeemTx) : "";
  const voidTxShort = record?.voidTx ? shortHash(record.voidTx) : "";

  const badge = statusBadgeStyle(status);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          padding: 56,
          background: "#0b1220",
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        }}
      >
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            borderRadius: 32,
            border: "6px solid #111827",
            background: "#f7f9fc",
            padding: 48,
          }}
        >
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              paddingRight: 36,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 18,
              }}
            >
              <div style={{ fontSize: 34, fontWeight: 900, color: "#0b1220" }}>
                Checks
              </div>

              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <div
                  style={{
                    fontSize: 18,
                    fontWeight: 900,
                    padding: "10px 16px",
                    borderRadius: 999,
                    background: "#111827",
                    color: "#ffffff",
                  }}
                >
                  TESTNET
                </div>

                <div
                  style={{
                    fontSize: 18,
                    fontWeight: 900,
                    padding: "10px 16px",
                    borderRadius: 999,
                    ...badge,
                  }}
                >
                  {status}
                </div>
              </div>
            </div>

            <div style={{ marginTop: 34, fontSize: 20, color: "#334155" }}>
              Serial
            </div>
            <div
              style={{
                marginTop: 10,
                fontSize: 52,
                fontWeight: 950,
                letterSpacing: 2,
                color: "#0b1220",
              }}
            >
              {serial}
            </div>

            <div style={{ marginTop: 22, fontSize: 20, color: "#0b1220" }}>
              <div style={{ marginTop: 8 }}>
                <span style={{ fontWeight: 900 }}>Network:</span> {networkLine}
              </div>

              {record ? (
                <div style={{ marginTop: 8 }}>
                  <span style={{ fontWeight: 900 }}>TokenId:</span> {tokenIdText}
                </div>
              ) : null}

              {record ? (
                <div style={{ marginTop: 8 }}>
                  <span style={{ fontWeight: 900 }}>Contract:</span>{" "}
                  {contractShort}
                </div>
              ) : null}

              {record?.mintTx ? (
                <div style={{ marginTop: 8 }}>
                  <span style={{ fontWeight: 900 }}>Mint tx:</span> {mintTxShort}
                </div>
              ) : null}

              {record?.redeemTx ? (
                <div style={{ marginTop: 8 }}>
                  <span style={{ fontWeight: 900 }}>Redeem tx:</span>{" "}
                  {redeemTxShort}
                </div>
              ) : null}

              {record?.voidTx ? (
                <div style={{ marginTop: 8 }}>
                  <span style={{ fontWeight: 900 }}>Void tx:</span> {voidTxShort}
                </div>
              ) : null}

              <div style={{ marginTop: 10 }}>
                <span style={{ fontWeight: 900 }}>URL:</span>{" "}
                {new URL(origin).host}
                {pagePath}
              </div>
            </div>

            <div style={{ marginTop: "auto", fontSize: 16, color: "#64748b" }}>
              Payment Checks v1 • No expiration in v1
            </div>
          </div>

          <div
            style={{
              width: 320,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 12,
            }}
          >
            <div
              style={{
                width: 268,
                height: 268,
                background: "#ffffff",
                borderRadius: 24,
                border: "4px solid #111827",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 14,
              }}
            >
              <img src={qrDataUrl} width={236} height={236} />
            </div>

            <div style={{ fontSize: 18, fontWeight: 950, color: "#111827" }}>
              Scan to view
            </div>
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 675,
      headers: {
        // Keep iteration friendly during M1
        "cache-control": "public, no-transform, max-age=600",
      },
    }
  );
}
