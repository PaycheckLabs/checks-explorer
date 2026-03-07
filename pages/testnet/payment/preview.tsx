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
import TxFlowOverlay, { type TxUiState } from "../../../components/TxFlowOverlay";

type Draft = {
  type: "payment" | "vesting" | "staking";
  title: string;
  memo: string; // <= 160 bytes
  amount: string; // human input
  recipient: string;
  claimableAtMode: "instant" | "postdated";
  claimableAt: string; // ISO from datetime-local
  serial?: string; // generated only at mint time
};

type Stage = "idle" | "connecting" | "switching" | "faucet" | "approve" | "mint" | "success" | "error";

const DRAFT_KEY = "checks_testnet_draft_v1";

// 0.05% = 5 bps (display estimate only for now)
const PLATFORM_FEE_BPS = 5n;
const BPS_DENOM = 10_000n;

const AMOY_SCAN_BASE = "https://amoy.polygonscan.com";

function scanTx(hash: string) {
  return `${AMOY_SCAN_BASE}/tx/${hash}`;
}

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
// Format: AAA-1234BB-CC12 (no I/O, no 0/1)
function generateSerial(): string {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // excludes I and O
  const digits = "23456789"; // excludes 0 and 1
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

  // Tx UI overlay state (matches your screenshots)
  const [txUi, setTxUi] = useState<TxUiState>({ kind: "none" });

  const [mintHash, setMintHash] = useState<`0x${string}` | null>(null);
  const [sentDateStr, setSentDateStr] = useState<string>("—");

  // wallet
  const { address, isConnected } = useAccount();
  const chainId = useChainId();

  // useConnect: we’ll use connectAsync when available for a clean one-button flow
  const connectHook = useConnect() as unknown as {
    connect: (args: any) => void;
    connectAsync?: (args: any) => Promise<any>;
    connectors: any[];
    isPending: boolean;
  };
  const { disconnect } = useDisconnect();
  const { switchChainAsync, isPending: isSwitching } = useSwitchChain();

  const { connect, connectAsync, connectors, isPending: isConnecting } = connectHook;

  // NOTE: Cast to keep TS strict + wagmi v3 happy in Vercel builds.
  const { writeContractAsync } = useWriteContract() as unknown as {
    writeContractAsync: (args: any) => Promise<`0x${string}`>;
  };

  const publicClient = usePublicClient({ chainId: AMOY_CHAIN_ID });
  const supported = isConnected && chainId === AMOY_CHAIN_ID;

  // Narrow constants to wagmi/viem-friendly types
  const MUSD = MUSD_ADDRESS as Address;
  const PCHK = PCHK_ADDRESS as Address; // canonical PaymentChecks address via alias
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

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      if (!raw) {
        setDraft(null);
        return;
      }
      const parsed = JSON.parse(raw) as Draft;

      // Ensure recipient is present
      if (!parsed.recipient) parsed.recipient = "";

      setDraft(parsed);
    } catch {
      setDraft(null);
    }
  }, []);

  // Sent date: show “today” in a stable readable format
  useEffect(() => {
    try {
      const d = new Date();
      const fmt = d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
      setSentDateStr(fmt);
    } catch {
      setSentDateStr("—");
    }
  }, []);

  const claimText = useMemo(() => {
    if (!draft) return "—";
    if (draft.claimableAtMode === "instant") return "Instant Claim";
    return draft.claimableAt ? `Post-Dated • ${draft.claimableAt}` : "Post-Dated";
  }, [draft]);

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

  const feeUnits = useMemo(() => {
    if (amountUnits <= 0n) return 0n;
    return (amountUnits * PLATFORM_FEE_BPS) / BPS_DENOM;
  }, [amountUnits]);

  const totalUnits = useMemo(() => {
    if (amountUnits <= 0n) return 0n;
    return amountUnits + feeUnits;
  }, [amountUnits, feeUnits]);

  const musdBal = (musdBalRes.data as bigint | undefined) ?? 0n;
  const allowance = (allowanceRes.data as bigint | undefined) ?? 0n;

  const musdText = useMemo(() => {
    try {
      return `${formatUnits(musdBal, decimals)} ${symbol}`;
    } catch {
      return `— ${symbol}`;
    }
  }, [musdBal, decimals, symbol]);

  const polText = useMemo(() => {
    if (!polBal.data) return "—";

    const polSymbol = polBal.data.symbol ?? "POL";

    try {
      const formatted = formatUnits(polBal.data.value, polBal.data.decimals);
      const numeric = Number(formatted);

      if (!Number.isFinite(numeric)) {
        return `— ${polSymbol}`;
      }

      return `${numeric.toFixed(4)} ${polSymbol}`;
    } catch {
      return `— ${polSymbol}`;
    }
  }, [polBal.data]);

  const claimableAtUnix = useMemo(() => {
    if (!draft) return 0n;
    if (draft.claimableAtMode === "instant") return 0n;
    if (!draft.claimableAt) return 0n;
    const ms = Date.parse(draft.claimableAt);
    if (Number.isNaN(ms)) return 0n;
    return BigInt(Math.floor(ms / 1000));
  }, [draft]);

  const canMint = Boolean(draft);

  const needsFaucet = musdBal < totalUnits;
  const needsApprove = allowance < totalUnits;

  async function ensureConnectedAndAmoy() {
    if (!isConnected) {
      setStage("connecting");
      setTxUi({ kind: "wallet" });

      const injected = connectors?.[0];
      if (connectAsync && injected) {
        await connectAsync({ connector: injected });
      } else if (injected) {
        connect({ connector: injected });
      }

      setTxUi({ kind: "none" });
      setStage("idle");
    }

    if (chainId !== AMOY_CHAIN_ID) {
      setStage("switching");
      setTxUi({ kind: "wallet" });
      await switchChainAsync({ chainId: AMOY_CHAIN_ID });
      setTxUi({ kind: "none" });
      setStage("idle");
    }
  }

  async function faucetIfNeeded() {
    if (!needsFaucet) return;

    setStage("faucet");
    setError(null);
    setTxUi({
      kind: "pending",
      title: "Transaction in Process",
      sub: "Requesting testnet mUSD from faucet…",
      hash: mintHash ?? undefined,
    });

    // MockUSD faucet(uint256)
    const faucetHash = await writeContractAsync({
      address: MUSD,
      abi: MUSD_ABI_T,
      functionName: "faucet",
      args: [totalUnits],
    });

    setMintHash(faucetHash);

    setTxUi({
      kind: "pending",
      title: "Transaction in Process",
      sub: "Faucet confirmed. Preparing approval…",
      hash: faucetHash,
    });

    // wait for tx
    await publicClient?.waitForTransactionReceipt({ hash: faucetHash });
  }

  async function approveIfNeeded() {
    if (!needsApprove) return;

    setStage("approve");
    setError(null);

    setTxUi({
      kind: "pending",
      title: "Transaction in Process",
      sub: "Approving mUSD spend for mint…",
      hash: mintHash ?? undefined,
    });

    const approveHash = await writeContractAsync({
      address: MUSD,
      abi: MUSD_ABI_T,
      functionName: "approve",
      args: [PCHK, MAX_UINT256],
    });

    setMintHash(approveHash);

    setTxUi({
      kind: "pending",
      title: "Transaction in Process",
      sub: "Approval sent. Preparing mint…",
      hash: approveHash,
    });

    await publicClient?.waitForTransactionReceipt({ hash: approveHash });
  }

  function closeTxUiIfAllowed() {
    // Don’t allow closing while tx pending / waiting for wallet
    if (txUi.kind === "pending") return;
    if (txUi.kind === "wallet") return;

    const wasFailed = txUi.kind === "failed";
    setTxUi({ kind: "none" });
    if (wasFailed) setStage("idle");
  }

  async function mintNow() {
    try {
      setError(null);

      await ensureConnectedAndAmoy();

      if (!draft) throw new Error("No draft found. Return to mint page.");

      // Ensure serial exists (generate only at mint time)
      if (!draft.serial) {
        draft.serial = generateSerial();
        sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
        setDraft({ ...draft });
      }

      // basic validation
      if (!draft.recipient || !draft.recipient.startsWith("0x") || draft.recipient.length < 10) {
        throw new Error("Recipient address is required.");
      }
      if (amountUnits <= 0n) throw new Error("Enter a valid amount.");
      if (!draft.title) throw new Error("Check title is required.");

      // Faucet + Approve if necessary
      await faucetIfNeeded();
      await approveIfNeeded();

      setStage("mint");
      setTxUi({
        kind: "pending",
        title: "Transaction in Process",
        sub: "Minting your Payment Check…",
        hash: mintHash ?? undefined,
      });

      const serial32 = bytes32FromString(draft.serial);
      const title32 = bytes32FromString(draft.title);

      const mintTxHash = await writeContractAsync({
        address: PCHK,
        abi: PCHK_ABI_T,
        functionName: "mintPaymentCheck",
        args: [draft.recipient as Address, amountUnits, claimableAtUnix, serial32, title32, draft.memo || ""],
      });

      setMintHash(mintTxHash);

      await publicClient?.waitForTransactionReceipt({ hash: mintTxHash });

      setStage("success");
      setTxUi({
        kind: "success",
        title: "Check is Minted Successfully",
        sub: "Your check has been minted on the blockchain.",
        hash: mintTxHash,
        serial: draft.serial,
      });
    } catch (e: any) {
      const msg = e?.shortMessage || e?.message || "Transaction failed.";
      setStage("error");
      setError(msg);

      setTxUi({
        kind: "failed",
        title: "Mint Failed",
        sub: msg,
        hash: mintHash ?? undefined,
        serial: draft?.serial,
      });
    }
  }

  function viewTx() {
    const h = txUi.hash || mintHash;
    if (!h) return;
    window.open(scanTx(h), "_blank", "noopener,noreferrer");
  }

  function viewCheck() {
    if (!txUi.serial) return;
    window.location.href = `/testnet/${txUi.serial}`;
  }

  const amountText = useMemo(() => {
    if (!draft) return "—";
    return draft.amount ? `${draft.amount} ${symbol}` : `— ${symbol}`;
  }, [draft, symbol]);

  const feeText = useMemo(() => {
    try {
      return `${formatUnits(feeUnits, decimals)} ${symbol}`;
    } catch {
      return `— ${symbol}`;
    }
  }, [feeUnits, decimals, symbol]);

  const gasText = useMemo(() => {
    // Simple placeholder for now; later: estimateGas + gas price
    return `0.002 POL`;
  }, []);

  return (
    <>
      <Head>
        <title>Preview Payment Check — Testnet</title>
      </Head>

      <div className="page">
        <div className="topbar">
          <div className="left">
            <Link href="/testnet/payment/mint" className="back">
              ← Go back
            </Link>
            <div className="h1">Preview NFT Check</div>
            <div className="sub">
              View and approve of your NFT Check settings and collateral. QR code and serial will be generated once
              minted.
            </div>
          </div>

          <div className="right">
            <button className="mintNow" onClick={mintNow} disabled={!canMint || stage !== "idle"}>
              Mint Now ⚡
            </button>
          </div>
        </div>

        <div className="layout">
          <div className="main">
            <div className="canvas">
              <div className="card">
                <div className="ccTop">
                  <div className="ccToken">
                    <div className="ccIcon">M</div>
                    <div className="ccTokenName">{symbol === "mUSD" ? "Mock USD" : symbol}</div>
                  </div>
                  <div className="ccAmt">{draft ? `${draft.amount || "—"} ${symbol}` : `— ${symbol}`}</div>
                </div>

                <div className="ccTitle">Testnet Payment Check</div>
                <div className="ccChain">
                  Minted on <span className="chainDot">⟠</span> Polygon Amoy
                </div>

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
                    <div className="k">Reciever</div>
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

                <div className="toolsRow">
                  <div className="toolsKey">Allowance</div>
                  <div className="toolsVal mono">{allowance ? allowance.toString() : "0"}</div>
                </div>

                <div className="note">
                  Mint Now will automatically: connect → switch to Amoy → faucet (if needed) → approve (if needed) →
                  mint.
                </div>
              </div>
            </div>
          </div>

          <div className="side">
            <div className="panel">
              <div className="panelTitle">Overview</div>

              <div className="kv">
                <div className="muted">Collateral Amount</div>
                <div className="mono">{amountText}</div>
              </div>

              <div className="kv">
                <div className="muted">Platform Fee (0.05%)</div>
                <div className="mono">{feeText}</div>
              </div>

              <div className="kv">
                <div className="muted">Estimated Gas Fee</div>
                <div className="mono">{gasText}</div>
              </div>

              <div className="kv">
                <div className="muted">Estimated Time</div>
                <div className="mono">&gt;30 seconds</div>
              </div>

              <div className="divider" />

              <div className="panelTitle">Category</div>
              <div className="kv">
                <div className="muted">Payment</div>
                <div className="mono">{claimText}</div>
              </div>

              <div className="sideActions">
                <Link className="sideLink" href="/testnet/payment/mint">
                  Edit Mint Details
                </Link>
                <button
                  className="sideLink"
                  onClick={() => {
                    disconnect();
                  }}
                  type="button"
                >
                  Disconnect Wallet
                </button>
              </div>
            </div>

            <div className="footer">
              <div className="muted">Testnet • Polygon Amoy</div>
              <a className="sideLink" href="https://explorer.checks.xyz" target="_blank" rel="noreferrer">
                Explorer ↗
              </a>
            </div>
          </div>

          <TxFlowOverlay
            ui={txUi}
            scanBase={AMOY_SCAN_BASE}
            onViewTx={viewTx}
            onViewCheck={viewCheck}
            onClose={closeTxUiIfAllowed}
          />
        </div>

        <style jsx>{`
          .page {
            min-height: 100vh;
            background: radial-gradient(1200px 600px at 20% 0%, rgba(255, 255, 255, 0.08), transparent 60%),
              radial-gradient(900px 500px at 90% 20%, rgba(255, 255, 255, 0.06), transparent 55%), #0b0f14;
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
          .h1 {
            font-size: 34px;
            font-weight: 900;
            letter-spacing: -0.02em;
          }
          .sub {
            max-width: 780px;
            color: rgba(229, 231, 235, 0.72);
            font-weight: 700;
            line-height: 1.35;
          }

          .right {
            display: flex;
            align-items: center;
            gap: 12px;
          }

          .mintNow {
            background: linear-gradient(180deg, rgba(56, 189, 248, 0.95), rgba(14, 165, 233, 0.9));
            border: 1px solid rgba(56, 189, 248, 0.55);
            color: #001018;
            font-weight: 900;
            border-radius: 12px;
            padding: 12px 14px;
            cursor: pointer;
          }
          .mintNow:disabled {
            opacity: 0.55;
            cursor: not-allowed;
          }

          .layout {
            display: grid;
            grid-template-columns: minmax(0, 1fr) 360px;
            gap: 18px;
          }

          .main {
            min-width: 0;
          }
          .canvas {
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 18px;
            background: rgba(255, 255, 255, 0.03);
            padding: 18px;
          }

          .card {
            margin: 0 auto;
            width: min(760px, 100%);
            border-radius: 16px;
            border: 1px solid rgba(255, 255, 255, 0.08);
            background: linear-gradient(180deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.02));
            padding: 18px 18px 16px;
          }

          .ccTop {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 12px;
            margin-bottom: 14px;
          }

          .ccToken {
            display: flex;
            align-items: center;
            gap: 10px;
          }
          .ccIcon {
            width: 38px;
            height: 38px;
            border-radius: 999px;
            background: rgba(59, 130, 246, 0.2);
            border: 1px solid rgba(147, 197, 253, 0.35);
            display: grid;
            place-items: center;
            font-weight: 900;
          }
          .ccTokenName {
            font-weight: 900;
            letter-spacing: -0.01em;
          }
          .ccAmt {
            font-weight: 900;
            font-size: 20px;
          }

          .ccTitle {
            font-size: 28px;
            font-weight: 900;
            letter-spacing: -0.02em;
            margin-bottom: 6px;
          }
          .ccChain {
            color: rgba(229, 231, 235, 0.75);
            font-weight: 800;
            margin-bottom: 14px;
          }
          .chainDot {
            opacity: 0.9;
            margin: 0 6px 0 2px;
          }

          .ccGrid {
            display: grid;
            gap: 10px;
            padding-top: 10px;
            border-top: 1px solid rgba(255, 255, 255, 0.07);
          }
          .row {
            display: grid;
            grid-template-columns: 160px 1fr;
            gap: 12px;
          }
          .k {
            color: rgba(229, 231, 235, 0.62);
            font-weight: 800;
          }
          .v {
            font-weight: 900;
          }
          .mono {
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New",
              monospace;
          }

          .ccFooter {
            margin-top: 14px;
            padding-top: 12px;
            border-top: 1px solid rgba(255, 255, 255, 0.07);
            color: rgba(229, 231, 235, 0.7);
            font-weight: 800;
          }
          .logo {
            font-weight: 900;
            color: #e5e7eb;
          }

          .tools {
            margin-top: 16px;
            border-radius: 16px;
            border: 1px solid rgba(255, 255, 255, 0.08);
            background: rgba(0, 0, 0, 0.18);
            padding: 14px;
          }
          .toolsTitle {
            font-weight: 900;
            margin-bottom: 10px;
          }
          .toolsRow {
            display: flex;
            justify-content: space-between;
            gap: 12px;
            padding: 8px 0;
            border-top: 1px solid rgba(255, 255, 255, 0.06);
          }
          .toolsRow:first-of-type {
            border-top: none;
          }
          .toolsKey {
            color: rgba(229, 231, 235, 0.7);
            font-weight: 800;
          }
          .toolsVal {
            font-weight: 900;
          }

          .error {
            margin-top: 14px;
            width: min(680px, 100%);
            border-radius: 12px;
            padding: 10px 12px;
            border: 1px solid rgba(239, 68, 68, 0.28);
            background: rgba(239, 68, 68, 0.1);
            color: #fecaca;
            font-weight: 900;
          }

          .side {
            position: sticky;
            top: 18px;
          }
          .panel {
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 18px;
            background: rgba(255, 255, 255, 0.03);
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
            border-top: 1px solid rgba(255, 255, 255, 0.06);
          }
          .kv:first-of-type {
            border-top: none;
          }
          .divider {
            height: 1px;
            background: rgba(255, 255, 255, 0.08);
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
            background: transparent;
            border: none;
            padding: 0;
            cursor: pointer;
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
            border-top: 1px solid rgba(255, 255, 255, 0.06);
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
      </div>
    </>
  );
}
