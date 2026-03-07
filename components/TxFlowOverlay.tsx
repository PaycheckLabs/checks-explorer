import React from "react";

export type TxUiKind = "none" | "wallet" | "pending" | "success" | "failed";

export type TxUiState = {
  kind: TxUiKind;
  title?: string;
  sub?: string;
  hash?: `0x${string}`;
  serial?: string;
};

type Props = {
  ui: TxUiState;
  onViewTx: () => void;
  onViewCheck: () => void;
  onClose: () => void;
};

export default function TxFlowOverlay({ ui, onViewTx, onViewCheck, onClose }: Props) {
  if (ui.kind === "none") return null;

  const canClose = ui.kind === "success" || ui.kind === "failed";

  return (
    <>
      <div className="txOverlay" role="dialog" aria-modal="true" aria-label="Transaction status">
        {/* wallet: spinner only */}
        {ui.kind === "wallet" && (
          <div className="txSpinnerWrap">
            <div className="spinner" />
            <div className="spinnerText">{ui.title || "Please wait…"}</div>
            {ui.sub ? <div className="spinnerSub">{ui.sub}</div> : null}
          </div>
        )}

        {/* pending/success/failed: modal */}
        {ui.kind !== "wallet" && (
          <div className="txModal">
            <div className="txIconWrap">
              {ui.kind === "pending" ? <div className="txIcon amber">⌛</div> : null}
              {ui.kind === "success" ? <div className="txIcon green">✔</div> : null}
              {ui.kind === "failed" ? <div className="txIcon red">✕</div> : null}
            </div>

            <div className="txTitle">{ui.title}</div>
            <div className="txSub">{ui.sub}</div>

            {ui.hash ? <div className="txHash mono">{ui.hash}</div> : null}

            <div className="txButtons">
              {ui.kind === "pending" ? (
                <button className="txBtnGhost" onClick={onViewTx} disabled={!ui.hash}>
                  🌐 View TXN on Polygonscan
                </button>
              ) : null}

              {ui.kind === "success" ? (
                <>
                  <button className="txBtnPrimary" onClick={onViewCheck} disabled={!ui.serial}>
                    📄 View Check
                  </button>
                  <button className="txBtnGhost" onClick={onViewTx} disabled={!ui.hash}>
                    🌐 View TXN on Polygonscan
                  </button>
                </>
              ) : null}

              {ui.kind === "failed" ? (
                <>
                  <button className="txBtnPrimary" onClick={onClose}>
                    Try Again
                  </button>
                  <button className="txBtnGhost" onClick={onViewTx} disabled={!ui.hash}>
                    🌐 View TXN on Polygonscan
                  </button>
                </>
              ) : null}
            </div>

            {canClose ? (
              <button className="txClose" onClick={onClose} type="button">
                Close
              </button>
            ) : null}
          </div>
        )}
      </div>

      <style jsx>{`
        .mono {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New",
            monospace;
        }

        .txOverlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.65);
          backdrop-filter: blur(4px);
          display: grid;
          place-items: center;
          padding: 20px;
          z-index: 80;
        }

        .txSpinnerWrap {
          display: grid;
          place-items: center;
          gap: 12px;
          color: #e5e7eb;
          text-align: center;
          max-width: 520px;
        }

        .spinner {
          width: 30px;
          height: 30px;
          border-radius: 999px;
          border: 3px solid rgba(255, 255, 255, 0.25);
          border-top-color: rgba(255, 255, 255, 0.9);
          animation: spin 0.9s linear infinite;
        }

        .spinnerText {
          font-weight: 900;
          color: rgba(255, 255, 255, 0.9);
        }

        .spinnerSub {
          color: rgba(255, 255, 255, 0.72);
          font-weight: 800;
          font-size: 13px;
          line-height: 1.35;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        .txModal {
          width: min(520px, 100%);
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(17, 24, 39, 0.96);
          padding: 16px;
          box-shadow: 0 22px 80px rgba(0, 0, 0, 0.65);
          text-align: center;
        }

        .txIconWrap {
          display: grid;
          place-items: center;
          margin-bottom: 10px;
        }

        .txIcon {
          width: 42px;
          height: 42px;
          border-radius: 999px;
          display: grid;
          place-items: center;
          font-weight: 900;
          border: 1px solid rgba(255, 255, 255, 0.12);
        }

        .txIcon.amber {
          background: rgba(245, 158, 11, 0.18);
          color: rgba(245, 158, 11, 0.95);
        }
        .txIcon.green {
          background: rgba(34, 197, 94, 0.18);
          color: rgba(34, 197, 94, 0.95);
        }
        .txIcon.red {
          background: rgba(239, 68, 68, 0.18);
          color: rgba(239, 68, 68, 0.95);
        }

        .txTitle {
          font-weight: 900;
          font-size: 16px;
          margin-bottom: 6px;
          color: #e5e7eb;
        }

        .txSub {
          color: rgba(255, 255, 255, 0.78);
          font-weight: 800;
          font-size: 13px;
          line-height: 1.35;
        }

        .txHash {
          margin-top: 10px;
          color: rgba(255, 255, 255, 0.55);
          font-size: 12px;
          word-break: break-all;
        }

        .txButtons {
          margin-top: 14px;
          display: grid;
          gap: 10px;
        }

        .txBtnPrimary {
          background: linear-gradient(180deg, rgba(56, 189, 248, 0.95), rgba(14, 165, 233, 0.9));
          border: 1px solid rgba(56, 189, 248, 0.55);
          color: #001018;
          font-weight: 900;
          border-radius: 12px;
          padding: 12px 14px;
          cursor: pointer;
        }
        .txBtnPrimary:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }

        .txBtnGhost {
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.12);
          color: #e5e7eb;
          font-weight: 900;
          border-radius: 12px;
          padding: 12px 14px;
          cursor: pointer;
        }
        .txBtnGhost:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }

        .txClose {
          margin-top: 10px;
          background: transparent;
          border: none;
          color: rgba(255, 255, 255, 0.55);
          font-weight: 900;
          cursor: pointer;
        }
        .txClose:hover {
          color: rgba(255, 255, 255, 0.85);
        }
      `}</style>
    </>
  );
}
