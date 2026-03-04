import Head from "next/head";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Draft = {
  type: "payment" | "vesting" | "staking";
  title: string;
  memo: string;
  amount: string;
  recipient: string;
  claimableAtMode: "instant" | "postdated";
  claimableAt: string;
  serial?: string;
};

const DRAFT_KEY = "checks_testnet_draft_v1";

function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randChar(set: string) {
  return set[randInt(0, set.length - 1)];
}

function generateSerial(): string {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // omit confusing I/O
  const digits = "0123456789";

  const a = `${randChar(letters)}${randChar(letters)}${randChar(letters)}`;
  const b = `${randChar(digits)}${randChar(digits)}${randChar(digits)}${randChar(digits)}`;
  const c = `${randChar(letters)}${randChar(letters)}`;
  const d = `${randChar(letters)}${randChar(letters)}${randChar(digits)}${randChar(digits)}`;

  return `${a}-${b}${c}-${d}`;
}

export default function PaymentPreview() {
  const [draft, setDraft] = useState<Draft | null>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      if (!raw) {
        setDraft(null);
        return;
      }
      const parsed = JSON.parse(raw) as Draft;

      if (!parsed.serial) {
        parsed.serial = generateSerial();
        sessionStorage.setItem(DRAFT_KEY, JSON.stringify(parsed));
      }

      setDraft(parsed);
    } catch {
      setDraft(null);
    }
  }, []);

  const claimText = useMemo(() => {
    if (!draft) return "—";
    if (draft.claimableAtMode === "instant") return "Instant Claim";
    return draft.claimableAt ? `Post-dated: ${draft.claimableAt}` : "Post-dated";
  }, [draft]);

  function goBack() {
    window.location.href = "/testnet/payment/mint";
  }

  function mintStub() {
    // Phase 2: wallet connect + faucet/approve/mint.
    // For now, just show a placeholder alert so flow is clear.
    alert("Next step: wire wallet + approve + mintPaymentCheck on Amoy.");
  }

  return (
    <>
      <Head>
        <title>Preview Payment Check — Testnet</title>
      </Head>

      <div className="page">
        <div className="container">
          <header className="top">
            <Link href="/testnet/payment/mint" className="brand">
              ← Back to Mint
            </Link>
            <div className="netPill">Testnet • Polygon Amoy (80002)</div>
          </header>

          <h1 className="h1">Preview</h1>

          {!draft ? (
            <div className="panel">
              <div className="label">No draft found</div>
              <div className="muted">Return to the mint page to enter check details.</div>
              <div className="btnRow">
                <Link className="btnPrimary" href="/testnet/payment/mint">
                  Go to Mint
                </Link>
              </div>
            </div>
          ) : (
            <div className="grid">
              <div className="panel">
                <h2 className="h2">Preview</h2>

                <div className="previewCard">
                  <div className="pcTop">
                    <div className="pcBadge">mUSD</div>
                    <div className="pcAmt">{draft.amount || "—"} mUSD</div>
                  </div>

                  <div className="pcTitle">Payment Check</div>

                  <div className="pcLine">
                    <span className="pcKey">Serial</span>
                    <span className="pcVal mono">{draft.serial}</span>
                  </div>

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
                    <span className="pcVal">{claimText}</span>
                  </div>

                  <div className="pcMemo">
                    <div className="pcKey">Memo</div>
                    <div className="pcVal">{draft.memo || "—"}</div>
                  </div>

                  <div className="pcFooter muted">QR prints after mint. Explorer link is created after mint.</div>
                </div>

                <div className="btnRow">
                  <button className="btnGhost" type="button" onClick={goBack}>
                    Back
                  </button>
                  <button className="btnPrimary" type="button" onClick={mintStub}>
                    Mint on Testnet
                  </button>
                </div>
              </div>

              <div className="panel">
                <h2 className="h2">Summary</h2>

                <div className="summary">
                  <div className="sRow">
                    <div className="sKey">Check Type</div>
                    <div className="sVal">Payment</div>
                  </div>
                  <div className="sRow">
                    <div className="sKey">Token</div>
                    <div className="sVal">Mock USD (mUSD)</div>
                  </div>
                  <div className="sRow">
                    <div className="sKey">Network</div>
                    <div className="sVal">Polygon Amoy (80002)</div>
                  </div>
                  <div className="sRow">
                    <div className="sKey">Serial</div>
                    <div className="sVal mono">{draft.serial}</div>
                  </div>
                </div>

                <div className="muted note">
                  Next: wallet connect + faucet/approve/mint. After mint, we redirect to:
                  <div className="mono">{`https://explorer.checks.xyz/testnet/${draft.serial}`}</div>
                </div>
              </div>
            </div>
          )}

          <footer className="footer">
            <div className="muted">Powered by Checks</div>
            <div className="muted">Tip: This is an early preview step. Full mint wiring is next.</div>
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
.grid{display:grid;grid-template-columns:1.12fr 1fr;gap:22px;align-items:start;}
.panel{border:1px solid #e5e7eb;border-radius:18px;padding:18px;background:#fff;}
.h2{font-size:28px;margin:0 0 14px;font-weight:900;letter-spacing:-0.01em;}
.label{font-size:14px;font-weight:900;margin-bottom:6px;color:#0f172a;}
.muted{color:#64748b;font-size:13px;}
.note{margin-top:14px;line-height:1.35;}
.btnRow{margin-top:12px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;}
.btnPrimary{border:1px solid #4f46e5;background:#4f46e5;color:#fff;border-radius:999px;padding:10px 14px;font-size:14px;font-weight:900;cursor:pointer;text-decoration:none;}
.btnPrimary:hover{opacity:.92;}
.btnGhost{border:1px solid #e5e7eb;background:#fff;color:#0f172a;border-radius:999px;padding:10px 14px;font-size:14px;font-weight:900;cursor:pointer;}
.btnGhost:hover{background:#f8fafc;}
.previewCard{border:1px dashed #e5e7eb;border-radius:16px;padding:14px;background:#fafafa;}
.pcTop{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;}
.pcBadge{border:1px solid #e5e7eb;border-radius:999px;padding:6px 10px;font-size:12px;font-weight:900;background:#fff;}
.pcAmt{font-size:14px;font-weight:900;}
.pcTitle{font-size:18px;font-weight:900;margin:6px 0 12px;}
.pcLine{display:flex;justify-content:space-between;gap:10px;margin-bottom:8px;}
.pcKey{color:#64748b;font-size:12px;font-weight:900;}
.pcVal{font-size:12px;font-weight:800;color:#0f172a;text-align:right;}
.mono{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace;}
.pcMemo{margin-top:10px;padding-top:10px;border-top:1px solid #e5e7eb;}
.pcFooter{margin-top:12px;}
.summary{display:flex;flex-direction:column;gap:10px;}
.sRow{display:flex;justify-content:space-between;gap:12px;}
.sKey{color:#64748b;font-size:13px;font-weight:900;}
.sVal{color:#0f172a;font-size:13px;font-weight:900;text-align:right;}
.footer{margin-top:34px;display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;}
@media (max-width:1040px){.grid{grid-template-columns:1fr;gap:18px;}.h1{font-size:44px;}}
`;
