import type { GetServerSideProps } from "next";
import Head from "next/head";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

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

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const raw = String(ctx.params?.serial || "");
  const normalized = normalizeSerial(raw);

  if (raw !== normalized) {
    return {
      redirect: { destination: `/testnet/${normalized}`, permanent: false },
    };
  }

  if (!isValidSerialFormat(normalized)) return { notFound: true };

  const record =
    (serials as Record<string, SerialRecord | undefined>)[normalized] || null;

  const proto = (ctx.req.headers["x-forwarded-proto"] as string) || "https";
  const host = ctx.req.headers.host || "explorer.checks.xyz";
  const origin = `${proto}://${host}`;

  return { props: { serial: normalized, record, origin } };
};

function polyscanTx(tx: string) {
  return `https://amoy.polygonscan.com/tx/${tx}`;
}
function polyscanAddr(addr: string) {
  return `https://amoy.polygonscan.com/address/${addr}`;
}

function isTxHash(tx?: string) {
  return !!tx && /^0x[a-fA-F0-9]{64}$/.test(tx);
}

function getStatus(r: SerialRecord) {
  if (r.voidTx) return { label: "Voided", tone: "bad" as const };
  if (r.redeemTx) return { label: "Redeemed", tone: "good" as const };
  if (r.claimableAt) return { label: "Post-dated", tone: "warn" as const };
  return { label: "Active", tone: "neutral" as const };
}

function formatUtcDateTime(unixSec: number) {
  const d = new Date(unixSec * 1000);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mi = String(d.getUTCMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi} UTC`;
}

function formatTimeUntil(targetUnixSec: number, nowUnixSec: number) {
  const diff = targetUnixSec - nowUnixSec;
  if (diff <= 0) return "now";

  const days = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  const mins = Math.floor((diff % 3600) / 60);

  if (days > 0) return `~${days}d ${hours}h`;
  if (hours > 0) return `~${hours}h ${mins}m`;
  return `~${mins}m`;
}

async function safeCopy(text: string): Promise<boolean> {
  if (!text) return false;

  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // fall through
  }

  try {
    const el = document.createElement("textarea");
    el.value = text;
    el.style.position = "fixed";
    el.style.left = "-9999px";
    el.style.top = "-9999px";
    document.body.appendChild(el);
    el.focus();
    el.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}

export default function TestnetSerialPage({ serial, record, origin }: PageProps) {
  const IMAGE_VERSION = "final";

  const imagePath = `/api/checks/image/${encodeURIComponent(
    serial
  )}?v=${IMAGE_VERSION}`;
  const pageUrl = `${origin}/testnet/${encodeURIComponent(serial)}`;
  const ogImageUrl = `${origin}${imagePath}`;

  const title = `Checks Explorer Testnet • ${serial}`;
  const description =
    "Payment Checks v1 testnet serial page with on-chain proof links and check card image.";

  const status = record ? getStatus(record) : null;

  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);

  const [nowSec, setNowSec] = useState<number | null>(null);
  useEffect(() => {
    setNowSec(Math.floor(Date.now() / 1000));
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, []);

  async function copyWithFeedback(key: string, value: string) {
    const ok = await safeCopy(value);
    if (!ok) return;

    setCopiedKey(key);
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      setCopiedKey((k) => (k === key ? null : k));
    }, 1000);
  }

  function labelFor(key: string, base: string) {
    return copiedKey === key ? "Copied" : base;
  }

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content={description} />

        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:image" content={ogImageUrl} />

        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content={ogImageUrl} />
      </Head>

      <div className="wrap">
        <div className="top">
          <div className="topBar">
            <Link href="/" passHref legacyBehavior>
              <a className="back">← Checks Explorer</a>
            </Link>

            <button
              className={`copyBtn ${copiedKey === "page" ? "copied" : ""}`}
              onClick={() => copyWithFeedback("page", pageUrl)}
              type="button"
              title="Copy page link"
            >
              {labelFor("page", "Copy page link")}
            </button>
          </div>

          <h1 className="serial">{serial}</h1>

          <div className="subRow">
            <div className="pill">
              <span className="pillStrong">Testnet</span>
              <span className="pillDot">•</span>
              <span className="pillStrong">Polygon Amoy (80002)</span>
            </div>

            {status ? (
              <div
                className={`status ${status.tone}`}
                title="Status derived from proof links"
              >
                <span className="statusLabel">Status</span>
                <span className="statusValue">{status.label}</span>
              </div>
            ) : null}
          </div>
        </div>

        <div className="grid">
          <div className="left">
            <img className="card" src={imagePath} alt={`Check card ${serial}`} />

            <div className="links">
              <a href={imagePath} target="_blank" rel="noreferrer">
                Open image
              </a>

              <span className="dot">·</span>

              <a href={pageUrl} target="_blank" rel="noreferrer">
                Open page
              </a>
            </div>
          </div>

          <div className="right">
            <h2 className="h2">Details</h2>

            {!record ? (
              <div className="muted">
                Serial not found. Add it to <code>data/testnet-serials.json</code>.
              </div>
            ) : (
              <>
                <div className="row">
                  <div className="label">Network</div>
                  <div>
                    {record.network} (chainId {record.chainId})
                  </div>
                </div>

                <div className="row">
                  <div className="label">Contract</div>
                  <div className="mono">{record.contract}</div>

                  <div className="btnRow">
                    <button
                      className={`copyBtn ${
                        copiedKey === "contract" ? "copied" : ""
                      }`}
                      onClick={() => copyWithFeedback("contract", record.contract)}
                      type="button"
                      title="Copy contract address"
                    >
                      {labelFor("contract", "Copy")}
                    </button>

                    <a
                      className="openBtn"
                      href={polyscanAddr(record.contract)}
                      target="_blank"
                      rel="noreferrer"
                      title="Open contract in Polygonscan"
                    >
                      Open in Polygonscan
                    </a>
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
                      <div className="mono">
                        {formatUtcDateTime(record.claimableAt)}
                      </div>
                      {nowSec ? (
                        <div className="mutedSmall" suppressHydrationWarning>
                          Claimable in{" "}
                          {formatTimeUntil(record.claimableAt, nowSec)}
                        </div>
                      ) : null}
                      {record.voidTx ? (
                        <div className="mutedSmall">
                          This check was voided before it became claimable.
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                <div className="divider" />

                <h2 className="h2">Proof links</h2>

                <ul className="ul">
                  {record.mintTx ? (
                    <li className="li">
                      <div className="label">Mint</div>
                      <div className="inline">
                        {isTxHash(record.mintTx) ? (
                          <a
                            className="monoLink"
                            href={polyscanTx(record.mintTx)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {record.mintTx}
                          </a>
                        ) : (
                          <span className="mono invalid" title="Invalid tx hash">
                            {record.mintTx}
                          </span>
                        )}

                        <button
                          className={`copyBtn ${
                            copiedKey === "mint" ? "copied" : ""
                          }`}
                          onClick={() => copyWithFeedback("mint", record.mintTx || "")}
                          type="button"
                        >
                          {labelFor("mint", "Copy")}
                        </button>
                      </div>
                    </li>
                  ) : null}

                  {record.transferTx ? (
                    <li className="li">
                      <div className="label">Transfer</div>
                      <div className="inline">
                        {isTxHash(record.transferTx) ? (
                          <a
                            className="monoLink"
                            href={polyscanTx(record.transferTx)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {record.transferTx}
                          </a>
                        ) : (
                          <span className="mono invalid" title="Invalid tx hash">
                            {record.transferTx}
                          </span>
                        )}

                        <button
                          className={`copyBtn ${
                            copiedKey === "transfer" ? "copied" : ""
                          }`}
                          onClick={() =>
                            copyWithFeedback("transfer", record.transferTx || "")
                          }
                          type="button"
                        >
                          {labelFor("transfer", "Copy")}
                        </button>
                      </div>
                    </li>
                  ) : null}

                  {record.redeemTx ? (
                    <li className="li">
                      <div className="label">Redeem</div>
                      <div className="inline">
                        {isTxHash(record.redeemTx) ? (
                          <a
                            className="monoLink"
                            href={polyscanTx(record.redeemTx)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {record.redeemTx}
                          </a>
                        ) : (
                          <span className="mono invalid" title="Invalid tx hash">
                            {record.redeemTx}
                          </span>
                        )}

                        <button
                          className={`copyBtn ${
                            copiedKey === "redeem" ? "copied" : ""
                          }`}
                          onClick={() => copyWithFeedback("redeem", record.redeemTx || "")}
                          type="button"
                        >
                          {labelFor("redeem", "Copy")}
                        </button>
                      </div>
                    </li>
                  ) : null}

                  {record.voidTx ? (
                    <li className="li">
                      <div className="label">Void</div>
                      <div className="inline">
                        {isTxHash(record.voidTx) ? (
                          <a
                            className="monoLink"
                            href={polyscanTx(record.voidTx)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {record.voidTx}
                          </a>
                        ) : (
                          <span className="mono invalid" title="Invalid tx hash">
                            {record.voidTx}
                          </span>
                        )}

                        <button
                          className={`copyBtn ${
                            copiedKey === "void" ? "copied" : ""
                          }`}
                          onClick={() => copyWithFeedback("void", record.voidTx || "")}
                          type="button"
                        >
                          {labelFor("void", "Copy")}
                        </button>
                      </div>
                    </li>
                  ) : null}
                </ul>
              </>
            )}
          </div>
        </div>

        <div className="tip">
          Tip: This is an early explorer view. Full experience coming soon.
        </div>
      </div>

      <style jsx>{`
        .wrap {
          max-width: 1120px;
          margin: 48px auto;
          padding: 0 18px;
          font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
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
          font-size: 46px;
          line-height: 1.08;
          margin: 14px 0 12px;
          font-weight: 800;
          letter-spacing: -0.6px;
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
          font-weight: 800;
        }

        .pillDot {
          color: #64748b;
        }

        .status {
          display: inline-flex;
          gap: 10px;
          align-items: center;
          padding: 9px 12px;
          border-radius: 999px;
          font-size: 13px;
          font-weight: 900;
          border: 1px solid #e5e7eb;
          background: #f8fafc;
        }

        .statusLabel {
          color: #64748b;
          font-weight: 900;
        }

        .statusValue {
          font-weight: 900;
          letter-spacing: 0.2px;
        }

        .status.good {
          border-color: rgba(34, 197, 94, 0.45);
          background: rgba(34, 197, 94, 0.12);
        }
        .status.warn {
          border-color: rgba(245, 158, 11, 0.45);
          background: rgba(245, 158, 11, 0.12);
        }
        .status.bad {
          border-color: rgba(239, 68, 68, 0.45);
          background: rgba(239, 68, 68, 0.12);
        }

        .grid {
          display: grid;
          grid-template-columns: 560px 1fr;
          gap: 44px;
          align-items: start;
        }

        .card {
          width: 100%;
          border-radius: 4px; /* <-- 4px corner radius */
          box-shadow: 0 12px 34px rgba(0, 0, 0, 0.08);
          display: block;
        }

        .links {
          margin-top: 12px;
          font-size: 14px;
          display: flex;
          gap: 10px;
          align-items: center;
          flex-wrap: wrap;
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

        .mutedSmall {
          margin-top: 6px;
          color: #64748b;
          font-size: 13px;
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

        .btnRow {
          margin-top: 10px;
          display: flex;
          gap: 10px;
          align-items: center;
          flex-wrap: wrap;
        }

        .openBtn {
          border: 1px solid rgba(79, 70, 229, 0.25);
          background: rgba(79, 70, 229, 0.07);
          color: #4f46e5;
          border-radius: 10px;
          padding: 6px 10px;
          font-size: 12px;
          font-weight: 900;
          text-decoration: none;
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
          border-radius: 10px;
          padding: 6px 10px;
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
          margin-top: 36px;
          font-size: 14px;
          color: #64748b;
          text-align: left;
        }

        .muted {
          color: #64748b;
        }

        .mono {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
            "Liberation Mono", "Courier New", monospace;
          word-break: break-all;
        }

        .monoLink {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
            "Liberation Mono", "Courier New", monospace;
          word-break: break-all;
        }

        .invalid {
          color: #b91c1c;
          font-weight: 900;
        }

        @media (max-width: 1040px) {
          .grid {
            grid-template-columns: 1fr;
            gap: 26px;
          }
        }
      `}</style>
    </>
  );
}
