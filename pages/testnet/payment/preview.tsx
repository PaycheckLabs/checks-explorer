import Head from "next/head";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { formatUnits, parseUnits, stringToHex, type Abi, type Address, type Hex } from "viem";
import {
  useAccount,
  useBalance,
  useChainId,
  useConnect,
  useDisconnect,
  usePublicClient,
  useReadContract,
  useSwitchChain,
  useWriteContract,
} from "wagmi";
import {
  AMOY_CHAIN_ID,
  MAX_UINT256,
  MUSD_ABI,
  MUSD_ADDRESS,
  PCHK_ABI,
  PCHK_ADDRESS,
} from "../../../lib/testnetContracts";

type Draft = {
  type: "payment" | "vesting" | "staking";
  title: string;
  memo: string;
  amount: string;
  recipient: string;
  claimableAtMode: "instant" | "postdated";
  claimableAt: string; // ISO from datetime-local
  serial?: string; // generated only at mint time now
};

type Stage = "idle" | "faucet" | "approve" | "mint" | "success" | "error";

const DRAFT_KEY = "checks_testnet_draft_v1";

function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function randChar(set: string) {
  return set[randInt(0, set.length - 1)];
}
// Format: AAA-1234BB-CC12 (no I/O to reduce confusion)
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

function bytes32FromString(s: string): Hex {
  return stringToHex(s, { size: 32 });
}

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

  // NOTE: Cast to keep TS strict + wagmi v3 happy in Vercel builds.
  const { writeContractAsync } = useWriteContract() as unknown as {
    writeContractAsync: (args: any) => Promise<`0x${string}`>;
  };

  const publicClient = usePublicClient({ chainId: AMOY_CHAIN_ID });
  const supported = isConnected && chainId === AMOY_CHAIN_ID;

  // Narrow the constants to wagmi/viem-friendly types
  const MUSD = MUSD_ADDRESS as Address;
  const PCHK = PCHK_ADDRESS as Address;
  const MUSD_ABI_T = MUSD_ABI as unknown as Abi;
  const PCHK_ABI_T = PCHK_ABI as unknown as Abi;

  // token meta
  const decimalsRes = useReadContract({
    address: MUSD,
    abi: MUSD_ABI_T,
    functionName: "decimals",
  });
  const symbolRes = useReadContract({
    address: MUSD,
    abi: MUSD_ABI_T,
    functionName: "symbol",
  });
  const decimals = Number(decimalsRes.data ?? 6);
  const symbol = (symbolRes.data as string | undefined) ?? "mUSD";

  // balances + allowance
  const musdBalRes = useReadContract({
    address: MUSD,
    abi: MUSD_ABI_T,
    functionName: "balanceOf",
    args: address ? [address as Address] : undefined,
    query: { enabled: Boolean(address) },
  });

  const allowanceRes = useReadContract({
    address: MUSD,
    abi: MUSD_ABI_T,
    functionName: "allowance",
    args: address ? [address as Address, PCHK] : undefined,
    query: { enabled: Boolean(address) },
  });

  const polBal = useBalance({
    address: address as Address | undefined,
    chainId: AMOY_CHAIN_ID,
    query: { enabled: Boolean(address) },
  });

  // Load draft (do NOT generate serial on load)
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      if (!raw) {
        setDraft(null);
        return;
      }
      const parsed = JSON.parse(raw) as Draft;
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

  function validateDraftNoSerial(): string | null {
    if (!draft) return "No draft found. Go back to the mint page.";
    if (!draft.title.trim()) return "Title is required.";
    if (!draft.recipient.trim()) return "Recipient is required.";
    if (amountUnits <= 0n) return "Enter a valid amount.";

    const memoBytes = new TextEncoder().encode(draft.memo || "");
    if (memoBytes.length > 160) return "Memo is too long (max 160 bytes).";

    const titleBytes = new TextEncoder().encode(draft.title.trim());
    if (titleBytes.length > 32) return "Title is too long (max 32 bytes).";

    if (draft.claimableAtMode === "postdated") {
      if (!draft.claimableAt) return "Choose a post-dated time.";
      const t = new Date(draft.claimableAt).getTime();
      if (!Number.isFinite(t)) return "Post-dated time is invalid.";
    }

    return null;
  }

  function ensureSerial(): string {
    // Generate serial only when user is minting.
    // Persist it so retries keep the same serial.
    const current = draft?.serial?.trim();
    const serial = current && current.length > 0 ? current : generateSerial();

    const serialBytes = new TextEncoder().encode(serial);
    if (serialBytes.length > 32) {
      // ultra unlikely with our generator, but keep safe
      throw new Error("Generated serial is too long (max 32 bytes).");
    }

    if (draft && draft.serial !== serial) {
      const next: Draft = { ...draft, serial };
      setDraft(next);
      try {
        sessionStorage.setItem(DRAFT_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
    }

    return serial;
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
      // Faucet enough to cover 10x requested amount (min 1,000 mUSD)
      const desired = amountUnits > 0n ? amountUnits * 10n : parseUnits("1000", decimals);
      const hash = await writeContractAsync({
        address: MUSD,
        abi: MUSD_ABI_T,
        functionName: "faucet",
        args: [desired],
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
        address: MUSD,
        abi: MUSD_ABI_T,
        functionName: "approve",
        args: [PCHK, MAX_UINT256],
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

    const v = validateDraftNoSerial();
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
      setError(`Not enough ${symbol}. Use “Get test ${symbol}” first.`);
      return;
    }

    if (!hasAllowance) {
      setError(`Approval needed. Click “Approve ${symbol}” first.`);
      return;
    }

    let serial: string;
    try {
      serial = ensureSerial();
    } catch (e: any) {
      setError(e?.message || "Failed to generate serial.");
      return;
    }

    try {
      setStage("mint");

      const serialB32 = bytes32FromString(serial);
      const titleB32 = bytes32FromString(draft!.title.trim());
      const claimableAt =
        draft!.claimableAtMode === "instant"
          ? 0
          : Math.floor(new Date(draft!.claimableAt).getTime() / 1000);

      const hash = await writeContractAsync({
        address: PCHK,
        abi: PCHK_ABI_T,
        functionName: "mintPaymentCheck",
        args: [
          draft!.recipient.trim() as Address,
          amountUnits,
          BigInt(claimableAt),
          serialB32,
          titleB32,
          draft!.memo || "",
        ],
      });

      setMintHash(hash);
      await publicClient.waitForTransactionReceipt({ hash });
      setStage("success");

      // Redirect to explorer by serial (serial is generated at mint time)
      window.location.href = `https://explorer.checks.xyz/testnet/${serial}`;
    } catch (e: any) {
      setStage("error");
      setError(e?.shortMessage || e?.message || "Mint failed.");
    }
  }

  const polText = useMemo(() => {
    if (!polBal.data) return "—";
    try {
      return `${formatUnits(polBal.data.value, polBal.data.decimals)} ${polBal.data.symbol}`;
    } catch {
      return `${polBal.data.symbol}`;
    }
  }, [polBal.data]);

  const musdText = useMemo(() => {
    if (!musdBalRes.data) return "—";
    return `${formatUnits(musdBal, decimals)} ${symbol}`;
  }, [musdBalRes.data, musdBal, decimals, symbol]);

  const connectConnector = connectors?.find((c) => c.id === "injected") ?? connectors?.[0];

  const busy = stage === "faucet" || stage === "approve" || stage === "mint";

  return (
    <>
      <Head>
        <title>Preview Payment Check — Testnet</title>
      </Head>

      <div className="page">
        <div className="container">
          <div className="top">
            <Link className="brand" href="/testnet/payment/mint">
              ← Back to Mint
            </Link>
            <div className="netPill">Testnet • Polygon Amoy (80002)</div>
          </div>

          <h1 className="h1">Preview</h1>

          <div className="panel">
            <h2 className="h2">Wallet</h2>

            <div className="row">
              <div className="k">Account</div>
              <div className="v">{!isConnected ? "Not connected" : shortAddr(address)}</div>
            </div>

            <div className="row">
              <div className="k">Network</div>
              <div className="v">
                {isConnected
                  ? chainId === AMOY_CHAIN_ID
                    ? "Polygon Amoy ✅"
                    : `Unsupported ❌ (chainId ${chainId})`
                  : "—"}
              </div>
            </div>

            <div className="btnRow">
              {!isConnected ? (
                <button
                  className="btnPrimary"
                  onClick={() => connectConnector && connect({ connector: connectConnector })}
                  disabled={!connectConnector || isConnecting}
                >
                  {isConnecting ? "Connecting…" : "Connect Wallet"}
                </button>
              ) : (
                <button className="btnGhost" onClick={() => disconnect()} disabled={busy}>
                  Disconnect
                </button>
              )}

              {isConnected && chainId !== AMOY_CHAIN_ID ? (
                <button
                  className="btnPrimary"
                  onClick={() => switchChainAsync({ chainId: AMOY_CHAIN_ID })}
                  disabled={isSwitching || busy}
                >
                  {isSwitching ? "Switching…" : "Switch to Amoy"}
                </button>
              ) : null}
            </div>

            <h3 className="h3">Balances (Amoy)</h3>
            <div className="row">
              <div className="k">POL</div>
              <div className="v">{polText}</div>
            </div>
            <div className="row">
              <div className="k">{symbol}</div>
              <div className="v">{musdText}</div>
            </div>

            <div className="note">
              Need POL?{" "}
              <a href="https://faucet.polygon.technology/" target="_blank" rel="noreferrer">
                Get test POL
              </a>
            </div>
          </div>

          <div className="panel" style={{ marginTop: 16 }}>
            <h2 className="h2">Payment Check</h2>

            {!draft ? (
              <div className="note">
                No draft found. Return to the mint page to enter check details.{" "}
                <Link href="/testnet/payment/mint">Go to Mint</Link>
              </div>
            ) : (
              <>
                <div className="row">
                  <div className="k">Serial</div>
                  <div className="v muted">(generated after mint)</div>
                </div>
                <div className="row">
                  <div className="k">Title</div>
                  <div className="v">{draft.title || "—"}</div>
                </div>
                <div className="row">
                  <div className="k">Recipient</div>
                  <div className="v mono">{draft.recipient || "—"}</div>
                </div>
                <div className="row">
                  <div className="k">Amount</div>
                  <div className="v">
                    {draft.amount || "—"} {symbol}
                  </div>
                </div>
                <div className="row">
                  <div className="k">Claim</div>
                  <div className="v">{claimText}</div>
                </div>
                <div className="row">
                  <div className="k">Memo</div>
                  <div className="v">{draft.memo || "—"}</div>
                </div>

                <div className="note">
                  Serial is stored on-chain at mint. QR can be derived from the explorer URL after mint.
                </div>

                {error ? <div className="error">{error}</div> : null}

                <div className="btnRow">
                  <button className="btnGhost" onClick={() => history.back()} disabled={busy}>
                    Back
                  </button>

                  <button className="btnGhost" onClick={getTestMusd} disabled={!supported || busy}>
                    {stage === "faucet" ? `Getting ${symbol}…` : `Get test ${symbol}`}
                  </button>

                  <button className="btnGhost" onClick={approveMusd} disabled={!supported || busy}>
                    {stage === "approve" ? "Approving…" : `Approve ${symbol}`}
                  </button>

                  <button className="btnPrimary" onClick={mintOnTestnet} disabled={!supported || busy}>
                    {stage === "mint" ? "Minting…" : "Mint on Testnet"}
                  </button>
                </div>

                {mintHash ? <div className="note mono">Mint tx: {mintHash}</div> : null}
              </>
            )}
          </div>

          <footer className="footer">
            <div className="muted">Powered by Checks</div>
            <div className="muted">Tip: This is an early preview step. Serial + QR appear after mint.</div>
          </footer>
        </div>
      </div>

      <style jsx>{styles}</style>
    </>
  );
}

const styles = `
.page{font-family:Kanit,ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;background:#fff;color:#0f172a;min-height:100vh;}
.container{max-width:920px;margin:0 auto;padding:28px 18px 40px;}
.top{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:14px;}
.brand{color:#4f46e5;text-decoration:none;font-weight:800;}
.brand:hover{text-decoration:underline;}
.netPill{border:1px solid #e5e7eb;border-radius:999px;padding:8px 12px;font-size:13px;font-weight:800;color:#0f172a;background:#fff;}
.h1{font-size:46px;line-height:1.05;margin:10px 0 14px;font-weight:900;letter-spacing:-0.02em;}
.panel{border:1px solid #e5e7eb;border-radius:18px;padding:16px;background:#fff;}
.h2{font-size:24px;margin:0 0 10px;font-weight:900;}
.h3{font-size:16px;margin:14px 0 8px;font-weight:900;color:#0f172a;}
.row{display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-top:1px solid #f1f5f9;}
.row:first-of-type{border-top:none;}
.k{color:#64748b;font-size:12px;font-weight:900;}
.v{font-size:13px;font-weight:900;color:#0f172a;text-align:right;}
.muted{color:#64748b;font-weight:800;}
.mono{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace;}
.note{margin-top:10px;color:#64748b;font-size:13px;}
.note a{color:#4f46e5;font-weight:900;text-decoration:none;}
.note a:hover{text-decoration:underline;}
.btnRow{margin-top:12px;display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end;}
.btnPrimary{border:1px solid #4f46e5;background:#4f46e5;color:#fff;border-radius:999px;padding:10px 14px;font-size:14px;font-weight:900;cursor:pointer;}
.btnPrimary:hover{opacity:.92;}
.btnPrimary[disabled]{opacity:.55;cursor:not-allowed;}
.btnGhost{border:1px solid #e5e7eb;background:#fff;color:#0f172a;border-radius:999px;padding:10px 14px;font-size:14px;font-weight:900;cursor:pointer;}
.btnGhost:hover{background:#f8fafc;}
.btnGhost[disabled]{opacity:.55;cursor:not-allowed;}
.error{margin-top:10px;border:1px solid rgba(220,38,38,.25);background:rgba(220,38,38,.06);color:#991b1b;border-radius:12px;padding:10px 12px;font-size:13px;font-weight:900;}
.footer{margin-top:26px;display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;}
@media (max-width:820px){.h1{font-size:40px;}.v{text-align:left;}}
`;
