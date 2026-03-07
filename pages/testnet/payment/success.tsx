import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import { isValidSerialFormat, normalizeSerial } from "../../../lib/serial";

const AMOY_SCAN_BASE = "https://amoy.polygonscan.com";

function scanTx(hash: string) {
  return `${AMOY_SCAN_BASE}/tx/${hash}`;
}

export default function PaymentMintSuccess() {
  const router = useRouter();
  const [countdown, setCountdown] = useState(2);

  const serial = useMemo(() => {
    const raw = typeof router.query.serial === "string" ? router.query.serial : "";
    return raw ? normalizeSerial(raw) : "";
  }, [router.query.serial]);

  const tx = useMemo(() => {
    return typeof router.query.tx === "string" ? router.query.tx : "";
  }, [router.query.tx]);

  const isValid = useMemo(() => (serial ? isValidSerialFormat(serial) : false), [serial]);

  useEffect(() => {
    if (!isValid) return;

    const tick = setInterval(() => setCountdown((c) => Math.max(0, c - 1)), 1000);
    const go = setTimeout(() => {
      window.location.href = `/testnet/${serial}`;
    }, 2000);

    return () => {
      clearInterval(tick);
      clearTimeout(go);
    };
  }, [isValid, serial]);

  return (
    <>
      <Head>
        <title>Mint Successful — Testnet</title>
      </Head>

      <div className="page">
        <div className="wrap">
          <div className="top">
            <Link className="back" href="/testnet">
              ← Back to Testnet
            </Link>
          </div>

          <div className="card">
            <div className="h1">Mint successful ✅</div>
            <div className="sub">
              Your Payment Check has been minted. We’ll take you to the serial page automatically.
            </div>

            {!serial ? (
              <div className="error">
                Missing serial. Please return to the Mint flow and try again.
              </div>
            ) : !isValid ? (
              <div className="error">
                Serial format is invalid. Please verify the link.
              </div>
            ) : (
              <>
                <div className="row">
                  <div className="k">Serial</div>
                  <div className="v mono">{serial}</div>
                </div>

                {tx ? (
                  <div className="row">
                    <div className="k">Transaction</div>
                    <div className="v">
                      <a className="link mono" href={scanTx(tx)} target="_blank" rel="noreferrer">
                        {tx}
                      </a>
                    </div>
                  </div>
                ) : null}

                <div className="actions">
                  <a className="btnPrimary" href={`/testnet/${serial}`}>
                    View Check
                  </a>
                  <Link className="btnGhost" href="/testnet/payment/mint">
                    Mint another
                  </Link>
                </div>

                <div className="note">
                  Redirecting in {countdown}s…
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <style jsx>{`
        .page {
          min-height: 100vh;
          background: radial-gradient(1200px 600px at 20% 0%, rgba(255,255,255,0.08), transparent 60%),
            radial-gradient(900px 500px at 90% 20%, rgba(255,255,255,0.06), transparent 55%),
            #0b0f14;
          color: #e5e7eb;
          font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
          padding: 28px 22px 40px;
        }
        .wrap {
          max-width: 720px;
          margin: 0 auto;
        }
        .top {
          margin-bottom: 14px;
        }
        .back {
          color: #9ca3af;
          text-decoration: none;
          font-weight: 800;
        }
        .back:hover {
          color: #e5e7eb;
        }
        .card {
          border: 1px solid rgba(255,255,255,0.10);
          border-radius: 18px;
          background: rgba(255,255,255,0.03);
          padding: 18px;
        }
        .h1 {
          font-size: 32px;
          font-weight: 900;
          letter-spacing: -0.02em;
          margin-bottom: 6px;
        }
        .sub {
          color: #9ca3af;
          font-weight: 800;
          line-height: 1.35;
          margin-bottom: 14px;
        }
        .row {
          display: flex;
          justify-content: space-between;
          gap: 14px;
          padding: 10px 0;
          border-top: 1px solid rgba(255,255,255,0.06);
          align-items: center;
        }
        .row:first-of-type {
          border-top: none;
        }
        .k {
          color: #9ca3af;
          font-weight: 800;
          font-size: 13px;
        }
        .v {
          font-weight: 900;
          text-align: right;
        }
        .mono {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
        }
        .link {
          color: #7dd3fc;
          text-decoration: none;
        }
        .link:hover {
          text-decoration: underline;
        }
        .actions {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          margin-top: 14px;
        }
        .btnPrimary {
          background: linear-gradient(180deg, rgba(56,189,248,0.95), rgba(14,165,233,0.90));
          border: 1px solid rgba(56,189,248,0.55);
          color: #001018;
          font-weight: 900;
          border-radius: 12px;
          padding: 12px 16px;
          text-decoration: none;
          display: inline-block;
        }
        .btnGhost {
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.10);
          color: #e5e7eb;
          font-weight: 900;
          border-radius: 12px;
          padding: 12px 16px;
          text-decoration: none;
          display: inline-block;
        }
        .note {
          margin-top: 12px;
          color: #9ca3af;
          font-weight: 800;
          font-size: 13px;
        }
        .error {
          border-radius: 12px;
          padding: 10px 12px;
          border: 1px solid rgba(239,68,68,0.28);
          background: rgba(239,68,68,0.10);
          color: #fecaca;
          font-weight: 900;
        }
      `}</style>
    </>
  );
}
