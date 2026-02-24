import type { GetServerSideProps } from "next";
import Head from "next/head";
import Link from "next/link";

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

function copyText(text: string) {
  try {
    navigator.clipboard?.writeText(text);
  } catch {
    // no-op (clipboard may be blocked in some contexts)
  }
}

export default function TestnetSerialPage({ serial, record, origin }: PageProps) {
  // bump this anytime you want to force-refresh the image endpoint everywhere
  const IMAGE_VERSION = "final";

  const imagePath = `/api/checks/image/${encodeURIComponent(serial)}?v=${IMAGE_VERSION}`;
  const pageUrl = `${origin}/${encodeURIComponent(serial)}`;
  const ogImageUrl = `${origin}${imagePath}`;

  const title = `Checks Explorer Testnet • ${serial}`;
  const description =
    "Payment Checks v1 testnet serial page with on-chain proof links and check card image.";

  const status = record ? getStatus(record) : null;

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
              <div className={`status ${status.tone}`} title="Status derived from proof links">
                {status.label}
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
              {" · "}
              <a href={pageUrl} target="_blank" rel="noreferrer">
                Open page URL
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
                  <div className="inline">
                    <a
                      className="monoLink"
                      href={polyscanAddr(record.contract)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {record.contract}
                    </a>
                    <button
                      className="copyBtn"
                      onClick={() => copyText(record.contract)}
                      type="button"
                      title="Copy contract address"
                    >
                      Copy
                    </button>
                  </div>
                </div>

                <div className="row">
                  <div className="label">TokenId</div>
                  <div>{record.tokenId}</div>
                </div>

                {record.claimableAt ? (
                  <div className="row">
                    <div className="label">claimableAt</div>
                    <div className="mono">{record.claimableAt}</div>
                  </div>
                ) : null}

                <div className="divider" />

                <h2 className="h2">Links</h2>

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
                          className="copyBtn"
                          onClick={() => copyText(record.mintTx || "")}
                          type="button"
                          title="Copy mint tx"
                        >
                          Copy
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
                          className="copyBtn"
                          onClick={() => copyText(record.transferTx || "")}
                          type="button"
                          title="Copy transfer tx"
                        >
                          Copy
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
                          className="copyBtn"
                          onClick={() => copyText(record.redeemTx || "")}
                          type="button"
                          title="Copy redeem tx"
                        >
                          Copy
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
                          className="copyBtn"
                          onClick={() => copyText(record.voidTx || "")}
                          type="button"
                          title="Copy void tx"
                        >
                          Copy
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
          margin-bottom: 28px; /* more space before the card */
        }

        .back {
          color: #4f46e5;
          text-decoration: none;
        }

        .serial {
          font-size: 46px;
          line-height: 1.08;
          margin: 14px 0 12px;
          font-weight: 700;
          letter-spacing: -0.6px;
        }

        .subRow {
          display: flex;
          gap: 10px;
          align-items: center;
          flex-wrap: wrap;
          margin-bottom: 6px; /* space between pill row and grid below */
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
        }

        .pillStrong {
          font-weight: 700;
        }

        .pillDot {
          color: #64748b;
        }

        .status {
          padding: 7px 10px;
          border-radius: 999px;
          font-size: 13px;
          font-weight: 700;
          border: 1px solid #e5e7eb;
          background: #f8fafc;
          color: #111827;
        }
        .status.good {
          border-color: rgba(34, 197, 94, 0.35);
          background: rgba(34, 197, 94, 0.08);
        }
        .status.warn {
          border-color: rgba(245, 158, 11, 0.35);
          background: rgba(245, 158, 11, 0.08);
        }
        .status.bad {
          border-color: rgba(239, 68, 68, 0.35);
          background: rgba(239, 68, 68, 0.08);
        }

        .grid {
          display: grid;
          grid-template-columns: 560px 1fr;
          gap: 44px; /* more breathing room between card and Details */
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
        }

        .h2 {
          font-size: 28px;
          margin: 0 0 14px 0;
          font-weight: 800;
        }

        .row {
          margin-bottom: 14px;
        }

        .label {
          color: #64748b;
          font-weight: 700;
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
          font-weight: 800;
          color: #111827;
        }

        .inline {
          display: flex;
          gap: 10px;
          align-items: center;
          flex-wrap: wrap;
        }

        .copyBtn {
          border: 1px solid #e5e7eb;
          background: #ffffff;
          border-radius: 10px;
          padding: 6px 10px;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
        }
        .copyBtn:hover {
          background: #f8fafc;
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
        }

        .monoLink {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
            "Liberation Mono", "Courier New", monospace;
          word-break: break-all; /* full hashes won’t overflow */
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
