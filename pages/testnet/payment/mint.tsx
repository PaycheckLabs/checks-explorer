import Head from "next/head";
import Link from "next/link";
import { useEffect, useState } from "react";

type Draft = {
  type: "payment" | "vesting" | "staking";
  title: string;
  memo: string;
  amount: string; // human input
  recipient: string;
  claimableAtMode: "instant" | "postdated";
  claimableAt: string; // yyyy-mm-ddThh:mm
  serial?: string; // generated later on preview
};

const DRAFT_KEY = "checks_testnet_draft_v1";

export default function PaymentMint() {
  const [draft, setDraft] = useState<Draft>({
    type: "payment",
    title: "",
    memo: "",
    amount: "100",
    recipient: "",
    claimableAtMode: "instant",
    claimableAt: "",
  });

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      if (raw) setDraft(JSON.parse(raw));
    } catch {
      // ignore
    }
  }, []);

  function saveAndGoPreview() {
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // ignore
    }
    window.location.href = "/testnet/payment/preview";
  }

  return (
    <>
      <Head>
        <title>Mint Payment Check — Testnet</title>
      </Head>

      <div className="page">
        <div className="container">
          <header className="top">
            <Link href="/testnet" className="brand">
              ← Portfolio
            </Link>
            <div className="netPill">Testnet • Polygon Amoy (80002)</div>
          </header>

          <h1 className="h1">Mint Check</h1>

          <div className="tabs">
            <Link className={`tab ${draft.type === "payment" ? "active" : ""}`} href="/testnet/payment/mint">
              Payment
            </Link>
            <button className="tab disabled" type="button" title="Coming soon">
              Vesting
            </button>
            <button className="tab disabled" type="button" title="Coming soon">
              Staking
            </button>
          </div>

          <div className="grid">
            <div className="panel">
              <h2 className="h2">Details</h2>

              <label className="field">
                <div className="label">Title</div>
                <input
                  className="input"
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  placeholder="Demo Payment"
                />
              </label>

              <label className="field">
                <div className="label">Memo</div>
                <textarea
                  className="textarea"
                  value={draft.memo}
                  onChange={(e) => setDraft({ ...draft, memo: e.target.value })}
                  placeholder="Optional memo..."
                />
              </label>

              <div className="row2">
                <label className="field">
                  <div className="label">Token collateral</div>
                  <div className="pillStatic">Mock USD (mUSD)</div>
                </label>

                <label className="field">
                  <div className="label">Amount</div>
                  <input
                    className="input"
                    value={draft.amount}
                    onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
                    placeholder="100"
                  />
                </label>
              </div>

              <label className="field">
                <div className="label">Recipient</div>
                <input
                  className="input"
                  value={draft.recipient}
                  onChange={(e) => setDraft({ ...draft, recipient: e.target.value })}
                  placeholder="0x..."
                />
                <div className="hint">For now, use your own address until wallet connect is added.</div>
              </label>

              <div className="field">
                <div className="label">Claim timing</div>
                <div className="radioRow">
                  <button
                    type="button"
                    className={`radio ${draft.claimableAtMode === "instant" ? "active" : ""}`}
                    onClick={() => setDraft({ ...draft, claimableAtMode: "instant" })}
                  >
                    Instant Claim
                  </button>
                  <button
                    type="button"
                    className={`radio ${draft.claimableAtMode === "postdated" ? "active" : ""}`}
                    onClick={() => setDraft({ ...draft, claimableAtMode: "postdated" })}
                  >
                    Post-dated
                  </button>
                </div>

                {draft.claimableAtMode === "postdated" && (
                  <input
                    className="input"
                    type="datetime-local"
                    value={draft.claimableAt}
                    onChange={(e) => setDraft({ ...draft, claimableAt: e.target.value })}
                  />
                )}
              </div>

              <div className="btnRow">
                <button className="btnPrimary" type="button" onClick={saveAndGoPreview}>
                  Continue to Preview
                </button>
              </div>
            </div>

            <div className="panel">
              <h2 className="h2">Preview</h2>
              <div className="previewCard">
                <div className="pcTop">
                  <div className="pcBadge">mUSD</div>
                  <div className="pcAmt">{draft.amount || "—"} mUSD</div>
                </div>

                <div className="pcTitle">Payment Check</div>
                <div className="pcLine">
                  <span className="pcKey">Title</span>
                  <span className="pcVal">{draft.title || "—"}</span>
                </div>
                <div className="pcLine">
                  <span className="pcKey">Recipient</span>
                  <span className="pcVal mono">{draft.recipient || "—"}</span>
                </div>
                <div className="pcLine">
                  <span className="pcKey">Claim</span>
                  <span className="pcVal">
                    {draft.claimableAtMode === "instant"
                      ? "Instant"
                      : draft.claimableAt
                      ? draft.claimableAt
                      : "Post-dated"}
                  </span>
                </div>
                <div className="pcMemo">
                  <div className="pcKey">Memo</div>
                  <div className="pcVal">{draft.memo || "—"}</div>
                </div>

                <div className="pcFooter muted">Serial + QR will be added after mint.</div>
              </div>

              <div className="panelNote muted">
                Network is locked to Polygon Amoy (80002). Wallet connect and mint transaction wiring is next.
              </div>
            </div>
          </div>

          <footer className="footer">
            <div className="muted">Powered by Checks</div>
            <div className="muted">Tip: This is an early mint flow. Full MVP wiring in progress.</div>
          </footer>
        </div>
      </div>

      <style jsx>{styles}</style>
    </>
  );
}

const styles = `
.page{font-family:Kanit,ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;background:#fff;color:#0f172a;min-height:100vh;}
.container{max-width:1040px;margin:0 auto;padding:28px 18px 40px;}
.top{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:14px;}
.brand{color:#4f46e5;text-decoration:none;font-weight:800;}
.brand:hover{text-decoration:underline;}
.netPill{border:1px solid #e5e7eb;border-radius:999px;padding:8px 12px;font-size:13px;font-weight:700;color:#0f172a;}
.h1{font-size:52px;line-height:1.02;margin:10px 0 10px;font-weight:900;letter-spacing:-0.02em;}
.tabs{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:10px 0 18px;}
.tab{border:1px solid #e5e7eb;border-radius:999px;padding:8px 12px;font-size:13px;font-weight:800;color:#0f172a;background:#fff;text-decoration:none;}
.tab.active{border-color:#4f46e5;color:#4f46e5;}
.tab.disabled{opacity:.45;cursor:not-allowed;}
.grid{display:grid;grid-template-columns:1.12fr 1fr;gap:22px;align-items:start;}
.panel{border:1px solid #e5e7eb;border-radius:18px;padding:18px;background:#fff;}
.h2{font-size:28px;margin:0 0 14px;font-weight:900;letter-spacing:-0.01em;}
.field{display:block;margin-bottom:14px;}
.label{font-size:13px;font-weight:900;margin-bottom:6px;color:#0f172a;}
.hint{color:#64748b;font-size:12px;margin-top:6px;}
.input,.textarea{width:100%;border:1px solid #e5e7eb;border-radius:12px;padding:10px 12px;font-size:14px;font-family:inherit;outline:none;}
.textarea{min-height:88px;resize:vertical;}
.input:focus,.textarea:focus{border-color:rgba(79,70,229,.55);box-shadow:0 0 0 4px rgba(79,70,229,.08);}
.row2{display:grid;grid-template-columns:1fr 1fr;gap:14px;}
.pillStatic{border:1px solid #e5e7eb;border-radius:12px;padding:10px 12px;font-size:14px;font-weight:800;background:#f8fafc;}
.radioRow{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px;}
.radio{border:1px solid #e5e7eb;border-radius:999px;padding:8px 12px;font-size:13px;font-weight:900;background:#fff;cursor:pointer;}
.radio.active{border-color:#4f46e5;color:#4f46e5;}
.btnRow{margin-top:10px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;}
.btnPrimary{border:1px solid #4f46e5;background:#4f46e5;color:#fff;border-radius:999px;padding:10px 14px;font-size:14px;font-weight:900;cursor:pointer;}
.btnPrimary:hover{opacity:.92;}
.previewCard{border:1px dashed #e5e7eb;border-radius:16px;padding:14px;background:#fafafa;}
.pcTop{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;}
.pcBadge{border:1px solid #e5e7eb;border-radius:999px;padding:6px 10px;font-size:12px;font-weight:900;background:#fff;}
.pcAmt{font-size:14px;font-weight:900;}
.pcTitle{font-size:18px;font-weight:900;margin:6px 0 12px;}
.pcLine{display:flex;justify-content:space-between;gap:10px;margin-bottom:8px;}
.pcKey{color:#64748b;font-size:12px;font-weight:900;}
.pcVal{font-size:12px;font-weight:800;color:#0f172a;}
.mono{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace;}
.pcMemo{margin-top:10px;padding-top:10px;border-top:1px solid #e5e7eb;}
.pcFooter{margin-top:12px;}
.panelNote{margin-top:12px;}
.muted{color:#64748b;font-size:13px;}
.footer{margin-top:34px;display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;}
@media (max-width:1040px){.grid{grid-template-columns:1fr;gap:18px;}.h1{font-size:44px;}}
`;
