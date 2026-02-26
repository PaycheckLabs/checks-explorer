import Link from "next/link";
import { useRouter } from "next/router";
import { useMemo, useState } from "react";

import serialsJson from "../data/testnet-serials.json";
import { isValidSerialFormat, normalizeSerial } from "../lib/serial";

type SerialRecord = {
  checkType?: "Payment" | "Vesting" | "Staking" | string;

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

function getStatus(r: SerialRecord) {
  if (r.voidTx) return { label: "Voided", tone: "bad" as const };
  if (r.redeemTx) return { label: "Redeemed", tone: "good" as const };
  if (r.claimableAt) return { label: "Post-dated", tone: "warn" as const };
  return { label: "Active", tone: "neutral" as const };
}

export default function Home() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const items = useMemo(() => {
    const serials = serialsJson as Record<string, SerialRecord>;
    return Object.entries(serials)
      .map(([serial, record]) => {
        const status = getStatus(record);
        const checkType = record.checkType || "Payment";
        return { serial, record: { ...record, checkType }, status };
      })
      // "Newest" approximation until we index timestamps:
      .sort((a, b) => (b.record.tokenId || 0) - (a.record.tokenId || 0));
  }, []);

  const itemsPerPage = 10;

  const currentPage = useMemo(() => {
    const raw = router.query.page;
    const n = typeof raw === "string" ? parseInt(raw, 10) : 1;
    return Number.isFinite(n) && n > 0 ? n : 1;
  }, [router.query.page]);

  const totalPages = Math.max(1, Math.ceil(items.length / itemsPerPage));

  const page = Math.min(currentPage, totalPages);
  const start = (page - 1) * itemsPerPage;
  const visible = items.slice(start, start + itemsPerPage);

  function setPage(next: number) {
    const p = Math.max(1, Math.min(totalPages, next));
    router.push(
      { pathname: "/", query: p === 1 ? {} : { page: String(p) } },
      undefined,
      { shallow: true }
    );
  }

  function go(serialRaw: string) {
    const normalized = normalizeSerial(serialRaw);
    if (!normalized) return;

    if (!isValidSerialFormat(normalized)) {
      setError("Serial format looks invalid. Example: FMV-8427BC-UK45");
      return;
    }

    setError(null);
    router.push(`/testnet/${normalized}`);
  }

  return (
    <main className="wrap">
      <header className="hero">
        <h1 className="title">Checks Explorer</h1>
        <p className="sub">
          View a check by serial and verify proof links on Polygon Amoy.
        </p>
      </header>

      <section className="card">
        <div className="cardTitle">Find a check</div>

        <form
          className="searchRow"
          onSubmit={(e) => {
            e.preventDefault();
            go(value);
          }}
        >
          <input
            className="input"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Enter serial, for example: FMV-8427BC-UK45"
            spellCheck={false}
            autoCapitalize="characters"
            autoCorrect="off"
          />
          <button className="btn" type="submit">
            View
          </button>
        </form>

        {error ? <div className="error">{error}</div> : null}

        <div className="hint">
          Testnet serial routes live under <code>/testnet/&lt;serial&gt;</code>.
        </div>
      </section>

      <section className="section">
        <div className="sectionHeader">
          <h2 className="h2">Recent Checks</h2>
          <div className="muted">
            Curated list driven by <code>data/testnet-serials.json</code>.
          </div>
        </div>

        {visible.length === 0 ? (
          <div className="muted">No checks are listed yet.</div>
        ) : (
          <div className="list">
            {visible.map(({ serial, record, status }) => (
              <Link
                key={serial}
                href={`/testnet/${serial}`}
                passHref
                legacyBehavior
              >
                <a className="item">
                  <div className="itemLeft">
                    <div className="serial">{serial}</div>
                    <div className="meta">
                      <span className="typePill">{record.checkType}</span>
                      <span className="sep">·</span>
                      TokenId {record.tokenId}
                      <span className="sep">·</span>
                      {record.network} ({record.chainId})
                    </div>
                  </div>

                  <div className={`status ${status.tone}`} aria-label="status badge">
                    {status.label}
                  </div>
                </a>
              </Link>
            ))}
          </div>
        )}

        {totalPages > 1 ? (
          <div className="pager" aria-label="pagination">
            <button
              className="pagerBtn"
              onClick={() => setPage(page - 1)}
              disabled={page <= 1}
              type="button"
            >
              ← Prev
            </button>

            <div className="pagerText">
              Page <span className="strong">{page}</span> of{" "}
              <span className="strong">{totalPages}</span>
            </div>

            <button
              className="pagerBtn"
              onClick={() => setPage(page + 1)}
              disabled={page >= totalPages}
              type="button"
            >
              Next →
            </button>
          </div>
        ) : null}
      </section>

      <footer className="footer">
        <div className="muted">Powered by Checks</div>
        <div className="tip">
          Tip: This is an early explorer view. Full experience coming soon.
        </div>
      </footer>

      <style jsx>{`
        .wrap {
          max-width: 980px;
          margin: 48px auto;
          padding: 0 18px;
          font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
          color: #111827;
        }

        .hero {
          margin-bottom: 22px;
        }

        .title {
          font-size: 40px;
          line-height: 1.1;
          margin: 0;
          font-weight: 800;
          letter-spacing: -0.6px;
        }

        .sub {
          margin: 10px 0 0;
          color: #64748b;
          max-width: 56ch;
        }

        .card {
          border: 1px solid #e5e7eb;
          border-radius: 16px;
          padding: 18px;
          background: #ffffff;
          box-shadow: 0 10px 28px rgba(0, 0, 0, 0.06);
          margin-bottom: 26px;
        }

        .cardTitle {
          font-weight: 800;
          margin-bottom: 10px;
        }

        .searchRow {
          display: flex;
          gap: 10px;
          align-items: center;
          flex-wrap: wrap;
        }

        .input {
          flex: 1;
          min-width: 260px;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          padding: 10px 12px;
          font-size: 14px;
          outline: none;
        }

        .input:focus {
          border-color: rgba(79, 70, 229, 0.55);
          box-shadow: 0 0 0 4px rgba(79, 70, 229, 0.12);
        }

        .btn {
          border: 1px solid #e5e7eb;
          background: #111827;
          color: #ffffff;
          border-radius: 12px;
          padding: 10px 14px;
          font-size: 14px;
          font-weight: 800;
          cursor: pointer;
        }

        .btn:hover {
          opacity: 0.92;
        }

        .hint {
          margin-top: 10px;
          color: #64748b;
          font-size: 13px;
        }

        .error {
          margin-top: 10px;
          color: #b91c1c;
          font-size: 13px;
          font-weight: 700;
        }

        .sectionHeader {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: baseline;
          flex-wrap: wrap;
          margin-bottom: 14px;
        }

        .section {
          margin-top: 10px;
        }

        .h2 {
          font-size: 22px;
          margin: 0;
          font-weight: 900;
        }

        .muted {
          color: #64748b;
          font-size: 13px;
        }

        .list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 14px;
          border: 1px solid #e5e7eb;
          border-radius: 14px;
          padding: 14px 16px;
          text-decoration: none;
          color: inherit;
          background: #ffffff;
        }

        .item:hover {
          background: #f8fafc;
        }

        .serial {
          font-weight: 900;
          letter-spacing: 0.2px;
          font-size: 15px;
        }

        .meta {
          margin-top: 6px;
          color: #64748b;
          font-size: 13px;
          display: flex;
          gap: 8px;
          align-items: center;
          flex-wrap: wrap;
        }

        .typePill {
          display: inline-flex;
          align-items: center;
          padding: 4px 8px;
          border-radius: 999px;
          border: 1px solid #e5e7eb;
          background: #f8fafc;
          color: #111827;
          font-weight: 900;
          font-size: 12px;
        }

        .sep {
          color: #94a3b8;
        }

        .status {
          padding: 8px 12px;
          border-radius: 999px;
          font-size: 13px;
          font-weight: 900;
          border: 1px solid #e5e7eb;
          background: #f8fafc;
          color: #111827;
          white-space: nowrap;
          flex: 0 0 auto;
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

        .pager {
          margin-top: 18px;
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: center;
          flex-wrap: wrap;
        }

        .pagerBtn {
          border: 1px solid #e5e7eb;
          background: #ffffff;
          border-radius: 12px;
          padding: 10px 12px;
          font-size: 13px;
          font-weight: 900;
          cursor: pointer;
        }

        .pagerBtn:hover {
          background: #f8fafc;
        }

        .pagerBtn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .pagerText {
          color: #64748b;
          font-size: 13px;
          font-weight: 800;
        }

        .strong {
          color: #111827;
          font-weight: 900;
        }

        .footer {
          margin-top: 34px;
          padding-top: 18px;
          border-top: 1px solid #e5e7eb;
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: baseline;
          flex-wrap: wrap;
        }

        .tip {
          color: #64748b;
          font-size: 13px;
        }
      `}</style>
    </main>
  );
}
