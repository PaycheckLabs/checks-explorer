import { createConfig } from "wagmi";
import { injected } from "wagmi/connectors";
import { polygonAmoy } from "viem/chains";
import { fallback, http } from "viem";

const RPC_PRIMARY = "https://polygon-amoy-bor-rpc.publicnode.com/";
const RPC_FALLBACK = "https://rpc-amoy.polygon.technology/";

export const wagmiConfig = createConfig({
  ssr: true,
  chains: [polygonAmoy],
  connectors: [injected({ shimDisconnect: true })],
  transports: {
    [polygonAmoy.id]: fallback([
      http(RPC_PRIMARY, { timeout: 15_000, retryCount: 2, retryDelay: 500 }),
      http(RPC_FALLBACK, { timeout: 15_000, retryCount: 1, retryDelay: 500 }),
    ]),
  },
});
