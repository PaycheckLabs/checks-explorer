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
  amount: string; // human input
  recipient: string;
  claimableAtMode: "instant" | "postdated";
  claimableAt: string; // ISO from datetime-local
  serial?: string; // generated only at mint time
};

type Stage = "idle" | "faucet" | "approve" | "mint" | "success" | "error";

const DRAFT_KEY = "checks_testnet_draft_v1";

// 0.05% = 5 bps
const PLATFORM_FEE_BPS = 5n;
const BPS_DENOM = 10_000n;

function shortAddr(a?: string) {
  if (!a) return "—";
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function bytes32FromString(s: string): Hex {
  return stringToHex(s, { size: 32 });
}

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

export default function PaymentPreview() {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [mintHash, setMintHash] = useState<`0x${string}` | null>(null);
  const [sentDateStr, setSentDateStr] = useState<string>("—");

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

  // Narrow constants to wagmi/viem-friendly types
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

  // Load draft (no serial generation on load)
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

  // Client-only sent date (avoid SSR mismatch)
  useEffect(() => {
    const d = new Date();
    const s = d.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });
    setSentDateStr(s);
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

  const platformFeeUnits = useMemo(() => {
    if (amountUnits <= 0n) return 0n;
    return (amountUnits * PLATFORM_FEE_BPS) / BPS_DENOM;
  }, [amountUnits]);

  // NOTE (important): UI displays fee now; on-chain fee transfer is a later brick in the checks repo.
  // For now, mint still uses `amountUnits` as the escrowed collateral amount.
  const musdBal = (musdBalRes.data as bigint | undefined) ?? 0n;
  const allowance = (allowanceRes.data as bigint | undefined) ?? 0n;

  const hasEnough = amountUnits > 0n && musdBal >= amountUnits;
  const hasAllowance = amountUnits > 0n && allowance >= amountUnits;

  const claimText = useMemo(() => {
    if (!draft) return "—";
    if (draft.claimableAtMode === "instant") return "Instant Claim";
    return draft.claimableAt ? `Post-dated` : "Post-dated";
  }, [draft]);

  const claimDetail = useMemo(() => {
    if (!draft) return "—";
    if (draft.claimableAtMode === "instant") return "Instant Claim";
    return draft.claimableAt ? draft.claimableAt : "—";
  }, [draft]);

  function validateDraftNoSerial(): string | null {
    if (!draft) return "No draft found. Go back to the mint page.";
    if (!draft.title.trim()) return "Check name is required.";
    if (!draft.recipient.trim()) return "Recipient is required.";
    if (amountUnits <= 0n) return "Enter a valid collateral amount.";

    const memoBytes = new TextEncoder().encode(draft.memo || "");
    if (memoBytes.length > 160) return "Memo is too long (max 160 bytes).";

    const titleBytes = new TextEncoder().encode(draft.title.trim());
    if (titleBytes.length > 32) return "Check name is too long (max 32 bytes).";

    if (draft.claimableAtMode === "postdated") {
      if (!draft.claimableAt) return "Select a start date for post-dated checks.";
      const t = new Date(draft.claimableAt).getTime();
      if (!Number.isFinite(t)) return "Start date is invalid.";
    }

    return null;
  }

  function ensureSerial(): string {
    const current = draft?.serial?.trim();
    const serial = current && current.length > 0 ? current : generateSerial();

    const serialBytes = new TextEncoder().encode(serial);
    if (serialBytes.length > 32) throw new Error("Generated serial is too long (max 32 bytes).");

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
    if (!isConnected) return setError("Connect your wallet first.");
    const ok = await ensureAmoy();
    if (!ok) return;
    if (!publicClient) return setError("Public client not ready.");

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
    if (!isConnected) return setError("Connect your wallet first.");
    const ok = await ensureAmoy();
    if (!ok) return;
    if (!publicClient) return setError("Public client not ready.");

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

  async function mintNow() {
    setError(null);

    const v = validateDraftNoSerial();
    if (v) return setError(v);

    if (!isConnected) return setError("Connect your wallet first.");
    const ok = await ensureAmoy();
    if (!ok) return;
    if (!publicClient) return setError("Public client not ready.");

    if (!hasEnough) return setError(`Not enough ${symbol}. Use “Get test ${symbol}” first.`);
    if (!hasAllowance) return setError(`Approval needed. Click “Approve ${symbol}” first.`);

    let serial: string;
    try {
      serial = ensureSerial();
    } catch (e: any) {
      return setError(e?.message || "Failed to generate serial.");
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

  const feeText = useMemo(() => {
    if (platformFeeUnits <= 0n) return `0 ${symbol}`;
    return `${formatUnits(platformFeeUnits, decimals)} ${symbol}`;
  }, [platformFeeUnits, decimals, symbol]);

  const connectConnector = connectors?.find((c) => c.id === "injected") ?? connectors?.[0];
  const busy = stage === "faucet" || stage === "approve" || stage === "mint";

  return (
    <>
      <Head>
        <title>Preview NFT Check — Testnet</title>
      </Head>

      <div className="page">
        <div className="topbar">
          <div className="left">
            <Link className="back" href="/testnet/payment/mint">
              ← Go back
            </Link>
            <div className="titleWrap">
              <div className="h1">Preview NFT Check</div>
              <div className="sub">
                View and approve your NFT Check settings and collateral. QR code and serial will be generated once
                minted.
              </div>
            </div>
          </div>

          <div className="right">
            <button className="btnPrimary" onClick={mintNow} disabled={!supported || busy || !draft}>
              {stage === "mint" ? "Minting…" : "Mint Now ⚡"}
            </button>
          </div>
        </div>

        <div className="layout">
          {/* Left: Preview canvas */}
          <div className="canvas">
            <div className="canvasInner">
              {/* Check card (pre-mint, no QR/serial) */}
              <div className="checkCard">
                <div className="ccTop">
                  <div className="token">
                    <div className="tokenIcon">M</div>
                    <div className="tokenName">Mock USD</div>
                  </div>
                  <div className="amt">
                    <div className="amtVal">{draft?.amount || "—"}&nbsp;{symbol}</div>
                  </div>
                </div>

                <div className="ccTitle">Testnet Payment Check</div>
                <div className="ccChain">Minted on <span className="chainDot">⟠</span> Polygon Amoy</div>

                <div className="ccGrid">
                  <div className="row">
                    <div className="k">Type</div>
                    <div className="v">Payment</div>
                  </div>
                  <div className="row">
                    <div className="k">Sent Date</div>
                    <div className="v">{sentDateStr}</div>
                  </div>
                  <div className="row">
                    <div className="k">Sender</div>
                    <div className="v mono">{shortAddr(address)}</div>
                  </div>
                  <div className="row">
                    <div className="k">Receiver</div>
                    <div className="v mono">{draft ? shortAddr(draft.recipient) : "—"}</div>
                  </div>
                  <div className="row">
                    <div className="k">Conditions</div>
                    <div className="v">{claimText}</div>
                  </div>
                </div>

                <div className="ccFooter">
                  Powered by <span className="logo">Checks</span>
                </div>
              </div>

              {error ? <div className="error">{error}</div> : null}

              {/* Utility controls (keep for now; later we’ll fold into Mint Now smart flow) */}
              <div className="tools">
                <div className="toolsTitle">Wallet & Testnet Tools</div>

                <div className="toolsRow">
                  <div className="toolsKey">Account</div>
                  <div className="toolsVal">{isConnected ? shortAddr(address) : "Not connected"}</div>
                </div>

                <div className="toolsRow">
                  <div className="toolsKey">Network</div>
                  <div className="toolsVal">
                    {isConnected ? (chainId === AMOY_CHAIN_ID ? "Polygon Amoy ✅" : `Wrong network ❌`) : "—"}
                  </div>
                </div>

                <div className="toolsRow">
                  <div className="toolsKey">POL</div>
                  <div className="toolsVal">{polText}</div>
                </div>

                <div className="toolsRow">
                  <div className="toolsKey">{symbol}</div>
                  <div className="toolsVal">{musdText}</div>
                </div>

                <div className="btnRow">
                  {!isConnected ? (
                    <button
                      className="btnGhost"
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
                      className="btnGhost"
                      onClick={() => switchChainAsync({ chainId: AMOY_CHAIN_ID })}
                      disabled={isSwitching || busy}
                    >
                      {isSwitching ? "Switching…" : "Switch to Amoy"}
                    </button>
                  ) : null}

                  <button className="btnGhost" onClick={getTestMusd} disabled={!supported || busy}>
                    {stage === "faucet" ? `Getting ${symbol}…` : `Get test ${symbol}`}
                  </button>

                  <button className="btnGhost" onClick={approveMusd} disabled={!supported || busy}>
                    {stage === "approve" ? "Approving…" : `Approve ${symbol}`}
                  </button>
                </div>

                {mintHash ? <div className="hash mono">Mint tx: {mintHash}</div> : null}
              </div>
            </div>
          </div>

          {/* Right: Overview */}
          <div className="side">
            <div className="panel">
              <div className="panelTitle">Overview</div>

              <div className="kv">
                <div className="k">Collateral Amount</div>
                <div className="v">{draft?.amount || "—"} {symbol}</div>
              </div>

              <div className="kv">
                <div className="k">Platform Fee (0.05%)</div>
                <div className="v">{feeText}</div>
              </div>

              <div className="kv">
                <div className="k">Estimated Gas Fee</div>
                <div className="v">0.002 POL</div>
              </div>

              <div className="kv">
                <div className="k">Estimated Time</div>
                <div className="v">&gt;30 seconds</div>
              </div>

              <div className="divider" />

              <div className="kv">
                <div className="k">Category</div>
                <div className="v">Payment</div>
              </div>

              <div className="kv">
                <div className="k">Conditions</div>
                <div className="v">{claimText}</div>
              </div>

              {draft?.claimableAtMode === "postdated" ? (
                <div className="kv">
                  <div className="k">Start Date</div>
                  <div className="v">{claimDetail}</div>
                </div>
              ) : null}

              <div className="note">
                Platform fee is charged in {symbol}. On testnet it will be sent to the Checks Dev Wallet (configured in
                the contract). Serial + QR are generated after mint.
              </div>

              <div className="sideActions">
                <button className="btnPrimary" onClick={mintNow} disabled={!supported || busy || !draft}>
                  {stage === "mint" ? "Minting…" : "Mint Now ⚡"}
                </button>
                <Link className="sideLink" href="/testnet/payment/mint">
                  Edit details
                </Link>
              </div>
            </div>
          </div>
        </div>

        <footer className="footer">
          <div className="muted">Powered by Checks</div>
          <div className="muted">Tip: QR + Serial appear after minting.</div>
        </footer>
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

        .topbar {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 18px;
          flex-wrap: wrap;
          margin-bottom: 18px;
        }
        .left {
          display: flex;
          flex-direction: column;
          gap: 10px;
          min-width: 280px;
        }
        .back {
          color: #9ca3af;
          text-decoration: none;
          font-weight: 700;
        }
        .back:hover {
          color: #e5e7eb;
        }
        .titleWrap {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .h1 {
          font-size: 34px;
          font-weight: 900;
          letter-spacing: -0.02em;
        }
        .sub {
          color: #9ca3af;
          font-size: 14px;
          max-width: 760px;
          line-height: 1.35;
        }

        .layout {
          display: grid;
          grid-template-columns: 1fr 360px;
          gap: 18px;
          align-items: start;
        }

        .canvas {
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 18px;
          background: rgba(255,255,255,0.03);
          padding: 18px;
          min-height: 520px;
        }

        .canvasInner {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 14px;
          padding: 6px 0 2px;
        }

        .checkCard {
          width: min(680px, 100%);
          border-radius: 14px;
          padding: 18px 18px 14px;
          background:
            radial-gradient(900px 420px at 15% 10%, rgba(255,255,255,0.12), transparent 60%),
            radial-gradient(900px 420px at 85% 60%, rgba(255,255,255,0.10), transparent 55%),
            rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.10);
          box-shadow: 0 18px 60px rgba(0,0,0,0.55);
        }

        .ccTop {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
        }

        .token {
          display: flex;
          align-items: center;
          gap: 10px;
          font-weight: 900;
        }
        .tokenIcon {
          width: 38px;
          height: 38px;
          border-radius: 999px;
          display: grid;
          place-items: center;
          font-weight: 900;
          background: rgba(59,130,246,0.35);
          border: 1px solid rgba(59,130,246,0.55);
        }
        .tokenName {
          font-size: 18px;
          color: #e5e7eb;
        }

        .amtVal {
          font-size: 26px;
          font-weight: 900;
          color: #e5e7eb;
        }

        .ccTitle {
          margin-top: 16px;
          font-size: 30px;
          font-weight: 900;
          letter-spacing: -0.02em;
        }

        .ccChain {
          margin-top: 8px;
          color: #cbd5e1;
          font-weight: 800;
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 16px;
        }
        .chainDot {
          opacity: 0.85;
        }

        .ccGrid {
          margin-top: 22px;
          display: grid;
          gap: 12px;
          padding-top: 16px;
          border-top: 1px solid rgba(255,255,255,0.08);
        }
        .row {
          display: flex;
          justify-content: space-between;
          gap: 14px;
          align-items: center;
        }
        .k {
          color: #9ca3af;
          font-weight: 800;
          font-size: 14px;
        }
        .v {
          font-weight: 900;
          font-size: 16px;
          color: #e5e7eb;
          text-align: right;
        }
        .mono {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New",
            monospace;
        }

        .ccFooter {
          margin-top: 18px;
          padding-top: 14px;
          border-top: 1px solid rgba(255,255,255,0.08);
          color: #cbd5e1;
          font-weight: 800;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .logo {
          font-weight: 900;
          color: #e5e7eb;
        }

        .tools {
          width: min(680px, 100%);
          border-radius: 14px;
          border: 1px solid rgba(255,255,255,0.08);
          background: rgba(0,0,0,0.25);
          padding: 14px;
        }
        .toolsTitle {
          font-weight: 900;
          margin-bottom: 10px;
          color: #e5e7eb;
        }
        .toolsRow {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          padding: 8px 0;
          border-top: 1px solid rgba(255,255,255,0.06);
        }
        .toolsRow:first-of-type {
          border-top: none;
        }
        .toolsKey {
          color: #9ca3af;
          font-weight: 800;
          font-size: 13px;
        }
        .toolsVal {
          color: #e5e7eb;
          font-weight: 900;
          font-size: 13px;
          text-align: right;
        }

        .btnRow {
          margin-top: 12px;
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          justify-content: flex-end;
        }

        .btnPrimary {
          background: linear-gradient(180deg, rgba(56,189,248,0.95), rgba(14,165,233,0.90));
          border: 1px solid rgba(56,189,248,0.55);
          color: #001018;
          font-weight: 900;
          border-radius: 12px;
          padding: 12px 16px;
          cursor: pointer;
          min-width: 140px;
        }
        .btnPrimary[disabled] {
          opacity: 0.55;
          cursor: not-allowed;
        }

        .btnGhost {
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.10);
          color: #e5e7eb;
          font-weight: 900;
          border-radius: 12px;
          padding: 10px 12px;
          cursor: pointer;
        }
        .btnGhost[disabled] {
          opacity: 0.55;
          cursor: not-allowed;
        }

        .hash {
          margin-top: 10px;
          color: #9ca3af;
          font-size: 12px;
        }

        .error {
          width: min(680px, 100%);
          border-radius: 12px;
          padding: 10px 12px;
          border: 1px solid rgba(239,68,68,0.28);
          background: rgba(239,68,68,0.10);
          color: #fecaca;
          font-weight: 900;
        }

        .side {
          position: sticky;
          top: 18px;
        }
        .panel {
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 18px;
          background: rgba(255,255,255,0.03);
          padding: 16px;
        }
        .panelTitle {
          font-weight: 900;
          font-size: 16px;
          margin-bottom: 12px;
        }
        .kv {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          padding: 10px 0;
          border-top: 1px solid rgba(255,255,255,0.06);
        }
        .kv:first-of-type {
          border-top: none;
        }
        .divider {
          height: 1px;
          background: rgba(255,255,255,0.08);
          margin: 12px 0;
        }
        .note {
          margin-top: 12px;
          color: #9ca3af;
          font-size: 13px;
          line-height: 1.35;
        }
        .sideActions {
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin-top: 14px;
        }
        .sideLink {
          color: #9ca3af;
          text-decoration: none;
          font-weight: 800;
          text-align: center;
        }
        .sideLink:hover {
          color: #e5e7eb;
        }

        .footer {
          margin-top: 18px;
          display: flex;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
          padding-top: 14px;
          border-top: 1px solid rgba(255,255,255,0.06);
        }
        .muted {
          color: #9ca3af;
          font-weight: 800;
          font-size: 13px;
        }

        @media (max-width: 980px) {
          .layout {
            grid-template-columns: 1fr;
          }
          .side {
            position: static;
          }
          .btnPrimary {
            width: 100%;
          }
        }
      `}</style>
    </>
  );
}
