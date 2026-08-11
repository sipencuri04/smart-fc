import * as pdfjsLib from 'pdfjs-dist';

// Gunakan worker dari pdfjs-dist
// @ts-ignore
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

export type ColorCategory = 'bw' | 'low' | 'medium' | 'high';

export type PageAnalysis = {
  pageNum: number;
  isColor: boolean;
  colorCategory: ColorCategory;
  colorCoverage: number;
  thumbnail: string;
};

export type PDFAnalysisResult = {
  totalPages: number;
  bwPages: number;
  lowColorPages: number;
  mediumColorPages: number;
  highColorPages: number;
  pages: PageAnalysis[];
};

export async function analyzePDF(file: File, onProgress?: (current: number, total: number) => void): Promise<PDFAnalysisResult> {
  const arrayBuffer = await file.arrayBuffer();
  
  // Menggunakan standar baku untuk memuat pdf dari buffer
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  
  const result: PDFAnalysisResult = {
    totalPages: pdf.numPages,
    bwPages: 0,
    lowColorPages: 0,
    mediumColorPages: 0,
    highColorPages: 0,
    pages: []
  };

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    // Skala 0.5 (atau bahkan lebih kecil) sudah cukup untuk mendeteksi warna dan thumbnail kecil
    const viewport = page.getViewport({ scale: 0.5 });
    
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error("Canvas 2D context not supported");

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    // PDFJS merender dengan background transparan, padahal kertas aslinya putih
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({
      canvasContext: ctx,
      viewport: viewport
    } as any).promise;

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    let colorPixels = 0;
    
    // Periksa warna per piksel (R, G, B, A)
    for (let j = 0; j < data.length; j += 4) {
      const r = data[j];
      const g = data[j+1];
      const b = data[j+2];
      
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      
      // Jika selisih antara channel warna lebih dari 15, maka itu piksel berwarna
      // Bukan abu-abu sejati
      if (max - min > 15) {
        colorPixels++;
      }
    }
    
    const totalPixels = canvas.width * canvas.height;
    // Hitung persentase warna
    const colorCoverage = (colorPixels / totalPixels) * 100;
    
    let colorCategory: ColorCategory = 'bw';
    if (colorCoverage < 0.1) {
      colorCategory = 'bw';
      result.bwPages++;
    } else if (colorCoverage < 5) {
      colorCategory = 'low';
      result.lowColorPages++;
    } else if (colorCoverage < 30) {
      colorCategory = 'medium';
      result.mediumColorPages++;
    } else {
      colorCategory = 'high';
      result.highColorPages++;
    }

    result.pages.push({
      pageNum: i,
      isColor: colorCategory !== 'bw',
      colorCategory,
      colorCoverage,
      thumbnail: canvas.toDataURL('image/jpeg', 0.6) // Format jpeg untuk efisiensi
    });

    if (onProgress) {
      onProgress(i, pdf.numPages);
    }
  }

  return result;
}
