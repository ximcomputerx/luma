import { useEffect, useRef, useState } from "react";
import { t } from "../i18n";

type Props = {
  html: string | null;
  width: number;
  height: number;
  sample: string | null;
  loading: boolean;
  error: string;
};

export function ExportPreview({ html, width, height, sample, loading, error }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const frameHeight = height + 28;

  useEffect(() => {
    const node = host.current;
    if (!node || typeof ResizeObserver === "undefined") {
      return;
    }
    const measure = () => {
      const bounds = node.getBoundingClientRect();
      const fitW = (bounds.width - 32) / width;
      const fitH = (bounds.height - 36) / frameHeight;
      const next = Math.min(fitW, fitH);
      setScale(Number.isFinite(next) && next > 0.05 ? Math.min(next, 1) : 1);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [width, frameHeight]);

  return (
    <div className="pdf-stage" ref={host}>
      {sample ? <p className="pdf-sample">{sample}</p> : null}
      {error ? <p className="pdf-error" role="alert">{error}</p> : null}
      {loading && !html && !error ? <p className="pdf-status">{t("pdf.loading")}</p> : null}
      {html ? (
        <div className="pdf-paper" style={{ width: width * scale, height: frameHeight * scale }}>
          <iframe
            title={t("pdf.preview")}
            sandbox="allow-scripts"
            srcDoc={html}
            style={{ width, height: frameHeight, transform: `scale(${scale})` }}
          />
        </div>
      ) : null}
    </div>
  );
}
