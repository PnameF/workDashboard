export function fitPdfPage(
  width: number,
  height: number,
  pageWidth: number,
  pageHeight: number,
  margin = 8,
) {
  if (
    [width, height, pageWidth, pageHeight].some(
      (v) => !Number.isFinite(v) || v <= 0,
    )
  )
    throw Error("Invalid PDF dimensions");
  const scale = Math.min(
      (pageWidth - 2 * margin) / width,
      (pageHeight - 2 * margin) / height,
    ),
    w = width * scale,
    h = height * scale;
  return {
    x: (pageWidth - w) / 2,
    y: (pageHeight - h) / 2,
    width: w,
    height: h,
  };
}
