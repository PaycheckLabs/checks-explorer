import type { GetServerSideProps } from "next";
import Head from "next/head";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import serials from "../../data/testnet-serials.json";
import { isValidSerialFormat, normalizeSerial } from "../../lib/serial";

type SerialRecord = {
  chainId: number;
  network: string;
  contract: string;
  tokenId: number;
  mintTx?: string;
  transferTx?: string;
  redeemTx?: string;
  voidTx?: string;
  claimableAt?: number;
};

type PageProps = {
  serial: string;
  record: SerialRecord | null;
  origin: string;
};

export const getServerSideProps: GetServerSideProps<PageProps> = async (ctx) => {
  const raw = String(ctx.params?.serial || "");
  const normalized = normalizeSerial(raw);

  if (raw !== normalized) {
    return {
      redirect: { destination: `/testnet/${normalized}`, permanent: false },
    };
  }

  if (!isValidSerialFormat(normalized)) return { notFound: true };

  const record =
    (serials as Record<string, SerialRecord | undefined>)[normalized] ?? null;

  const proto =
    (ctx.req.headers["x-forwarded-proto"] as string) ||
    (ctx.req.headers["x-forwarded-protocol"] as string) ||
    "https";
  const host = ctx.req.headers.host || "explorer.checks.xyz";
  const origin = `${proto}://${host}`;

  return { props: { serial: normalized, record, origin } };
};

function polygonscanTx(tx: string) {
  return `https://amoy.polygonscan.com/tx/${tx}`;
}

function polygonscanAddr(addr: string) {
  return `https://amoy.polygonscan.com/address/${addr}`;
}

/**
 * Makes tx parsing forgiving:
 * - Accepts raw tx hashes
 * - Accepts URLs that include /tx/0x...
 * - Accepts strings with extra text, as long as they contain a 0x{64} hash
 */
function normalizeTxHash(input?: string | null): string | null {
  if (!input) return null;
  const s = String(input).trim();
  const m = s.match(/0x[a-fA-F0-9]{64}/);
  if (!m) return null;
  return `0x${m[0].slice(2).toLowerCase()}`;
}

function shortAddr(addr: string) {
  if (!addr?.startsWith("0x") || addr.length < 10) return addr;
  return `${addr.slice(0, 4)}…${addr.slice(-5)}`;
}

export default function SerialPage({ serial, record, origin }: PageProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!copiedKey) return;
    const t = setTimeout(() => setCopiedKey(null), 1200);
    return () => clearTimeout(t);
  }, [copiedKey]);

  const cardImageUrl = useMemo(
    () => `${origin}/api/checks/image/${serial}?v=final`,
    [origin, serial]
  );

  const mintTx = normalizeTxHash(record?.mintTx);
  const transferTx = normalizeTxHash(record?.transferTx);
  const redeemTx = normalizeTxHash(record?.redeemTx);
  const voidTx = normalizeTxHash(record?.voidTx);

  const status = useMemo(() => {
    if (!record) return "Unknown";
    if (voidTx) return "Voided";
    if (redeemTx) return "Redeemed";
    return "Active";
  }, [record, voidTx, redeemTx]);

  const isVoided = status === "Voided";

  function copy(text: string, key: string) {
    void navigator.clipboard.writeText(text);
    setCopiedKey(key);
  }

  return (
    <>
      <Head>
        <title>{serial} • Checks Explorer</title>

        {/* Kanit font (restore original feel) */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Kanit:wght@400;600;700;800;900&display=swap"
          rel="stylesheet"
        />
      </Head>

      <div className="page">
        <div className="wrap">
          <div className="topbar">
            <Link href="/" className="backLink">
              ← Checks Explorer
            </Link>

            <button
              className={`copyPageBtn ${
                copiedKey === "page" ? "copied" : ""
              }`}
              onClick={() => copy(`${origin}/testnet/${serial}`, "page")}
            >
              Copy page link
            </button>
          </div>

          <h1 className="h1">{serial}</h1>

          <div className="badges">
            <span className="pill">Testnet</span>
            <span className="dot">•</span>
            <span className="pill">Polygon Amoy (80002)</span>
            <span className={`statusPill ${isVoided ? "statusRed" : "statusGreen"}`}>
              Status&nbsp;&nbsp;<strong>{status}</strong>
            </span>
          </div>

          <div className="grid">
            <div>
              <div className="cardLabelRow">
                <span className="labelSm">Check card {serial}</span>
              </div>

              <div className="cardWrap">
                {/* Use img for now, keeps foundation intact */}
                {/* If the API returns 500, this will not render the image */}
                <img className="cardImg" src={cardImageUrl} alt={`Check card ${serial}`} />
              </div>

              <div className="btnRow">
                <a className="openLink" href={cardImageUrl} target="_blank" rel="noreferrer">
                  Open image
                </a>
                <span className="dot">•</span>
                <a className="openLink" href={`${origin}/testnet/${serial}`} target="_blank" rel="noreferrer">
                  Open page
                </a>
              </div>

              <div className="tip">
                Tip: This is an early explorer view. Full experience coming soon.
              </div>
            </div>

            <div>
              <h2 className="h2">Details</h2>

              <div className="row">
                <div className="label">Network</div>
                <div>Polygon Amoy (chainId 80002)</div>
              </div>

              <div className="row">
                <div className="label">Contract</div>
                <div className="inline">
                  <span className="mono">{record?.contract || "Unknown"}</span>
                  {record?.contract ? (
                    <>
                      <button
                        className={`copyBtn ${
                          copiedKey === "contract" ? "copied" : ""
                        }`}
                        onClick={() => copy(record.contract, "contract")}
                      >
                        Copy
                      </button>
                      <a
                        className="openBtn"
                        href={polygonscanAddr(record.contract)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open in Polygonscan
                      </a>
                    </>
                  ) : null}
                </div>
              </div>

              <div className="row">
                <div className="label">TokenID</div>
                <div>{record?.tokenId ?? "Unknown"}</div>
              </div>

              {isVoided && record?.claimableAt ? (
                <div className="row">
                  <div className="label">Post-dated until</div>
                  <div>
                    {new Date(record.claimableAt * 1000).toISOString().replace("T", " ").slice(0, 16)}{" "}
                    UTC
                  </div>
                </div>
              ) : null}

              <div className="divider" />

              <h2 className="h2">Links</h2>

              <ul className="ul">
                <li className="li">
                  <div className="label">Mint</div>
                  <TxRow
                    tx={mintTx}
                    copiedKey={copiedKey}
                    copy={copy}
                    k="mint"
                  />
                </li>

                <li className="li">
                  <div className="label">Transfer</div>
                  {/* If missing, show Not available (no red “broken” hash) */}
                  <TxRow
                    tx={transferTx}
                    copiedKey={copiedKey}
                    copy={copy}
                    k="transfer"
                    emptyText="Not available"
                  />
                </li>

                <li className="li">
                  <div className="label">{isVoided ? "Void" : "Redeem"}</div>
                  <TxRow
                    tx={isVoided ? voidTx : redeemTx}
                    copiedKey={copiedKey}
                    copy={copy}
                    k={isVoided ? "void" : "redeem"}
                    emptyText="Not available"
                  />
                </li>
              </ul>
            </div>
          </div>

          <div className="footer">
            <span className="muted">Powered by Checks</span>
            <span className="muted">
              Tip: TokenIDs may repeat due to early multi-contract testing.
            </span>
          </div>
        </div>
      </div>

      <style jsx>{`
        .page {
          min-height: 100vh;
          background: #ffffff;
          color: #0f172a;
          font-family: "Kanit", system-ui, -apple-system, Segoe UI, Roboto,
            Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji";
        }

        .wrap {
          max-width: 1040px;
          margin: 0 auto;
          padding: 34px 22px 48px;
        }

        .topbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 18px;
          margin-bottom: 18px;
        }

        .backLink {
          color: #4f46e5;
          text-decoration: none;
          font-weight: 800;
        }

        .backLink:hover {
          text-decoration: underline;
        }

        .copyPageBtn {
          appearance: none;
          -webkit-appearance: none;
          border: 1px solid #e5e7eb;
          background: #ffffff;
          color: #0f172a;
          border-radius: 999px;
          padding: 8px 14px;
          font-size: 13px;
          font-weight: 900;
          cursor: pointer;
          line-height: 1;
        }

        .copyPageBtn:hover {
          background: #f8fafc;
        }

        .h1 {
          font-size: 54px;
          line-height: 1.02;
          margin: 0 0 14px 0;
          font-weight: 900;
          letter-spacing: -0.02em;
        }

        .badges {
          display: flex;
          gap: 10px;
          align-items: center;
          flex-wrap: wrap;
          margin-bottom: 22px;
        }

        .pill {
          border: 1px solid #e5e7eb;
          background: #ffffff;
          border-radius: 999px;
          padding: 7px 12px;
          font-size: 13px;
          font-weight: 800;
        }

        .statusPill {
          border-radius: 999px;
          padding: 7px 12px;
          font-size: 13px;
          font-weight: 800;
          border: 1px solid transparent;
        }

        .statusGreen {
          background: rgba(34, 197, 94, 0.15);
          border-color: rgba(34, 197, 94, 0.35);
        }

        .statusRed {
          background: rgba(239, 68, 68, 0.12);
          border-color: rgba(239, 68, 68, 0.35);
        }

        .grid {
          display: grid;
          grid-template-columns: 1.2fr 0.8fr;
          gap: 34px;
          align-items: start;
        }

        .cardLabelRow {
          margin-bottom: 10px;
        }

        .labelSm {
          color: #64748b;
          font-weight: 900;
          font-size: 14px;
        }

        .cardWrap {
          border-radius: 16px;
          overflow: hidden;
          border: 1px solid #e5e7eb;
          background: #f8fafc;
        }

        .cardImg {
          width: 100%;
          height: auto;
          display: block;
        }

        .btnRow {
          margin-top: 10px;
          display: flex;
          gap: 10px;
          align-items: center;
          flex-wrap: wrap;
        }

        .openLink {
          color: #4f46e5;
          text-decoration: underline;
          font-weight: 800;
          font-size: 14px;
        }

        .dot {
          color: #94a3b8;
        }

        .h2 {
          font-size: 28px;
          margin: 0 0 14px 0;
          font-weight: 900;
        }

        .row {
          margin-bottom: 14px;
        }

        .label {
          color: #64748b;
          font-weight: 900;
          margin-bottom: 6px;
          font-size: 14px;
        }

        .divider {
          margin: 18px 0 18px;
          height: 1px;
          background: #e5e7eb;
        }

        .ul {
          margin: 0;
          padding-left: 0;
          list-style: none;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .li {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .inline {
          display: flex;
          gap: 10px;
          align-items: center;
          flex-wrap: wrap;
        }

        .openBtn {
          border: 1px solid rgba(79, 70, 229, 0.25);
          background: rgba(79, 70, 229, 0.07);
          color: #4f46e5;
          border-radius: 999px;
          padding: 8px 12px;
          font-size: 12px;
          font-weight: 900;
          text-decoration: none;
          line-height: 1;
        }

        .openBtn:hover {
          background: rgba(79, 70, 229, 0.1);
        }

        .copyBtn {
          appearance: none;
          -webkit-appearance: none;
          border: 1px solid #e5e7eb;
          background: #ffffff;
          color: #111827;
          border-radius: 999px;
          padding: 8px 12px;
          font-size: 12px;
          font-weight: 900;
          cursor: pointer;
          font-family: inherit;
          line-height: 1;
        }

        .copyBtn:hover {
          background: #f8fafc;
        }

        .copied {
          border-color: rgba(34, 197, 94, 0.55) !important;
          background: rgba(34, 197, 94, 0.12) !important;
        }

        .tip {
          margin-top: 18px;
          font-size: 14px;
          color: #64748b;
          text-align: left;
        }

        .footer {
          margin-top: 34px;
          padding-top: 18px;
          border-top: 1px solid #e5e7eb;
          display: flex;
          justify-content: space-between;
          gap: 18px;
          flex-wrap: wrap;
        }

        .muted {
          color: #64748b;
          font-weight: 600;
        }

        .monoLink {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
            "Liberation Mono", "Courier New", monospace;
          word-break: break-all;
        }

        @media (max-width: 1040px) {
          .grid {
            grid-template-columns: 1fr;
            gap: 26px;
          }

          .h1 {
            font-size: 44px;
          }
        }
      `}</style>
    </>
  );
}

function TxRow({
  tx,
  copiedKey,
  copy,
  k,
  emptyText = "Not available",
}: {
  tx: string | null;
  copiedKey: string | null;
  copy: (text: string, key: string) => void;
  k: string;
  emptyText?: string;
}) {
  if (!tx) {
    return <div style={{ color: "#64748b", fontWeight: 700 }}>{emptyText}</div>;
  }

  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
      <a
        className="monoLink"
        href={polygonscanTx(tx)}
        target="_blank"
        rel="noreferrer"
        style={{
          color: "#4f46e5",
          textDecoration: "underline",
          fontWeight: 800,
        }}
      >
        {tx}
      </a>

      <button
        className={`copyBtn ${copiedKey === k ? "copied" : ""}`}
        onClick={() => copy(tx, k)}
        style={{ marginLeft: 0 }}
      >
        Copy
      </button>
    </div>
  );
}
