import type { GetServerSideProps } from "next";
import Head from "next/head";
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import {
  createPublicClient,
  fallback,
  formatUnits,
  hexToString,
  http,
  parseAbiItem,
  stringToHex,
  type Hex,
} from "viem";
import { polygonAmoy } from "viem/chains";

import serials from "../../data/testnet-serials.json";
import { isValidSerialFormat, normalizeSerial } from "../../lib/serial";

type SerialRecord = {
  chainId: number;
  network: string;
  contract: string;
  tokenId: number;
  memo?: string;
  mintTx?: string;
  transferTx?: string;
  redeemTx?: string;
  voidTx?: string;
  claimableAt?: number;
  title?: string;
  typeLabel?: string;
  statusLabel?: string;
  initialCollateral?: string;
  remainingCollateral?: string;
  collateralSymbol?: string;
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
    const origin = `${ctx.req.headers["x-forwarded-proto"] || "https"}://${ctx.req.headers.host}`;
    return {
      redirect: {
        destination: `${origin}/testnet/${normalized}`,
        permanent: true,
      },
    };
  }

  const record = (serials as any)[normalized] as SerialRecord | undefined;
  const origin = `${ctx.req.headers["x-forwarded-proto"] || "https"}://${ctx.req.headers.host}`;

  return {
    props: {
      serial: normalized,
      record: record ?? null,
      origin,
    },
  };
};

const AMOY_NAME = "Polygon Amoy";
const AMOY_SCAN_BASE = "https://amoy.polygonscan.com";

const AMOY_RPC_PRIMARY = "https://polygon-amoy-bor-rpc.publicnode.com/";
const AMOY_RPC_FALLBACK = "https://rpc-amoy.polygon.technology/";

type DeploymentConfig = {
  label: string;
  contract: string;
  token: string;
  fromBlock: bigint;
};

type StatusTone = "success" | "info" | "warning" | "danger" | "muted";

const DEPLOYMENTS: DeploymentConfig[] = [
  {
    label: "Payment Checks",
    contract: "0x9ED92dd2626E372DB3FD71Fe300f76d90aF2d589",
    token: "0x0D085A1EBb74f050cE3A8ed18E3f998F04A23268",
    fromBlock: 34840100n,
  },
  {
    label: "Payment Checks (Legacy)",
    contract: "0x4dC6db5f06DAF4716b749EAb8d8efa27BcEE1218",
    token: "0xa01C7368672b61AdE32FAEf6aeD5aeC1845dedb5",
    fromBlock: 34655184n,
  },
];

const amoyClient = createPublicClient({
  chain: polygonAmoy,
  transport: fallback([
    http(AMOY_RPC_PRIMARY, { timeout: 15_000, retryCount: 2, retryDelay: 500 }),
    http(AMOY_RPC_FALLBACK, { timeout: 15_000, retryCount: 1, retryDelay: 500 }),
  ]),
});

async function readContractCompat(args: any) {
  return amoyClient.readContract(args as any) as any;
}

function scanAddr(addr: string) {
  return `${AMOY_SCAN_BASE}/address/${addr}`;
}

function scanTx(hash: string) {
  return `${AMOY_SCAN_BASE}/tx/${hash}`;
}

function bytes32ToTrimmedAscii(hex: Hex): string {
  try {
    const s = hexToString(hex, { size: 32 });
    return s.replace(/\u0000/g, "").trim();
  } catch {
    return "";
  }
}

function serialToBytes32(serial: string): Hex {
  return stringToHex(serial, { size: 32 });
}

function shortAddress(value?: string) {
  if (!value) return "Not available";
  if (value.length < 12) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function formatDateTime(ts?: number | bigint) {
  const n = typeof ts === "bigint" ? Number(ts) : ts;
  if (!n) return "Not available";
  return new Date(n * 1000).toLocaleString();
}

function getStatusMeta(label?: string): { label: string; tone: StatusTone } {
  const normalized = (label || "").toLowerCase();

  if (normalized === "active") return { label: "Active", tone: "success" };
  if (normalized === "issued") return { label: "Issued", tone: "info" };
  if (normalized === "scheduled") return { label: "Scheduled", tone: "warning" };
  if (normalized === "settled") return { label: "Settled", tone: "info" };
  if (normalized === "canceled") return { label: "Canceled", tone: "danger" };
  if (normalized === "redeemed") return { label: "Redeemed", tone: "info" };
  if (normalized === "void") return { label: "Void", tone: "danger" };

  return { label: label || "Unknown", tone: "muted" };
}

function deriveCuratedStatus(record: SerialRecord) {
  if (record.statusLabel) return getStatusMeta(record.statusLabel);
  if (record.voidTx) return getStatusMeta("Canceled");
  if (record.redeemTx) return getStatusMeta("Settled");
  if (record.claimableAt && record.claimableAt > Math.floor(Date.now() / 1000)) return getStatusMeta("Scheduled");
  return getStatusMeta("Active");
}

const PCHK_ABI = [
  {
    type: "function",
    name: "tokenIdForSerial",
    stateMutability: "view",
    inputs: [{ name: "serial", type: "bytes32" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "getPaymentCheck",
    stateMutability: "view",
    inputs: [{ name: "checkId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "issuer", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "createdAt", type: "uint64" },
          { name: "claimableAt", type: "uint64" },
          { name: "serial", type: "bytes32" },
          { name: "title", type: "bytes32" },
          { name: "memo", type: "string" },
          { name: "status", type: "uint8" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "ownerOf",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "accountOf",
    stateMutability: "view",
    inputs: [{ name: "checkId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

const ERC20_ABI = [
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

type OnchainViewModel = {
  deploymentLabel: string;
  contract: string;
  token: string;
  tokenId: bigint;
  issuer: string;
  holder: string;
  tba: string;
  amount: bigint;
  decimals: number;
  symbol: string;
  claimableAt: bigint;
  title: string;
  memo: string;
  status: number;
  mintTx: string | null;
  redeemTx: string | null;
  voidTx: string | null;
  tbaBalance: bigint;
};

async function resolveDeploymentAndTokenId(
  serialB32: Hex
): Promise<{
  deployment: DeploymentConfig;
  tokenId: bigint;
} | null> {
  for (const d of DEPLOYMENTS) {
    const tokenId = (await readContractCompat({
      address: d.contract,
      abi: PCHK_ABI,
      functionName: "tokenIdForSerial",
      args: [serialB32],
    })) as bigint;

    if (tokenId && tokenId !== 0n) return { deployment: d, tokenId };
  }
  return null;
}

function ExplorerTopbar() {
  return (
    <div className="topbar">
      <Link href="/testnet" className="brandLink">
        <div className="brandMarkWrap">
          <div className="brandMark">C</div>
        </div>
        <div className="brandText">Checks Explorer</div>
      </Link>

      <div className="topbarRight">
        <span className="topbarTag">Testnet</span>
      </div>
    </div>
  );
}

function StatusPill({
  label,
  tone,
}: {
  label: string;
  tone: StatusTone;
}) {
  return <span className={`pill ${tone}`}>{label}</span>;
}

function RouteHeader({
  serial,
  title,
  metaLine,
  onCopyLink,
  copyLabel,
  statusLabel,
  statusTone,
  exploreHref,
}: {
  serial: string;
  title: string;
  metaLine: string;
  onCopyLink?: () => void;
  copyLabel?: string;
  statusLabel: string;
  statusTone: StatusTone;
  exploreHref?: string;
}) {
  return (
    <div className="routeHeader">
      <div className="routeHeaderTop">
        <Link className="back" href="/testnet">
          ← Go back
        </Link>
      </div>

      <div className="routeHeaderRow">
        <div className="routeHeaderCopy">
          <h1 className="title">{serial}</h1>
          <div className="checkName">{title}</div>
          <div className="metaLine">{metaLine}</div>
        </div>

        <div className="routeHeaderActions">
          {exploreHref ? (
            <a className="headerBtn" href={exploreHref} target="_blank" rel="noreferrer">
              View on Polygonscan
            </a>
          ) : null}

          {onCopyLink ? (
            <button className="headerBtn subtleHeaderBtn" onClick={onCopyLink} type="button">
              {copyLabel || "Copy Link"}
            </button>
          ) : null}

          <StatusPill label={statusLabel} tone={statusTone} />
        </div>
      </div>
    </div>
  );
}

function DataCell({
  label,
  value,
  mono = false,
  full = false,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
  full?: boolean;
}) {
  return (
    <div className={`dataCell ${full ? "full" : ""}`}>
      <div className="dataLabel">{label}</div>
      <div className={`dataValue ${mono ? "mono" : ""}`}>{value}</div>
    </div>
  );
}

function TxRow({
  label,
  hash,
}: {
  label: string;
  hash: string;
}) {
  return (
    <div className="txRow">
      <div className="txLabel">{label}</div>
      <a className="hashLink mono" href={scanTx(hash)} target="_blank" rel="noreferrer">
        {hash}
      </a>
    </div>
  );
}

function CheckPreview({
  serial,
  allowFallback = false,
}: {
  serial: string;
  allowFallback?: boolean;
}) {
  return (
    <div className="previewSurface">
      <div className="previewLabel">Check Preview</div>

      <div className="checkFrame">
        <div className="checkBox">
          <img
            src={`/checks/testnet/${serial}.png`}
            alt={`Check ${serial}`}
            className="checkImg"
            draggable={false}
            onError={
              allowFallback
                ? (e) => {
                    const t = e.currentTarget;
                    if (t && !t.src.includes("/checks/blank.png")) t.src = "/checks/blank.png";
                  }
                : undefined
            }
          />

          <div className="qrOuter">
            <img
              src={`/qr/testnet/${serial}.png`}
              alt={`QR for ${serial}`}
              className="qrImg"
              draggable={false}
              onError={
                allowFallback
                  ? (e) => {
                      const t = e.currentTarget;
                      if (t && !t.src.includes("/qr/blank.png")) t.src = "/qr/blank.png";
                    }
                  : undefined
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TestnetSerialPage(props: PageProps) {
  const { serial, record, origin } = props;
  const isValid = useMemo(() => isValidSerialFormat(serial), [serial]);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  async function copyToClipboard(textToCopy: string, key: string) {
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1200);
    } catch {
      // ignore
    }
  }

  if (!isValid) {
    return (
      <>
        <Head>
          <title>Invalid Serial - Checks Explorer</title>
        </Head>

        <div className="page">
          <div className="shell">
            <ExplorerTopbar />

            <RouteHeader
              serial="Invalid Serial"
              title="Checks Explorer"
              metaLine="This serial does not match the expected Checks format."
              statusLabel="Review"
              statusTone="warning"
            />

            <div className="panel">
              <div className="sectionTitle">Serial Review</div>
              <div className="dataGrid single">
                <DataCell label="Serial" value={serial} mono />
                <DataCell
                  label="Notes"
                  value="Please verify the URL or QR source and try again."
                  full
                />
              </div>
            </div>
          </div>
        </div>

        <style jsx>{styles}</style>
      </>
    );
  }

  if (record) {
    const curatedStatus = deriveCuratedStatus(record);
    const checkTitle = record.title || "Testnet Payment Check";
    const typeLabel = record.typeLabel || "Payment";
    const conditions = record.claimableAt ? formatDateTime(record.claimableAt) : "Instant Claim";
    const networkLabel = record.network || AMOY_NAME;

    return (
      <>
        <Head>
          <title>{serial} - Checks Explorer (Testnet)</title>
        </Head>

        <div className="page">
          <div className="shell">
            <ExplorerTopbar />

            <RouteHeader
              serial={serial}
              title={checkTitle}
              metaLine={`${networkLabel} • Mock USD • ${record.claimableAt ? "Scheduled" : "Instant Claim"}`}
              exploreHref={scanAddr(record.contract)}
              onCopyLink={() => copyToClipboard(`${origin}/testnet/${serial}`, "share")}
              copyLabel={copiedKey === "share" ? "Copied Link" : "Copy Link"}
              statusLabel={curatedStatus.label}
              statusTone={curatedStatus.tone}
            />

            <div className="panel heroPanel">
              <div className="heroGrid">
                <div className="heroLeft">
                  <div className="sectionTitle">Check Data</div>

                  <div className="dataGrid">
                    <DataCell
                      label="Status"
                      value={<StatusPill label={curatedStatus.label} tone={curatedStatus.tone} />}
                    />
                    <DataCell label="Type" value={typeLabel} />
                    <DataCell label="Conditions" value={record.claimableAt ? conditions : "Instant Claim"} />
                    <DataCell label="Network" value={networkLabel} />
                    <DataCell label="Initial Collateral" value={record.initialCollateral || "Not yet tracked"} />
                    <DataCell
                      label="Remaining Collateral"
                      value={record.remainingCollateral || "Not yet tracked"}
                    />
                    <DataCell label="Serial" value={serial} mono />
                    <DataCell label="Token ID" value={String(record.tokenId)} />
                    <DataCell label="Contract" value={record.contract} mono full />
                    <DataCell
                      label="Memo"
                      value={
                        record.memo || "No memo has been added for this tracked check yet."
                      }
                      full
                    />
                  </div>
                </div>

                <div className="heroRight">
                  <CheckPreview serial={serial} />
                </div>
              </div>
            </div>

            <div className="lowerGrid">
              <div className="panel">
                <div className="sectionTitle">Transactions</div>
                <div className="txStack">
                  {record.mintTx ? <TxRow label="Mint" hash={record.mintTx} /> : null}
                  {record.transferTx ? <TxRow label="Transfer" hash={record.transferTx} /> : null}
                  {record.redeemTx ? <TxRow label="Redeem" hash={record.redeemTx} /> : null}
                  {record.voidTx ? <TxRow label="Void" hash={record.voidTx} /> : null}
                  {!record.mintTx && !record.transferTx && !record.redeemTx && !record.voidTx ? (
                    <div className="emptyState">No transaction references have been added for this tracked check yet.</div>
                  ) : null}
                </div>
              </div>

              <div className="panel">
                <div className="sectionTitle">Share</div>
                <div className="dataGrid single">
                  <DataCell label="URL" value={`${origin}/testnet/${serial}`} mono full />
                </div>
              </div>

              <div className="panel">
                <div className="sectionTitle">Notes</div>
                <div className="noteBox">
                  This explorer page is still under active development. Temporary layout issues or QR placement inconsistencies may appear while the design system is being refined.
                </div>
              </div>
            </div>
          </div>
        </div>

        <style jsx>{styles}</style>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>{serial} - Checks Explorer (Testnet)</title>
      </Head>
      <OnchainSerialView serial={serial} origin={origin} />
      <style jsx>{styles}</style>
    </>
  );
}

function OnchainSerialView({ serial, origin }: { serial: string; origin: string }) {
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [vm, setVm] = useState<OnchainViewModel | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    async function run() {
      setLoading(true);
      setNotFound(false);
      setError(null);
      setVm(null);

      try {
        const serialB32 = serialToBytes32(serial);
        const resolved = await resolveDeploymentAndTokenId(serialB32);

        if (!alive) return;

        if (!resolved) {
          setNotFound(true);
          setLoading(false);
          return;
        }

        const { deployment, tokenId } = resolved;

        const pc = (await readContractCompat({
          address: deployment.contract,
          abi: PCHK_ABI,
          functionName: "getPaymentCheck",
          args: [tokenId],
        })) as any;

        const tba = (await readContractCompat({
          address: deployment.contract,
          abi: PCHK_ABI,
          functionName: "accountOf",
          args: [tokenId],
        })) as string;

        const holder = (await readContractCompat({
          address: deployment.contract,
          abi: PCHK_ABI,
          functionName: "ownerOf",
          args: [tokenId],
        })) as string;

        const decimals = Number(
          (await readContractCompat({
            address: deployment.token,
            abi: ERC20_ABI,
            functionName: "decimals",
          })) as number
        );

        const symbol = String(
          (await readContractCompat({
            address: deployment.token,
            abi: ERC20_ABI,
            functionName: "symbol",
          })) as string
        );

        const tbaBalance = (await readContractCompat({
          address: deployment.token,
          abi: ERC20_ABI,
          functionName: "balanceOf",
          args: [tba],
        })) as bigint;

        let mintTx: string | null = null;
        let redeemTx: string | null = null;
        let voidTx: string | null = null;

        try {
          const mintedEvent = parseAbiItem(
            "event PaymentCheckMinted(uint256 indexed checkId, bytes32 indexed serial, address indexed issuer, address initialHolder, address token, uint256 amount, uint64 claimableAt, address account)"
          );
          const redeemedEvent = parseAbiItem(
            "event PaymentCheckRedeemed(uint256 indexed checkId, address indexed redeemer, address token, uint256 amount, address account)"
          );
          const voidedEvent = parseAbiItem(
            "event PaymentCheckVoided(uint256 indexed checkId, address indexed issuer, address token, uint256 amount, address account)"
          );

          const [mints, redeems, voids] = await Promise.all([
            amoyClient.getLogs({
              address: deployment.contract as any,
              event: mintedEvent,
              args: { checkId: tokenId },
              fromBlock: deployment.fromBlock,
              toBlock: "latest",
            }),
            amoyClient.getLogs({
              address: deployment.contract as any,
              event: redeemedEvent,
              args: { checkId: tokenId },
              fromBlock: deployment.fromBlock,
              toBlock: "latest",
            }),
            amoyClient.getLogs({
              address: deployment.contract as any,
              event: voidedEvent,
              args: { checkId: tokenId },
              fromBlock: deployment.fromBlock,
              toBlock: "latest",
            }),
          ]);

          mintTx = mints?.[0]?.transactionHash ?? null;
          redeemTx = redeems?.[0]?.transactionHash ?? null;
          voidTx = voids?.[0]?.transactionHash ?? null;
        } catch {
          mintTx = null;
          redeemTx = null;
          voidTx = null;
        }

        if (!alive) return;

        const status = Number(pc?.status ?? 0);

        setVm({
          deploymentLabel: deployment.label,
          contract: deployment.contract,
          token: deployment.token,
          tokenId,
          issuer: String(pc?.issuer ?? ""),
          holder,
          tba,
          amount: (pc?.amount ?? 0n) as bigint,
          decimals,
          symbol,
          claimableAt: (pc?.claimableAt ?? 0n) as bigint,
          title: bytes32ToTrimmedAscii(pc?.title as Hex),
          memo: String(pc?.memo ?? ""),
          status,
          mintTx,
          redeemTx,
          voidTx,
          tbaBalance,
        });

        setLoading(false);
      } catch (e: any) {
        if (!alive) return;
        const msg =
          e?.shortMessage ||
          e?.message ||
          (typeof e === "string" ? e : "On-chain lookup failed.");
        setError(msg);
        setLoading(false);
      }
    }

    run();

    return () => {
      alive = false;
    };
  }, [serial]);

  async function copyToClipboard(textToCopy: string, key: string) {
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1200);
    } catch {
      // ignore
    }
  }

  const amountText = useMemo(() => {
    if (!vm) return "Not available";
    return `${formatUnits(vm.amount, vm.decimals)} ${vm.symbol}`;
  }, [vm]);

  const remainingText = useMemo(() => {
    if (!vm) return "Not available";
    return `${formatUnits(vm.tbaBalance, vm.decimals)} ${vm.symbol}`;
  }, [vm]);

  const claimableText = useMemo(() => {
    if (!vm) return "Not available";
    return Number(vm.claimableAt) ? formatDateTime(vm.claimableAt) : "Instant Claim";
  }, [vm]);

  const statusMeta = useMemo(() => {
    if (!vm) return getStatusMeta("Unknown");
    if (vm.status === 1) return getStatusMeta("Active");
    if (vm.status === 2) return getStatusMeta("Redeemed");
    if (vm.status === 3) return getStatusMeta("Void");
    return getStatusMeta("Unknown");
  }, [vm]);

  const checkTitle = useMemo(() => {
    if (!vm?.title) return "Testnet Payment Check";
    return vm.title;
  }, [vm]);

  return (
    <div className="page">
      <div className="shell">
        <ExplorerTopbar />

        <RouteHeader
          serial={serial}
          title={checkTitle}
          metaLine={`${AMOY_NAME} • ${vm?.symbol || "Token"} • ${Number(vm?.claimableAt || 0n) ? "Scheduled" : "Instant Claim"}`}
          exploreHref={vm ? scanAddr(vm.contract) : undefined}
          onCopyLink={() => copyToClipboard(`${origin}/testnet/${serial}`, "share")}
          copyLabel={copiedKey === "share" ? "Copied Link" : "Copy Link"}
          statusLabel={statusMeta.label}
          statusTone={statusMeta.tone}
        />

        <div className="panel heroPanel">
          <div className="heroGrid">
            <div className="heroLeft">
              <div className="sectionTitle">Check Data</div>

              {vm && !loading && !error ? (
                <div className="dataGrid">
                  <DataCell label="Status" value={<StatusPill label={statusMeta.label} tone={statusMeta.tone} />} />
                  <DataCell label="Type" value="Payment" />
                  <DataCell label="Conditions" value={claimableText} />
                  <DataCell label="Network" value={AMOY_NAME} />
                  <DataCell label="Initial Collateral" value={amountText} />
                  <DataCell label="Remaining Collateral" value={remainingText} />
                  <DataCell label="Serial" value={serial} mono />
                  <DataCell label="Token ID" value={vm.tokenId.toString()} />
                  <DataCell label="Contract" value={vm.contract} mono full />
                  <DataCell label="Issuer" value={vm.issuer} mono full />
                  <DataCell label="Holder" value={vm.holder} mono full />
                  <DataCell
                    label="Memo"
                    value={vm.memo || "No memo was found on-chain for this check."}
                    full
                  />
                </div>
              ) : (
                <div className="stateStack">
                  {loading ? <div className="noteBox">Resolving serial on-chain...</div> : null}
                  {notFound ? (
                    <div className="noteBox">
                      This serial is not in the curated list and was not found on the supported Polygon Amoy deployments.
                    </div>
                  ) : null}
                  {error ? <div className="noteBox">{error}</div> : null}
                </div>
              )}
            </div>

            <div className="heroRight">
              <CheckPreview serial={serial} allowFallback />
            </div>
          </div>
        </div>

        <div className="lowerGrid">
          <div className="panel">
            <div className="sectionTitle">Transactions</div>
            {vm && !loading && !error ? (
              <div className="txStack">
                {vm.mintTx ? <TxRow label="Mint" hash={vm.mintTx} /> : null}
                {vm.redeemTx ? <TxRow label="Redeem" hash={vm.redeemTx} /> : null}
                {vm.voidTx ? <TxRow label="Void" hash={vm.voidTx} /> : null}
                {!vm.mintTx && !vm.redeemTx && !vm.voidTx ? (
                  <div className="emptyState">
                    Transaction hashes are best-effort and may depend on RPC log support.
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="emptyState">Transaction data will appear after the serial is resolved.</div>
            )}
          </div>

          <div className="panel">
            <div className="sectionTitle">Share</div>
            <div className="dataGrid single">
              <DataCell label="URL" value={`${origin}/testnet/${serial}`} mono full />
            </div>
          </div>

          <div className="panel">
            <div className="sectionTitle">Notes</div>
            <div className="noteBox">
              Live on-chain lookup is enabled for supported Payment Checks deployments on Polygon Amoy. Visual polish and layout alignment are still being refined on this explorer page.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = `
.page {
  min-height: 100vh;
  background:
    radial-gradient(1100px 520px at 20% -5%, rgba(22, 161, 216, 0.08), transparent 60%),
    radial-gradient(900px 420px at 100% 0%, rgba(22, 161, 216, 0.04), transparent 55%),
    linear-gradient(180deg, #101012 0%, #131316 100%);
  color: #f7f8fb;
  font-family: "Kanit", ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
  padding: 22px 18px 72px;
}

.page:before {
  content: "";
  position: fixed;
  inset: 0;
  pointer-events: none;
  opacity: 0.035;
  background-image:
    radial-gradient(circle at 20% 20%, rgba(255,255,255,0.12) 0.6px, transparent 0.9px),
    radial-gradient(circle at 70% 40%, rgba(255,255,255,0.08) 0.6px, transparent 0.9px),
    radial-gradient(circle at 40% 80%, rgba(255,255,255,0.08) 0.6px, transparent 0.9px);
  background-size: 18px 18px, 22px 22px, 20px 20px;
}

.shell {
  max-width: 1320px;
  margin: 0 auto;
  position: relative;
  z-index: 1;
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 14px 18px;
  border-radius: 18px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: linear-gradient(180deg, rgba(24, 24, 27, 0.96), rgba(20, 20, 24, 0.96));
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.22);
  margin-bottom: 20px;
}

.brandLink {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  text-decoration: none;
}

.brandMarkWrap {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  background: linear-gradient(180deg, #26afe4 0%, #1697cc 100%);
  display: grid;
  place-items: center;
  box-shadow: 0 12px 24px rgba(22, 161, 216, 0.28);
}

.brandMark {
  color: white;
  font-weight: 500;
  font-size: 27px;
  line-height: 1;
  letter-spacing: -0.05em;
}

.brandText {
  color: #ffffff;
  font-size: 30px;
  line-height: 1;
  font-weight: 500;
  letter-spacing: -0.03em;
}

.topbarRight {
  display: flex;
  align-items: center;
  gap: 10px;
}

.topbarTag {
  min-height: 34px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid rgba(22, 161, 216, 0.24);
  color: #80d7fb;
  background: rgba(22, 161, 216, 0.1);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-weight: 500;
}

.routeHeader {
  margin-bottom: 18px;
}

.routeHeaderTop {
  margin-bottom: 10px;
}

.back {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: #a8b0bc;
  text-decoration: none;
  font-size: 14px;
  font-weight: 400;
}

.back:hover {
  color: #ffffff;
}

.routeHeaderRow {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
}

.routeHeaderCopy {
  max-width: 880px;
}

.title {
  margin: 0;
  font-size: 62px;
  line-height: 0.98;
  letter-spacing: -0.04em;
  font-weight: 500;
  color: #ffffff;
}

.checkName {
  margin-top: 12px;
  font-size: 30px;
  line-height: 1.1;
  color: #f0f3f8;
  font-weight: 500;
  letter-spacing: -0.02em;
}

.metaLine {
  margin-top: 10px;
  color: #9aa4b3;
  font-size: 15px;
  line-height: 1.45;
  font-weight: 400;
}

.routeHeaderActions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.headerBtn {
  min-height: 42px;
  padding: 0 15px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.05);
  color: #f1f5fb;
  text-decoration: none;
  font-family: inherit;
  font-size: 14px;
  font-weight: 400;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.headerBtn:hover {
  background: rgba(255, 255, 255, 0.08);
}

.subtleHeaderBtn {
  color: #8ddaf7;
  border-color: rgba(22, 161, 216, 0.18);
  background: rgba(22, 161, 216, 0.08);
}

.pill {
  min-height: 38px;
  padding: 0 14px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 12px;
  font-weight: 500;
  border: 1px solid transparent;
}

.pill.success {
  color: #67d79c;
  background: rgba(30, 120, 72, 0.18);
  border-color: rgba(63, 192, 120, 0.18);
}

.pill.info {
  color: #76c9f0;
  background: rgba(22, 161, 216, 0.14);
  border-color: rgba(22, 161, 216, 0.18);
}

.pill.warning {
  color: #ffd37a;
  background: rgba(199, 136, 17, 0.16);
  border-color: rgba(255, 193, 77, 0.18);
}

.pill.danger {
  color: #ff9a9a;
  background: rgba(171, 52, 52, 0.16);
  border-color: rgba(226, 97, 97, 0.18);
}

.pill.muted {
  color: #b6beca;
  background: rgba(255, 255, 255, 0.07);
  border-color: rgba(255, 255, 255, 0.08);
}

.panel {
  border-radius: 20px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: linear-gradient(180deg, rgba(24, 24, 27, 0.98), rgba(20, 20, 24, 0.98));
  box-shadow: 0 24px 50px rgba(0, 0, 0, 0.22);
}

.heroPanel {
  padding: 18px;
}

.heroGrid {
  display: grid;
  grid-template-columns: minmax(0, 1.18fr) minmax(360px, 460px);
  gap: 22px;
  align-items: stretch;
}

.heroLeft,
.heroRight {
  min-width: 0;
}

.sectionTitle {
  font-size: 22px;
  line-height: 1.2;
  color: #ffffff;
  font-weight: 500;
  margin-bottom: 16px;
}

.dataGrid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.dataGrid.single {
  grid-template-columns: 1fr;
}

.dataCell {
  border-radius: 16px;
  padding: 14px 15px;
  background: rgba(255, 255, 255, 0.035);
  border: 1px solid rgba(255, 255, 255, 0.06);
  min-height: 86px;
}

.dataCell.full {
  grid-column: 1 / -1;
  min-height: auto;
}

.dataLabel {
  font-size: 11px;
  line-height: 1.2;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #6f7b8c;
  font-weight: 500;
  margin-bottom: 8px;
}

.dataValue {
  color: #f2f5fa;
  font-size: 15px;
  line-height: 1.45;
  font-weight: 400;
  word-break: break-word;
}

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
}

.previewSurface {
  height: 100%;
  border-radius: 18px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.015));
  padding: 16px;
}

.previewLabel {
  color: #7e8da0;
  font-size: 11px;
  line-height: 1.2;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-weight: 500;
  margin-bottom: 14px;
}

.checkFrame {
  border-radius: 18px;
  padding: 14px;
  background: rgba(255, 255, 255, 0.025);
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.checkBox {
  position: relative;
  width: 100%;
}

.checkImg {
  width: 100%;
  height: auto;
  display: block;
  border-radius: 14px;
  user-select: none;
  -webkit-user-drag: none;
}

.qrOuter {
  position: absolute;
  right: 26px;
  top: 180px;
  width: 112px;
  height: 112px;
  border-radius: 8px;
  background: rgba(255,255,255,0.9);
  display: flex;
  align-items: center;
  justify-content: center;
}

.qrImg {
  width: 96px;
  height: 96px;
  border-radius: 0;
}

.lowerGrid {
  display: grid;
  grid-template-columns: 1.35fr 1fr 1fr;
  gap: 18px;
  margin-top: 18px;
}

.lowerGrid .panel {
  padding: 18px;
}

.txStack,
.stateStack {
  display: grid;
  gap: 12px;
}

.txRow {
  border-radius: 14px;
  padding: 13px 14px;
  background: rgba(255, 255, 255, 0.035);
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.txLabel {
  font-size: 11px;
  line-height: 1.2;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #6f7b8c;
  font-weight: 500;
  margin-bottom: 8px;
}

.hashLink {
  color: #63c5ee;
  text-decoration: none;
  font-size: 13px;
  line-height: 1.5;
  display: block;
  word-break: break-all;
}

.hashLink:hover {
  text-decoration: underline;
}

.noteBox,
.emptyState {
  border-radius: 14px;
  padding: 14px;
  background: rgba(255, 255, 255, 0.035);
  border: 1px solid rgba(255, 255, 255, 0.06);
  color: #c0c8d2;
  font-size: 14px;
  line-height: 1.55;
  font-weight: 400;
}

@media (max-width: 1180px) {
  .heroGrid {
    grid-template-columns: 1fr;
  }

  .lowerGrid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 860px) {
  .topbar {
    padding: 12px 14px;
  }

  .brandMarkWrap {
    width: 42px;
    height: 42px;
  }

  .brandMark {
    font-size: 24px;
  }

  .brandText {
    font-size: 24px;
  }

  .routeHeaderRow {
    flex-direction: column;
    align-items: flex-start;
  }

  .routeHeaderActions {
    justify-content: flex-start;
  }

  .title {
    font-size: 46px;
  }

  .checkName {
    font-size: 25px;
  }

  .dataGrid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 520px) {
  .page {
    padding: 14px 12px 48px;
  }

  .title {
    font-size: 38px;
  }

  .checkName {
    font-size: 21px;
  }

  .brandText {
    font-size: 20px;
  }

  .headerBtn,
  .pill {
    min-height: 38px;
  }

  .qrOuter {
    right: 16px;
    top: 135px;
    width: 102px;
    height: 102px;
    border-radius: 7px;
  }

  .qrImg {
    width: 86px;
    height: 86px;
  }
}
`;
