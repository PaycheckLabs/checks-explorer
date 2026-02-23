import type { GetServerSideProps } from "next";

export const getServerSideProps: GetServerSideProps = async (ctx) => {
  const serial = String(ctx.params?.serial || "");
  return {
    redirect: {
      destination: `/testnet/${encodeURIComponent(serial)}`,
      permanent: false,
    },
  };
};

export default function SerialRedirect() {
  return null;
}
