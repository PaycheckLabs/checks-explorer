/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  webpack: (config) => {
    // wagmi/connectors re-exports multiple connectors.
    // Some connectors reference optional peer deps (Safe, WalletConnect, MetaMask SDK, Porto, etc.).
    // We only use injected(), so we alias these unused deps to avoid Next/Webpack build failures.
    config.resolve = config.resolve || {};
    config.resolve.alias = {
      ...(config.resolve.alias || {}),

      // MetaMask connector optional deps
      "@metamask/sdk": false,

      // Porto connector optional deps
      porto: false,
      "porto/internal": false,

      // Safe connector optional deps
      "@safe-global/safe-apps-sdk": false,
      "@safe-global/safe-apps-provider": false,

      // WalletConnect connector optional deps
      "@walletconnect/ethereum-provider": false,

      // (Sometimes referenced by other connectors)
      "@coinbase/wallet-sdk": false,
      "@base-org/account": false,
    };

    return config;
  },
};

module.exports = nextConfig;
