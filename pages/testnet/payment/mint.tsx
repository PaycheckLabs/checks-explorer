import Head from "next/head";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAccount, useChainId } from "wagmi";
import { AMOY_CHAIN_ID } from "../../../lib/testnetContracts";

type Draft = {
  type: "payment" | "vesting" | "staking";
  title: string;
  memo: string;
  amount: string; // human input
  recipient: string;
  claimableAtMode: "instant" | "postdated";
  claimableAt: string; // yyyy-mm-ddThh:mm (datetime-local)
  serial?: string; // generated later (currently on preview)
};

const DRAFT_KEY = "checks_testnet_draft_v1";

function isHexAddress(v: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(v.trim());
}

function byteLen(s: string) {
  // Safe in browser + Node 18/20
  try {
    return new TextEncoder().encode(s).length;
  } catch {
    return s.length;
  }
}

export default function PaymentMint() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();

  const [mintToSelf, setMintToSelf] = useState(false);
  const [touched, setTouched] = useState(false);

  const [draft, setDraft] = useState<Draft>({
    type: "payment",
    title: "",
    memo: "",
    amount: "100",
    recipient: "",
    claimableAtMode: "instant",
    claimableAt: "",
  });

  // Load draft (client only)
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Draft;
        setDraft({
          type: parsed.type ?? "payment",
          title: parsed.title ?? "",
          memo: parsed.memo ?? "",
          amount: parsed.amount ?? "100",
          recipient: parsed.recipient ?? "",
          claimableAtMode: parsed.claimableAtMode ?? "instant",
          claimableAt: parsed.claimableAt ?? "",
          serial: parsed.serial,
        });
      }
    } catch {
      // ignore
    }
  }, []);

  // If mint-to-self is enabled, keep recipient synced with wallet
  useEffect(() => {
    if (!mintToSelf) return;
    if (!address) return;
    setDraft((d) => ({ ...d, recipient: address }));
  }, [mintToSelf, address]);

  const supportedNetwork = useMemo(() => {
    if (!isConnected) return false;
    return chainId === AMOY_CHAIN_ID;
  }, [isConnected, chainId]);

  const validationError = useMemo((): string | null => {
    const title = (draft.title || "").trim();
    const memo = draft.memo || "";
    const amt = (draft.amount || "").trim();
    const recipient = (draft.recipient || "").trim();

    if (!title) return "Check name is required.";
    const n = Number(amt);
    if (!amt || Number.isNaN(n) || n <= 0) return "Enter a valid collateral amount.";
    if (!recipient) return "Recipient address is required.";
    if (!isHexAddress(recipient)) return "Recipient address must be a valid 0x address.";

    if (draft.claimableAtMode === "postdated" && !draft.claimableAt) {
      return "Select a start date for post-dated checks.";
    }

    // Match Preview constraints (bytes)
    if (byteLen(memo) > 160) return "Memo is too long (max 160 bytes).";
    if (byteLen(title) > 32) return "Check name is too long (max 32 bytes).";

    return null;
  }, [draft]);

  const canContinue = useMemo(() => !validationError, [validationError]);

  function persist(next: Draft) {
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  }

  function saveAndGoPreview() {
    setTouched(true);
    if (validationError) return;
    persist(draft);
    window.location.href = "/testnet/payment/preview";
  }

  function resetDraft() {
    const next: Draft = {
      type: "payment",
      title: "",
      memo: "",
      amount: "100",
      recipient: mintToSelf && address ? address : "",
      claimableAtMode: "instant",
      claimableAt: "",
    };
    setDraft(next);
    setTouched(false);
    persist(next);
  }

  return (
    <>
      <Head>
        <title>Mint Payment Check — Testnet</title>
      </Head>

      <div className="page">
        <div className="container">
          <div className="top">
            <Link className="brand" href="/testnet">
              ← Portfolio
            </Link>

            <div className="netPill">
              Testnet • Polygon Amoy (80002)
              {isConnected ? (
                supportedNetwork ? (
                  <span className="ok"> • Connected ✅</span>
                ) : (
                  <span className="bad"> • Wrong network ❌</span>
                )
              ) : (
                <span className="mutedInline"> • Wallet not connected</span>
              )}
            </div>
          </div>

          <h1 className="h1">Mint Check</h1>

          <div className="tabs">
            <span className="tab active">Payment</span>
            <span className="tab disabled" title="Coming soon">
              Vesting
            </span>
            <span className="tab disabled" title="Coming soon">
              Staking
            </span>
          </div>

          <div className="grid">
            <div className="panel">
              <h2 className="h2">Details</h2>

              <label className="field">
                <div className="label">Check Name</div>
                <input
                  className="input"
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  placeholder="Service payment"
                  onBlur={() => setTouched(true)}
                />
                <div className="hint">Max 32 bytes.</div>
              </label>

              <label className="field">
                <div className="label">Memo (Optional)</div>
                <textarea
                  className="textarea"
                  value={draft.memo}
                  onChange={(e) => setDraft({ ...draft, memo: e.target.value })}
                  placeholder="Optional memo..."
                  onBlur={() => setTouched(true)}
                />
                <div className="hint">Max 160 bytes.</div>
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
                    inputMode="decimal"
                    onBlur={() => setTouched(true)}
                  />
                </label>
              </div>

              <label className="field">
                <div className="label">Recipient</div>

                <div className="rowInline">
                  <input
                    className="checkbox"
                    type="checkbox"
                    checked={mintToSelf}
                    onChange={(e) => {
                      const v = e.target.checked;
                      setMintToSelf(v);
                      if (v && address) setDraft((d) => ({ ...d, recipient: address }));
                    }}
                  />
                  <span className="hintStrong">Mint to my address</span>
                  {mintToSelf && !address ? <span className="hint"> (connect wallet first)</span> : null}
                </div>

                <input
                  className="input"
                  value={draft.recipient}
                  onChange={(e) => setDraft({ ...draft, recipient: e.target.value })}
                  placeholder="0x..."
                  onBlur={() => setTouched(true)}
                />
              </label>

              <div className="field">
                <div className="label">Claim timing</div>
                <div className="radioRow">
                  <button
                    type="button"
                    className={`radio ${draft.claimableAtMode === "instant" ? "active" : ""}`}
                    onClick={() => setDraft({ ...draft, claimableAtMode: "instant", claimableAt: "" })}
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

                {draft.claimableAtMode === "postdated" ? (
                  <input
                    className="input"
                    type="datetime-local"
                    value={draft.claimableAt}
                    onChange={(e) => setDraft({ ...draft, claimableAt: e.target.value })}
                    onBlur={() => setTouched(true)}
                  />
                ) : null}
              </div>

              {touched && validationError ? <div className="error">{validationError}</div> : null}

              <div className="btnRow">
                <button className="btnGhost" type="button" onClick={resetDraft}>
                  Reset
                </button>
                <button
                  className="btnPrimary"
                  type="button"
                  onClick={saveAndGoPreview}
                  disabled={!canContinue}
                  aria-disabled={!canContinue}
                  title={!canContinue ? validationError ?? "Fix errors to continue" : "Continue to preview"}
                >
                  Continue to Preview →
                </button>
              </div>

              <div className="panelNote muted">
                Locked for MVP: Polygon Amoy (80002) + Mock USD (mUSD).
              </div>
            </div>

            <div className="panel">
              <h2 className="h2">Preview (Draft)</h2>

              <div className="previewCard">
                <div className="pcTop">
                  <div className="pcBadge">mUSD</div>
                  <div className="pcAmt">{draft.amount || "—"} mUSD</div>
                </div>

                <div className="pcTitle">Payment Check</div>

                <div className="pcLine">
                  <span className="pcKey">Check Name</span>
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
                        ? `Post-dated: ${draft.claimableAt}`
                        : "Post-dated"}
                  </span>
                </div>

                <div className="pcMemo">
                  <div className="pcKey">Memo</div>
                  <div className="pcVal">{draft.memo || "—"}</div>
                </div>

                <div className="pcFooter muted">Serial + QR are generated after minting (Preview step).</div>
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
.ok{color:#16a34a;font-weight:900;}
.bad{color:#dc2626;font-weight:900;}
.mutedInline{color:#64748b;font-weight:800;}
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
.hintStrong{color:#0f172a;font-size:12px;font-weight:900;}
.input,.textarea{width:100%;border:1px solid #e5e7eb;border-radius:12px;padding:10px 12px;font-size:14px;font-family:inherit;outline:none;}
.textarea{min-height:88px;resize:vertical;}
.input:focus,.textarea:focus{border-color:rgba(79,70,229,.55);box-shadow:0 0 0 4px rgba(79,70,229,.08);}
.row2{display:grid;grid-template-columns:1fr 1fr;gap:14px;}
.rowInline{display:flex;gap:10px;align-items:center;margin-bottom:8px;flex-wrap:wrap;}
.checkbox{width:16px;height:16px;}
.pillStatic{border:1px solid #e5e7eb;border-radius:12px;padding:10px 12px;font-size:14px;font-weight:800;background:#f8fafc;}
.radioRow{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px;}
.radio{border:1px solid #e5e7eb;border-radius:999px;padding:8px 12px;font-size:13px;font-weight:900;background:#fff;cursor:pointer;}
.radio.active{border-color:#4f46e5;color:#4f46e5;}
.error{border:1px solid rgba(220,38,38,.25);background:rgba(220,38,38,.06);color:#991b1b;border-radius:12px;padding:10px 12px;font-size:13px;font-weight:900;margin-top:6px;}
.btnRow{margin-top:10px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;justify-content:flex-end;}
.btnPrimary{border:1px solid #4f46e5;background:#4f46e5;color:#fff;border-radius:999px;padding:10px 14px;font-size:14px;font-weight:900;cursor:pointer;}
.btnPrimary:hover{opacity:.92;}
.btnPrimary[disabled]{opacity:.55;cursor:not-allowed;}
.btnGhost{border:1px solid #e5e7eb;background:#fff;color:#0f172a;border-radius:999px;padding:10px 14px;font-size:14px;font-weight:900;cursor:pointer;}
.btnGhost:hover{background:#f8fafc;}
.previewCard{border:1px dashed #e5e7eb;border-radius:16px;padding:14px;background:#fafafa;}
.pcTop{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;}
.pcBadge{border:1px solid #e5e7eb;border-radius:999px;padding:6px 10px;font-size:12px;font-weight:900;background:#fff;}
.pcAmt{font-size:14px;font-weight:900;}
.pcTitle{font-size:18px;font-weight:900;margin:6px 0 12px;}
.pcLine{display:flex;justify-content:space-between;gap:10px;margin-bottom:8px;}
.pcKey{color:#64748b;font-size:12px;font-weight:900;}
.pcVal{font-size:12px;font-weight:900;color:#0f172a;}
.mono{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace;}
.pcMemo{margin-top:10px;padding-top:10px;border-top:1px solid #e5e7eb;}
.pcFooter{margin-top:12px;}
.panelNote{margin-top:12px;}
.muted{color:#64748b;font-size:13px;}
.footer{margin-top:34px;display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;}
@media (max-width:1040px){.grid{grid-template-columns:1fr;gap:18px;}.h1{font-size:44px;}}
`;
