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
};

export const getServerSideProps: GetServerSideProps<PageProps> = async (ctx) => {
  const raw = String(ctx.params?.serial || "");
  const normalized = normalizeSerial(raw);

  // Keep URL normalized (important for consistency)
  if (raw !== normalized) {
    return {
      redirect: { destination: `/testnet/${normalized}`, permanent: false },
    };
  }

  if (!isValidSerialFormat(normalized)) return { notFound: true };

  const record =
    (serials as Record<string, SerialRecord | undefined>)[normalized] ?? null;

  return { props: { serial: normalized, record } };
};

function polyscanTx(tx: string) {
  return `https://amoy.polygonscan.com/tx/${tx}`;
}
function polyscanAddr(addr: string) {
  return `https://amoy.polygonscan.com/address/${addr}`;
}

function formatUtcDateTime(epochSec: number) {
  const d = new Date(epochSec * 1000);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mi = String(d.getUTCMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi} UTC`;
}

function formatTimeUntil(targetSec: number, nowSec: number) {
  const diff = Math.max(0, targetSec - nowSec);
  const days = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  const mins = Math.floor((diff % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

/**
 * Normalize tx hash so "red links" become valid links whenever possible.
 * - trims whitespace/newlines
 * - strips non-hex chars
 * - ensures 0x prefix
 */
function normalizeTxHash(input?: string) {
  const raw = (input ?? "").trim();
  if (!raw) return "";
  const hex = raw.replace(/^0x/i, "").replace(/[^0-9a-fA-F]/g, "").toLowerCase();
  if (hex.length !== 64) return raw.trim(); // keep as-is if not 64 hex chars
  return `0x${hex}`;
}

function isTxHash(input?: string) {
  const v = normalizeTxHash(input);
  return /^0x[0-9a-f]{64}$/.test(v);
}

export default function SerialTestnetPage({ serial, record }: PageProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [cardOk, setCardOk] = useState(true);
  const [nowSec, setNowSec] = useState<number | null>(null);

  useEffect(() => {
    setCardOk(true);
  }, [serial]);

  useEffect(() => {
    const t = setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), 15_000);
    setNowSec(Math.floor(Date.now() / 1000));
    return () => clearInterval(t);
  }, []);

  const imageSrc = useMemo(() => `/api/checks/image/${serial}?v=final`, [serial]);
  const openImageHref = imageSrc;
  const openPageHref = `/testnet/${serial}`;

  async function copyWithFeedback(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey((prev) => (prev === key ? null : prev)), 900);
    } catch {
      // ignore
    }
  }

  function labelFor(key: string, fallback: string) {
    return copiedKey === key ? "Copied" : fallback;
  }

  const status = record?.voidTx ? "Voided" : record ? "Redeemed" : "Unknown";

  const statusClass =
    status === "Redeemed" ? "statusOk" : status === "Voided" ? "statusBad" : "statusNeutral";

  // Links should be exactly 3:
  // - If voided: Mint, Transfer, Void
  // - Else: Mint, Transfer, Redeem
  const links = useMemo(() => {
    if (!record) return [];
    const mint = normalizeTxHash(record.mintTx);
    const transfer = normalizeTxHash(record.transferTx);
    const redeem = normalizeTxHash(record.redeemTx);
    const voidTx = normalizeTxHash(record.voidTx);

    if (record.voidTx) {
      return [
        { key: "mint", label: "Mint", tx: mint },
        { key: "transfer", label: "Transfer", tx: transfer },
        { key: "void", label: "Void", tx: voidTx },
      ];
    }

    return [
      { key: "mint", label: "Mint", tx: mint },
      { key: "transfer", label: "Transfer", tx: transfer },
      { key: "redeem", label: "Redeem", tx: redeem },
    ];
  }, [record]);

  return (
    <>
      <Head>
        <title>{serial} | Checks Explorer</title>
        <meta name="robots" content="noindex,nofollow" />
      </Head>

      <div className="wrap">
        <div className="top">
          <div className="topBar">
            <Link className="back" href="/">
              ← Checks Explorer
            </Link>

            <button
              className="pillBtn"
              onClick={() => copyWithFeedback("page", typeof window !== "undefined" ? window.location.href : openPageHref)}
              type="button"
            >
              {labelFor("page", "Copy page link")}
            </button>
          </div>

          <div className="serial">{serial}</div>

          <div className="subRow">
            <span className="pill">
              <span className="pillStrong">Testnet</span>
              <span className="pillDot">•</span>
              <span>Polygon Amoy (80002)</span>
            </span>

            <span className={`pill ${statusClass}`}>
              <span className="pillStrong">Status</span>
              <span>{status}</span>
            </span>
          </div>
        </div>

        <div className="grid">
          <div className="left">
            <div className="cardArea">
              {cardOk ? (
                <img
                  className="cardImg"
                  src={imageSrc}
                  alt={`Check card ${serial}`}
                  onError={() => setCardOk(false)}
                />
              ) : (
                <div className="cardFallback">
                  <div className="mutedSmall">
                    Check image failed to load. You can open it directly:
                  </div>
                  <div className="fallbackRow">
                    <a className="monoLink" href={openImageHref} target="_blank" rel="noreferrer">
                      Open image
                    </a>
                    <span className="dot">•</span>
                    <a className="monoLink" href={openPageHref} target="_blank" rel="noreferrer">
                      Open page
                    </a>
                  </div>
                </div>
              )}
            </div>

            {cardOk ? (
              <div className="belowLinks">
                <a className="monoLink" href={openImageHref} target="_blank" rel="noreferrer">
                  Open image
                </a>
                <span className="dot">•</span>
                <a className="monoLink" href={openPageHref} target="_blank" rel="noreferrer">
                  Open page
                </a>
              </div>
            ) : null}
          </div>

          <div className="right">
            {!record ? (
              <div className="panel">
                <h2 className="h2">Details</h2>
                <div className="mutedSmall">No record found for this serial.</div>
              </div>
            ) : (
              <div className="panel">
                <h2 className="h2">Details</h2>

                <div className="row">
                  <div className="label">Network</div>
                  <div>Polygon Amoy (chainId {record.chainId})</div>
                </div>

                <div className="row rowContract">
                  <div className="label">Contract</div>
                  <div>
                    <div className="mono">{record.contract}</div>

                    <div className="btnRow">
                      <button
                        className={`pillBtn ${copiedKey === "contract" ? "copied" : ""}`}
                        onClick={() => copyWithFeedback("contract", record.contract)}
                        type="button"
                        title="Copy contract address"
                      >
                        {labelFor("contract", "Copy")}
                      </button>

                      <a
                        className="pillBtn pillLink"
                        href={polyscanAddr(record.contract)}
                        target="_blank"
                        rel="noreferrer"
                        title="Open contract in Polygonscan"
                      >
                        Open in Polygonscan
                      </a>
                    </div>
                  </div>
                </div>

                <div className="row">
                  <div className="label">TokenID</div>
                  <div className="mono">{record.tokenId}</div>
                </div>

                {record.claimableAt ? (
                  <div className="row">
                    <div className="label">Post-dated until</div>
                    <div>
                      <div className="mono">{formatUtcDateTime(record.claimableAt)}</div>
                      {nowSec ? (
                        <div className="mutedSmall" suppressHydrationWarning>
                          Claimable in {formatTimeUntil(record.claimableAt, nowSec)}
                        </div>
                      ) : null}
                      {record.voidTx ? (
                        <div className="mutedSmall">This check was voided before it became claimable.</div>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                <div className="divider" />

                <h2 className="h2">Links</h2>

                <ul className="ul">
                  {links.map((l) => {
                    const tx = l.tx;
                    const ok = isTxHash(tx);

                    return (
                      <li className="li" key={l.key}>
                        <div className="label">{l.label}</div>

                        {tx ? (
                          <div className="inline">
                            {ok ? (
                              <a className="monoLink" href={polyscanTx(normalizeTxHash(tx))} target="_blank" rel="noreferrer">
                                {normalizeTxHash(tx)}
                              </a>
                            ) : (
                              <span className="mono invalid" title="Invalid tx hash">
                                {tx}
                              </span>
                            )}

                            <button
                              className={`pillBtn ${copiedKey === l.key ? "copied" : ""}`}
                              onClick={() => copyWithFeedback(l.key, tx)}
                              type="button"
                            >
                              {labelFor(l.key, "Copy")}
                            </button>
                          </div>
                        ) : (
                          <div className="mutedSmall">Not available</div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        </div>

        <div className="footer">
          <div>Powered by Checks</div>
          <div className="mutedSmall">Tip: TokenIDs may repeat due to early multi-contract testing.</div>
        </div>
      </div>

      <style jsx>{`
        .wrap {
          max-width: 1120px;
          margin: 48px auto;
          padding: 0 18px;
          color: #111827;
        }

        .top {
          margin-bottom: 28px;
        }

        .topBar {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: center;
          flex-wrap: wrap;
        }

        .back {
          color: #4f46e5;
          text-decoration: none;
          font-weight: 700;
        }

        .serial {
          font-size: 44px;
          line-height: 1.08;
          margin: 14px 0 12px;
          font-weight: 700;
          letter-spacing: -0.4px;
        }

        .subRow {
          display: flex;
          gap: 10px;
          align-items: center;
          flex-wrap: wrap;
          margin-bottom: 6px;
        }

        .pill {
          display: inline-flex;
          gap: 10px;
          align-items: center;
          padding: 8px 12px;
          border: 1px solid #e5e7eb;
          border-radius: 999px;
          font-size: 14px;
          background: #ffffff;
        }

        .pillStrong {
          font-weight: 700;
        }

        .pillDot {
          color: #64748b;
        }

        .statusOk {
          background: #dcfce7;
          border-color: #86efac;
        }

        .statusBad {
          background: #fee2e2;
          border-color: #fca5a5;
        }

        .statusNeutral {
          background: #f1f5f9;
          border-color: #e2e8f0;
        }

        .grid {
          display: grid;
          grid-template-columns: 1.1fr 0.9fr;
          gap: 22px;
          align-items: start;
        }

        @media (max-width: 900px) {
          .grid {
            grid-template-columns: 1fr;
          }
          .serial {
            font-size: 42px;
          }
        }

        .cardArea {
          width: 100%;
        }

        .cardImg {
          width: 100%;
          max-width: 540px;
          height: auto;
          display: block;
          border-radius: 12px;
        }

        .cardFallback {
          border: 1px solid #e5e7eb;
          background: #ffffff;
          border-radius: 12px;
          padding: 14px;
          max-width: 540px;
        }

        .belowLinks {
          margin-top: 10px;
          display: flex;
          gap: 10px;
          align-items: center;
        }

        .fallbackRow {
          margin-top: 6px;
          display: flex;
          gap: 10px;
          align-items: center;
          flex-wrap: wrap;
        }

        .dot {
          color: #64748b;
        }

        .panel {
          border: 1px solid #e5e7eb;
          background: #ffffff;
          border-radius: 16px;
          padding: 16px 16px 14px;
        }

        .h2 {
          font-size: 28px;
          margin: 0 0 12px;
          font-weight: 800;
        }

        .row {
          display: grid;
          grid-template-columns: 120px 1fr;
          gap: 14px;
          padding: 10px 0;
        }

        @media (max-width: 520px) {
          .row {
            grid-template-columns: 1fr;
            gap: 6px;
          }
        }

        .label {
          color: #64748b;
          font-weight: 700;
          font-size: 13px;
          text-transform: none;
        }

        .mono {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono",
            "Courier New", monospace;
          font-size: 13px;
          word-break: break-all;
        }

        .divider {
          height: 1px;
          background: #e5e7eb;
          margin: 14px 0;
        }

        .ul {
          list-style: none;
          padding: 0;
          margin: 0;
        }

        .li {
          padding: 12px 0;
          border-top: 1px solid #f1f5f9;
        }

        .li:first-child {
          border-top: 0;
        }

        .inline {
          display: flex;
          gap: 10px;
          align-items: center;
          flex-wrap: wrap;
        }

        .monoLink {
          color: #4f46e5;
          text-decoration: underline;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono",
            "Courier New", monospace;
          font-size: 13px;
          word-break: break-all;
        }

        .invalid {
          color: #dc2626;
        }

        .mutedSmall {
          color: #64748b;
          font-size: 13px;
        }

        .btnRow {
          display: flex;
          gap: 10px;
          align-items: center;
          flex-wrap: wrap;
          margin-top: 8px;
        }

        .pillBtn {
          appearance: none;
          border: 1px solid #e5e7eb;
          background: #ffffff;
          border-radius: 999px;
          padding: 8px 12px;
          font-weight: 700;
          font-size: 14px;
          cursor: pointer;
          color: #111827;
          text-decoration: none;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          line-height: 1;
        }

        .pillBtn:hover {
          border-color: #cbd5e1;
        }

        .pillLink {
          color: #4f46e5;
        }

        .copied {
          background: #ecfeff;
          border-color: #67e8f9;
        }

        .footer {
          margin-top: 26px;
          padding-top: 18px;
          border-top: 1px solid #e5e7eb;
          display: flex;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
          font-weight: 400;
        }
      `}</style>
    </>
  );
}
