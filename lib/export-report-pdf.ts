import { fitPdfPage } from "./pdf-fit";
import { todayKey } from "./timeline";
export async function exportReportPdf(source: HTMLElement) {
  const [{ toCanvas }, { jsPDF }] = await Promise.all([
    import("html-to-image"),
    import("jspdf"),
  ]);
  await document.fonts.ready;
  const wrapper = document.createElement("div");
  wrapper.setAttribute("aria-hidden", "true");
  Object.assign(wrapper.style, {
    position: "fixed",
    left: "-20000px",
    top: "0",
    width: "1120px",
    pointerEvents: "none",
    background: "#080b10",
  });
  const clone = source.cloneNode(true) as HTMLElement;
  Object.assign(clone.style, {
    width: "1120px",
    maxWidth: "none",
    margin: "0",
    padding: "25px",
    background: "#080b10",
    boxSizing: "border-box",
  });
  clone
    .querySelectorAll('[data-pdf-exclude="true"],[popover],dialog')
    .forEach((node) => node.remove());
  clone
    .querySelectorAll<HTMLElement>(".report-calendar-scroll")
    .forEach((node) => Object.assign(node.style, { overflow: "visible" }));
  clone
    .querySelectorAll<HTMLElement>(".report-calendar-grid")
    .forEach((node) =>
      Object.assign(node.style, { minWidth: "0", width: "100%" }),
    );
  clone
    .querySelectorAll<HTMLElement>(".stats")
    .forEach((node) =>
      Object.assign(node.style, {
        gridTemplateColumns: "repeat(4,minmax(0,1fr))",
      }),
    );
  clone
    .querySelectorAll<HTMLElement>(".grid")
    .forEach((node) =>
      Object.assign(node.style, { gridTemplateColumns: "1.6fr 1fr" }),
    );
  clone
    .querySelectorAll(
      ".report-calendar-controls>button:not(.app-select),.report-month-nav>button,.calendar-detail",
    )
    .forEach((node) => node.remove());
  wrapper.append(clone);
  document.body.append(wrapper);
  try {
    const canvas = await toCanvas(clone, {
      pixelRatio: 2,
      backgroundColor: "#080b10",
      skipFonts: true,
      cacheBust: true,
    });
    const pdf = new jsPDF({
        orientation: canvas.width > canvas.height ? "landscape" : "portrait",
        unit: "mm",
        format: "a4",
        compress: true,
      }),
      w = pdf.internal.pageSize.getWidth(),
      h = pdf.internal.pageSize.getHeight(),
      fit = fitPdfPage(canvas.width, canvas.height, w, h);
    pdf.setFillColor(8, 11, 16);
    pdf.rect(0, 0, w, h, "F");
    pdf.addImage(
      canvas.toDataURL("image/jpeg", 0.97),
      "JPEG",
      fit.x,
      fit.y,
      fit.width,
      fit.height,
      undefined,
      "FAST",
    );
    pdf.setProperties({
      title: "Workly team performance report",
      creator: "Workly",
    });
    if (pdf.getNumberOfPages() !== 1)
      throw Error("The report must fit one page");
    await pdf.save(`workly-report-${todayKey()}.pdf`, { returnPromise: true });
  } finally {
    wrapper.remove();
  }
}
