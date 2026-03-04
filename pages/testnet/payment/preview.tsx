import Head from "next/head";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { parseUnits, stringToHex, type Hex } from "viem";
import {
  useAccount,
  useBalance,
  useChainId,
  useConnect,
  useDisconnect,
  usePublicClient,
  useReadContract,
  useSwitchChain,
  useWriteContract
} from "wagmi";
import {
  AMOY_CHAIN_ID,
  MAX_UINT256,
  MUSD_ABI,
  MUSD_ADDRESS,
  PCHK_ABI,
  PCHK_ADDRESS
} from "../../../lib/testnetContracts";

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
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "0123456789";
  const a = `${randChar(letters)}${randChar(letters)}${randChar(letters)}`;
  const b = `${randChar(digits)}${randChar(digits)}${randChar(digits)}${randChar(digits)}`;
  const c = `${randChar(letters)}${randChar(letters)}`;
  const d = `${randChar(letters)}${randChar(letters)}${randChar(digits)}${randChar(digits)}`;
  return `${a}-${b}${c}-${d}`;
}

function shortAddr(a?: string) {
  if (!a) return "";
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

type Stage = "idle" | "faucet" | "approve" | "mint" | "success" | "error";

export default function PaymentPreview() {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [mintHash, setMintHash] = useState<`0x${string}` | null>(null);

  // wallet
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { connect, connectors, isPending: isConnecting } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChainAsync, isPending: isSwitching } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient({ chainId: AMOY_CHAIN_ID });

  const supported = isConnected && chainId === AMOY_CHAIN_ID;

  // token meta
  const decimalsRes = useReadContract({
    address: MUSD_ADDRESS,
    abi: MUSD_ABI,
    functionName: "decimals"
  });

  const symbolRes = useReadContract({
    address: MUSD_ADDRESS,
    abi: MUSD_ABI,
    functionName: "symbol"
  });

  const decimals = Number(decimalsRes.data ?? 6);
  const symbol = (symbolRes.data as string | undefined) ?? "mUSD";

  // balances + allowance
  const musdBalRes = useReadContract({
    address: MUSD_ADDRESS,
    abi: MUSD_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address) }
  });

  const allowanceRes = useReadContract({
    address: MUSD_ADDRESS,
    abi: MUSD_ABI,
    functionName: "allowance",
    args: address ? [address, PCHK_ADDRESS] : undefined,
    query: { enabled: Boolean(address) }
  });

  const polBal = useBalance({
    address,
    chainId: AMOY_CHAIN_ID,
    query: { enabled: Boolean(address) }
  });

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

  const amountUnits = useMemo(() => {
    if (!draft) return 0n;
    const amt = (draft.amount || "").trim();
    if (!amt) return 0n;
    try {
      return parseUnits(amt, decimals);
    } catch {
      return 0n;
    }
  }, [draft, decimals]);

  const musdBal = (musdBalRes.data as bigint | undefined) ?? 0n;
  const allowance = (allowanceRes.data as bigint | undefined) ?? 0n;

  const hasEnough = amountUnits > 0n && musdBal >= amountUnits;
  const hasAllowance = amountUnits > 0n && allowance >= amountUnits;

  const claimText = useMemo(() => {
    if (!draft) return "—";
    if (draft.claimableAtMode === "instant") return "Instant Claim";
    return draft.claimableAt ? `Post-dated: ${draft.claimableAt}` : "Post-dated";
  }, [draft]);

  function goBack() {
    window.location.href = "/testnet/payment/mint";
  }

  function bytes32FromString(s: string): Hex {
    return stringToHex(s, { size: 32 });
  }

  function validateDraft(): string | null {
    if (!draft) return "No draft found. Go back to the mint page.";
    if (!draft.title.trim()) return "Title is required.";
    if (!draft.recipient.trim()) return "Recipient is required.";
    if (amountUnits <= 0n) return "Enter a valid amount.";
    // memo <= 160 bytes
    const memoBytes = new TextEncoder().encode(draft.memo || "");
    if (memoBytes.length > 160) return "Memo is too long (max 160 bytes).";
    // title <= 32 bytes (safe)
    const titleBytes = new TextEncoder().encode(draft.title.trim());
    if (titleBytes.length > 32) return "Title is too long (max 32 bytes).";
    // serial <= 32 bytes (safe)
    const serialBytes = new TextEncoder().encode(draft.serial || "");
    if (serialBytes.length > 32) return "Serial is too long (max 32 bytes).";
    if (draft.claimableAtMode === "postdated" && !draft.claimableAt) return "Choose a post-dated time.";
    return null;
  }

  async function ensureAmoy(): Promise<boolean> {
    if (!isConnected) return false;
    if (chainId === AMOY_CHAIN_ID) return true;
    try {
      await switchChainAsync({ chainId: AMOY_CHAIN_ID });
      return true;
    } catch (e: any) {
      setError(e?.message || "Failed to switch to Polygon Amoy.");
      return false;
    }
  }

  async function getTestMusd() {
    setError(null);
    if (!isConnected) {
      setError("Connect your wallet first.");
      return;
    }
    const ok = await ensureAmoy();
    if (!ok) return;

    if (!publicClient) {
      setError("Public client not ready.");
      return;
    }

    try {
      setStage("faucet");
      // faucet enough to cover 10x the requested amount (min 1,000 mUSD)
      const desired = amountUnits > 0n ? amountUnits * 10n : parseUnits("1000", decimals);
      const hash = await writeContractAsync({
        address: MUSD_ADDRESS,
        abi: MUSD_ABI,
        functionName: "faucet",
        args: [desired]
      });
      await publicClient.waitForTransactionReceipt({ hash });
      setStage("idle");
    } catch (e: any) {
      setStage("error");
      setError(e?.shortMessage || e?.message || "mUSD faucet failed.");
    }
  }

  async function approveMusd() {
    setError(null);
    if (!isConnected) {
      setError("Connect your wallet first.");
      return;
    }
    const ok = await ensureAmoy();
    if (!ok) return;

    if (!publicClient) {
      setError("Public client not ready.");
      return;
    }

    try {
      setStage("approve");
      const hash = await writeContractAsync({
        address: MUSD_ADDRESS,
        abi: MUSD_ABI,
        functionName: "approve",
        args: [PCHK_ADDRESS, MAX_UINT256]
      });
      await publicClient.waitForTransactionReceipt({ hash });
      setStage("idle");
    } catch (e: any) {
      setStage("error");
      setError(e?.shortMessage || e?.message || "Approve failed.");
    }
  }

  async function mintOnTestnet() {
    setError(null);
    const v = validateDraft();
    if (v) {
      setError(v);
      return;
    }
    if (!isConnected) {
      setError("Connect your wallet first.");
      return;
    }
    const ok = await ensureAmoy();
    if (!ok) return;

    if (!publicClient) {
      setError("Public client not ready.");
      return;
    }

    if (!hasEnough) {
      setError(`Not enough ${symbol}. Use “Get test mUSD” first.`);
      return;
    }
    if (!hasAllowance) {
      setError(`Approval needed. Click “Approve ${symbol}” first.`);
      return;
    }

    try {
      setStage("mint");
      const serialB32 = bytes32FromString(draft!.serial!);
      const titleB32 = bytes32FromString(draft!.title.trim());

      const claimableAt =
        draft!.claimableAtMode === "instant"
          ? 0
          : Math.floor(new Date(draft!.claimableAt).getTime() / 1000);

      const hash = await writeContractAsync({
        address: PCHK_ADDRESS,
        abi: PCHK_ABI,
        functionName: "mintPaymentCheck",
        args: [
          draft!.recipient.trim(),
          amountUnits,
          BigInt(claimableAt),
          serialB32,
          titleB32,
          draft!.memo || ""
        ]
      });

      setMintHash(hash);
      await publicClient.waitForTransactionReceipt({ hash });

      setStage("success");
      // redirect to explorer by serial
      window.location.href = `https://explorer.checks.xyz/testnet/${draft!.serial}`;
    } catch (e: any) {
      setStage("error");
      setError(e?.shortMessage || e?.message || "Mint failed.");
    }
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

          <div className="panel">
            <div className="row">
              <div>
                <div className="label">Wallet</div>
                {!isConnected ? (
                  <div className="muted">Not connected</div>
                ) : (
                  <div className="mono">{shortAddr(address)}</div>
                )}
              </div>

              {!isConnected ? (
                <button
                  className="btnPrimary"
                  type="button"
                  disabled={isConnecting || connectors.length === 0}
                  onClick={() => connect({ connector: connectors[0] })}
                >
                  {isConnecting ? "Connecting…" : "Connect Wallet"}
                </button>
              ) : (
                <button className="btnGhost" type="button" onClick={() => disconnect()}>
                  Disconnect
                </button>
              )}
            </div>

            {isConnected ? (
              <div className="row">
                <div>
                  <div className="label">Network</div>
                  <div className={supported ? "good" : "bad"}>
                    {chainId === AMOY_CHAIN_ID
                      ? "Polygon Amoy ✅"
                      : `Unsupported ❌ (chainId ${chainId})`}
                  </div>
                </div>
                {!supported ? (
                  <button className="btnGhost" type="button" disabled={isSwitching} onClick={() => switchChainAsync({ chainId: AMOY_CHAIN_ID })}>
                    {isSwitching ? "Switching…" : "Switch to Amoy"}
                  </button>
                ) : null}
              </div>
            ) : null}

            <div className="row">
              <div>
                <div className="label">Balances (Amoy)</div>
                <div className="muted">POL: <b>{polBal.data ? `${Number(polBal.data.formatted).toFixed(4)} ${polBal.data.symbol}` : "—"}</b></div>
                <div className="muted">{symbol}: <b>{musdBalRes.data ? String(musdBal / 10n ** BigInt(decimals)) : "—"}</b> (raw)</div>
              </div>
              <a className="btnGhostLink" href="https://faucet.polygon.technology/" target="_blank" rel="noreferrer">
                Get test POL
              </a>
            </div>
          </div>

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
                    <div className="pcBadge">{symbol}</div>
                    <div className="pcAmt">{draft.amount || "—"} {symbol}</div>
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

                  <div className="pcFooter muted">
                    Serial is stored on-chain at mint. QR can be derived from the explorer URL after mint.
                  </div>
                </div>

                {error ? <div className="warn">{error}</div> : null}

                <div className="btnRow">
                  <button className="btnGhost" type="button" onClick={goBack}>
                    Back
                  </button>

                  <button
                    className="btnGhost"
                    type="button"
                    onClick={getTestMusd}
                    disabled={!isConnected || !supported || stage === "faucet" || stage === "mint" || stage === "approve"}
                  >
                    {stage === "faucet" ? "Getting mUSD…" : `Get test ${symbol}`}
                  </button>

                  <button
                    className="btnGhost"
                    type="button"
                    onClick={approveMusd}
                    disabled={!isConnected || !supported || stage === "approve" || stage === "mint" || stage === "faucet"}
                  >
                    {stage === "approve" ? "Approving…" : `Approve ${symbol}`}
                  </button>

                  <button
                    className="btnPrimary"
                    type="button"
                    onClick={mintOnTestnet}
                    disabled={!isConnected || !supported || stage === "mint" || !hasEnough || !hasAllowance}
                  >
                    {stage === "mint" ? "Minting…" : "Mint on Testnet"}
                  </button>
                </div>

                {mintHash ? (
                  <div className="muted note">
                    Mint tx:{" "}
                    <a href={`https://amoy.polygonscan.com/tx/${mintHash}`} target="_blank" rel="noreferrer">
                      {mintHash}
                    </a>
                  </div>
                ) : null}
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
                    <div className="sVal">{symbol}</div>
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
                  After mint, you will be redirected to:
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
.brand{color:#4f46e5;text-decoration:none;font-weight:900;}
.brand:hover{text-decoration:underline;}
.netPill{border:1px solid #e5e7eb;border-radius:999px;padding:8px 12px;font-size:13px;font-weight:800;color:#0f172a;}
.h1{font-size:52px;line-height:1.02;margin:10px 0 10px;font-weight:900;letter-spacing:-0.02em;}
.grid{display:grid;grid-template-columns:1.12fr 1fr;gap:22px;align-items:start;}
.panel{border:1px solid #e5e7eb;border-radius:18px;padding:18px;background:#fff;margin-bottom:16px;}
.h2{font-size:28px;margin:0 0 14px;font-weight:900;letter-spacing:-0.01em;}
.label{font-size:14px;font-weight:900;margin-bottom:6px;color:#0f172a;}
.muted{color:#64748b;font-size:13px;}
.note{margin-top:14px;line-height:1.35;}
.row{display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap;margin-top:10px;}
.btnRow{margin-top:12px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;}
.btnPrimary{border:1px solid #4f46e5;background:#4f46e5;color:#fff;border-radius:999px;padding:10px 14px;font-size:14px;font-weight:900;cursor:pointer;}
.btnPrimary:disabled{opacity:.45;cursor:not-allowed;}
.btnGhost, .btnGhostLink{border:1px solid #e5e7eb;background:#fff;color:#0f172a;border-radius:999px;padding:10px 14px;font-size:14px;font-weight:900;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;}
.btnGhost:hover,.btnGhostLink:hover{background:#f8fafc;}
.warn{border:1px solid rgba(220,38,38,.25);background:rgba(220,38,38,.06);padding:10px 12px;border-radius:12px;font-size:13px;font-weight:900;margin-top:12px;}
.good{color:#16a34a;font-weight:900;}
.bad{color:#dc2626;font-weight:900;}
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
