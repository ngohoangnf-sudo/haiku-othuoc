const MAX_PIXEL_RATIO = 2;

let pdfjsPromise = null;

// Loads pdf.js (and wires its worker) once per session, shared by the book
// reader and the library cover thumbnails.
export function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = Promise.all([
      import("pdfjs-dist/legacy/build/pdf.mjs"),
      import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url"),
    ])
      .then(([pdfjs, worker]) => {
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
        return pdfjs;
      })
      .catch((error) => {
        pdfjsPromise = null;
        throw error;
      });
  }
  return pdfjsPromise;
}

// Renders page 1 of a PDF to a JPEG data URL, used as the cover for books
// that were uploaded without one.
export async function renderPdfFirstPage(url, width = 420) {
  const pdfjs = await loadPdfjs();
  // Ranged fetching buys nothing here: these books aren't linearized, so pdf.js
  // reads most of the file before it can lay out page 1 (measured at roughly
  // twice the file size, whatever the range/stream options). Callers must keep
  // the source small enough that a full download is acceptable.
  const task = pdfjs.getDocument({ url });

  let doc = null;
  try {
    doc = await task.promise;
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const pixelRatio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
    const viewport = page.getViewport({ scale: (width * pixelRatio) / base.width });

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Không khởi tạo được vùng vẽ ảnh bìa.");

    // PDF pages are transparent; paint white so the JPEG isn't rendered black.
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: context, viewport }).promise;
    page.cleanup();

    return canvas.toDataURL("image/jpeg", 0.82);
  } finally {
    if (doc) {
      doc.destroy();
    } else {
      task.destroy();
    }
  }
}
