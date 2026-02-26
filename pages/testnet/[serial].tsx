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

  if (!isValidSerialFormat(normalized)) {
    return { notFound: true };
  }

  const record =
    (serials as Record<string, SerialRecord | undefined>)[normalized] || null;

  const proto = (ctx.req.headers["x-forwarded-proto"] as string) || "https";
  const host = ctx.req.headers.host || "explorer.checks.xyz";
  const origin = `${proto}://${host}`;

  return { props: { serial: normalized, record, origin } };
};

function polyscanTx(tx?: string) {
  return tx ? `https://amoy.polygonscan.com/tx/${tx}` : null;
}
function polyscanAddr(addr: string) {
  return `https://amoy.polygonscan.com/address/${addr}`;
}

function getStatus(r: SerialRecord) {
  if (r.voidTx) return { label: "Voided", tone: "bad" as const };
  if (r.redeemTx) return { label: "Redeemed", tone: "good" as const };
  if (r.claimableAt) return { label: "Postdated", tone: "warn" as const };
  return { label: "Active", tone: "neutral" as const };
}

async function safeCopy(text: string): Promise<boolean> {
  if (!text) return false;

  // Clipboard API (best)
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // fall through
  }

  // Fallback for restricted contexts
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
  // bump this anytime you want to force-refresh the image endpoint everywhere
  const IMAGE_VERSION = "final";

  const imagePath = `/api/checks/image/${encodeURIComponent(serial)}?v=${IMAGE_VERSION}`;
  const pageUrl = `${origin}/testnet/${encodeURIComponent(serial)}`;
  const ogImageUrl = `${origin}${imagePath}`;

  const title = `Checks Explorer Testnet • ${serial}`;
  const description =
    "Payment Checks v1 testnet serial page with on-chain proof links and check card image.";

  const status = record ? getStatus(record) : null;

  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
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

  function copyLabel(key: string) {
    return copiedKey === key ? "Copied" : "Copy";
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
          <Link href="/" className="back">
            ← Checks Explorer
          </Link>

          <h1 className="serial">{serial}</h1>

          <div className="subRow">
            <div className="pill" aria-label="network pill">
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

              <button
                className={`copyMini ${copiedKey === "page" ? "copied" : ""}`}
                onClick={() => copyWithFeedback("page", pageUrl)}
                type="button"
                title="Copy page link"
              >
                {copyLabel("page")}
              </button>
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
                  <div className="inline">
                    <span className="mono">{record.contract}</span>

                    <a
                      className="openBtn"
                      href={polyscanAddr(record.contract)}
                      target="_blank"
                      rel="noreferrer"
                      title="Open contract in Polygonscan"
                    >
                      Open in Polygonscan
                    </a>

                    <button
                      className={`copyBtn ${copiedKey === "contract" ? "copied" : ""}`}
                      onClick={() => copyWithFeedback("contract", record.contract)}
                      type="button"
                      title="Copy contract address"
                    >
                      {copyLabel("contract")}
                    </button>
                  </div>
                </div>

                <div className="row">
                  <div className="label">TokenId</div>
                  <div className="mono">{record.tokenId}</div>
                </div>

                {record.claimableAt ? (
                  <div className="row">
                    <div className="label">claimableAt</div>
                    <div className="mono">{record.claimableAt}</div>
                  </div>
                ) : null}

                <div className="divider" />

                <h2 className="h2">Proof links</h2>

                <ul className="ul">
                  {record.mintTx ? (
                    <li className="li">
                      <span className="liLabel">Mint</span>
                      <div className="inline">
                        <a
                          className="monoLink"
                          href={polyscanTx(record.mintTx) || "#"}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {record.mintTx}
                        </a>
                        <button
                          className={`copyBtn ${copiedKey === "mint" ? "copied" : ""}`}
                          onClick={() => copyWithFeedback("mint", record.mintTx || "")}
                          type="button"
                          title="Copy mint tx"
                        >
                          {copyLabel("mint")}
                        </button>
                      </div>
                    </li>
                  ) : null}

                  {record.transferTx ? (
                    <li className="li">
                      <span className="liLabel">Transfer</span>
                      <div className="inline">
                        <a
                          className="monoLink"
                          href={polyscanTx(record.transferTx) || "#"}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {record.transferTx}
                        </a>
                        <button
                          className={`copyBtn ${copiedKey === "transfer" ? "copied" : ""}`}
                          onClick={() =>
                            copyWithFeedback("transfer", record.transferTx || "")
                          }
                          type="button"
                          title="Copy transfer tx"
                        >
                          {copyLabel("transfer")}
                        </button>
                      </div>
                    </li>
                  ) : null}

                  {record.redeemTx ? (
                    <li className="li">
                      <span className="liLabel">Redeem</span>
                      <div className="inline">
                        <a
                          className="monoLink"
                          href={polyscanTx(record.redeemTx) || "#"}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {record.redeemTx}
                        </a>
                        <button
                          className={`copyBtn ${copiedKey === "redeem" ? "copied" : ""}`}
                          onClick={() => copyWithFeedback("redeem", record.redeemTx || "")}
                          type="button"
                          title="Copy redeem tx"
                        >
                          {copyLabel("redeem")}
                        </button>
                      </div>
                    </li>
                  ) : null}

                  {record.voidTx ? (
                    <li className="li">
                      <span className="liLabel">Void</span>
                      <div className="inline">
                        <a
                          className="monoLink"
                          href={polyscanTx(record.voidTx) || "#"}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {record.voidTx}
                        </a>
                        <button
                          className={`copyBtn ${copiedKey === "void" ? "copied" : ""}`}
                          onClick={() => copyWithFeedback("void", record.voidTx || "")}
                          type="button"
                          title="Copy void tx"
                        >
                          {copyLabel("void")}
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
          color: #111827;
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
          color: #111827;
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
          border-radius: 16px;
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

        .copyMini {
          border: 1px solid #e5e7eb;
          background: #ffffff;
          border-radius: 10px;
          padding: 6px 10px;
          font-size: 12px;
          font-weight: 900;
          cursor: pointer;
        }

        .copyMini:hover {
          background: #f8fafc;
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
          margin-bottom: 4px;
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
          gap: 12px;
        }

        .li {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .liLabel {
          font-weight: 900;
          color: #111827;
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
          border: 1px solid #e5e7eb;
          background: #ffffff;
          border-radius: 10px;
          padding: 6px 10px;
          font-size: 12px;
          font-weight: 900;
          cursor: pointer;
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
