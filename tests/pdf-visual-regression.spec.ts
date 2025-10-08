import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import * as http from "http";

test.describe("PDF Visual Regression Tests", () => {
  // Auto-detect available PDF files
  const downloadsDir = path.resolve("./downloads");
  const availablePDFs = fs.existsSync(downloadsDir)
    ? fs.readdirSync(downloadsDir).filter((file) => file.endsWith(".pdf"))
    : [];

  if (availablePDFs.length === 0) {
    throw new Error(
      `No PDF files found in ${downloadsDir}. Please add a PDF file to test.`
    );
  }

  // Use the first available PDF, or allow override via environment variable
  const selectedPDF = process.env.TEST_PDF || availablePDFs[0];
  const pdfPath = path.resolve(downloadsDir, selectedPDF);
  const pdfName = path.basename(selectedPDF, ".pdf").replace(/\s+/g, "-");

  console.log(`📄 Testing PDF: ${selectedPDF}`);
  console.log(`📁 Available PDFs: ${availablePDFs.join(", ")}`);

  async function setupPDFServer(): Promise<{
    server: http.Server;
    port: number;
  }> {
    const port = 3000 + Math.floor(Math.random() * 1000);

    const server = http.createServer((req, res) => {
      if (req.url === "/test.pdf") {
        const pdfBuffer = fs.readFileSync(pdfPath);
        res.writeHead(200, {
          "Content-Type": "application/pdf",
          "Content-Length": pdfBuffer.length,
          "Content-Disposition": `inline; filename="${selectedPDF}"`,
        });
        res.end(pdfBuffer);
      } else if (req.url === "/" || req.url === "/index.html") {
        const html = `
          <!DOCTYPE html>
          <html>
            <head>
              <title>PDF Visual Test</title>
              <style>
                body { 
                  margin: 0; 
                  padding: 20px; 
                  background: #ffffff; 
                  font-family: Arial, sans-serif; 
                }
                .pdf-container { 
                  background: white; 
                  max-width: 800px;
                  margin: 0 auto;
                  padding: 20px;
                }
                .pdf-page { 
                  margin: 20px 0; 
                  padding: 0;
                  text-align: center; 
                  page-break-after: always;
                  display: block;
                  width: 100%;
                  height: auto;
                }
                canvas { 
                  max-width: none; 
                  width: auto;
                  height: auto;
                  display: block;
                  margin: 0 auto;
                  padding: 0;
                  border: none;
                  transition: none !important;
                  animation: none !important;
                }
                .loading { 
                  text-align: center; 
                  padding: 40px; 
                  font-size: 18px; 
                  color: #666; 
                }
                .page-number {
                  margin: 10px 0;
                  color: #888;
                  font-size: 12px;
                }
                *, *::before, *::after {
                  animation-duration: 0s !important;
                  animation-delay: 0s !important;
                  transition-duration: 0s !important;
                  transition-delay: 0s !important;
                }
              </style>
              <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
            </head>
            <body>
              <div class="pdf-container">
                <div class="loading" id="loading">Loading PDF for visual testing...</div>
                <div id="pdf-pages"></div>
              </div>
              
              <script>
                pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
                
                async function loadPDF() {
                  try {
                    const loadingTask = pdfjsLib.getDocument('/test.pdf');
                    const pdf = await loadingTask.promise;
                    
                    const pagesContainer = document.getElementById('pdf-pages');
                    const loading = document.getElementById('loading');
                    
                    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
                      const page = await pdf.getPage(pageNum);
                      
                      const canvas = document.createElement('canvas');
                      const context = canvas.getContext('2d');
                      // Use a scale that produces round pixel dimensions
                      const scale = 1.0; // Reduced from 1.5 for more predictable sizing
                      const viewport = page.getViewport({ scale: scale });
                      canvas.height = Math.round(viewport.height);
                      canvas.width = Math.round(viewport.width);

                      const pageDiv = document.createElement('div');
                      pageDiv.className = 'pdf-page';
                      pageDiv.id = \`page-\${pageNum}\`;
                      
                      const pageNumber = document.createElement('div');
                      pageNumber.className = 'page-number';
                      pageNumber.textContent = \`Page \${pageNum}\`;
                      
                      pageDiv.appendChild(canvas);
                      pageDiv.appendChild(pageNumber);
                      pagesContainer.appendChild(pageDiv);
                      
                      const renderContext = {
                        canvasContext: context,
                        viewport: viewport
                      };
                      
                      await page.render(renderContext).promise;
                    }
                    
                    loading.style.display = 'none';
                    document.body.setAttribute('data-pdf-loaded', 'true');
                    document.body.setAttribute('data-pages-count', pdf.numPages.toString());
                    
                  } catch (error) {
                    console.error('Error loading PDF:', error);
                    document.getElementById('loading').textContent = 'Error: ' + error.message;
                    document.body.setAttribute('data-pdf-error', 'true');
                  }
                }
                
                document.addEventListener('DOMContentLoaded', loadPDF);
              </script>
            </body>
          </html>
        `;
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(html);
      } else {
        res.writeHead(404);
        res.end("Not found");
      }
    });

    server.listen(port);
    return { server, port };
  }

  // Standardized PDF preparation function for consistent rendering
  async function preparePDFForScreenshot(page: any, port: number) {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(`http://localhost:${port}/`);
    await page.waitForLoadState("networkidle");

    await page.waitForFunction(
      () => document.body.getAttribute("data-pdf-loaded") === "true",
      { timeout: 30000 }
    );

    await page.waitForTimeout(1000);

    await page.waitForFunction(
      () => {
        const canvases = document.querySelectorAll("canvas");
        return Array.from(canvases).every(
          (canvas) => canvas.width > 0 && canvas.height > 0
        );
      },
      { timeout: 15000 }
    );

    await page.evaluate(() => {
      return new Promise((resolve) => {
        for (let i = 0; i < 3; i++) {
          document.body.offsetHeight;
        }
        setTimeout(resolve, 50);
      });
    });

    await page.waitForTimeout(500);

    // Simple stability check - just ensure dimensions are consistent
    await page.evaluate(() => {
      // Force a final layout recalculation
      document.body.offsetHeight;
      document.body.offsetWidth;
    });

    // Final short wait for stability
    await page.waitForTimeout(200);
  }

  // Separate test for creating baselines - only run when explicitly requested
  test.describe("Baseline Creation", () => {
    test("Create all baselines", async ({ page }) => {
      if (!fs.existsSync(pdfPath)) {
        throw new Error(`PDF file not found at: ${pdfPath}`);
      }

      console.log("📄 Creating baselines for PDF visual regression...");

      const { server, port } = await setupPDFServer();

      try {
        await preparePDFForScreenshot(page, port);

        console.log("📸 Creating baseline screenshots...");

        let baselinesCreated = 0;

        // Create full page baseline using direct screenshot
        const fullPageScreenshot = await page.screenshot({
          fullPage: true,
          animations: "disabled",
        });

        // Ensure snapshots directory exists
        const snapshotsDir = path.resolve(
          __dirname,
          `${path.basename(__filename)}-snapshots`
        );
        if (!fs.existsSync(snapshotsDir)) {
          fs.mkdirSync(snapshotsDir, { recursive: true });
        }

        // Write the baseline screenshot
        const fullPagePath = path.join(
          snapshotsDir,
          `${pdfName}-full-chromium-win32.png`
        );
        fs.writeFileSync(fullPagePath, fullPageScreenshot);
        console.log(`✅ Created baseline: ${pdfName}-full.png`);
        baselinesCreated++;

        // Create individual page baselines (manual screenshot creation only)
        const pagesCount = await page.evaluate(() => {
          return parseInt(
            document.body.getAttribute("data-pages-count") || "0"
          );
        });

        for (let pageNum = 1; pageNum <= pagesCount; pageNum++) {
          const canvasElement = page.locator(`#page-${pageNum} canvas`);

          // Create individual page baseline using direct screenshot
          const pageScreenshot = await canvasElement.screenshot({
            animations: "disabled",
          });

          // Write the baseline screenshot
          const pageScreenshotPath = path.join(
            snapshotsDir,
            `${pdfName}-page-${pageNum}-chromium-win32.png`
          );
          fs.writeFileSync(pageScreenshotPath, pageScreenshot);
          console.log(`✅ Created baseline: ${pdfName}-page-${pageNum}.png`);
          baselinesCreated++;
        }

        // Create content baseline using direct screenshot
        const pdfContainer = page.locator(".pdf-container");
        await expect(pdfContainer).toBeVisible();

        const contentScreenshot = await pdfContainer.screenshot({
          animations: "disabled",
        });

        // Write the baseline screenshot
        const contentScreenshotPath = path.join(
          snapshotsDir,
          `${pdfName}-content-chromium-win32.png`
        );
        fs.writeFileSync(contentScreenshotPath, contentScreenshot);
        console.log(`✅ Created baseline: ${pdfName}-content.png`);
        baselinesCreated++;

        console.log(
          `✅ Successfully created ${baselinesCreated} baseline screenshots!`
        );
      } finally {
        server.close();
      }
    });
  });

  // Regular visual regression tests
  test.describe("Visual Regression Tests", () => {
    test("PDF visual regression - full page", async ({ page }) => {
      if (!fs.existsSync(pdfPath)) {
        throw new Error(`PDF file not found at: ${pdfPath}`);
      }

      // Check if baseline exists
      const baselinePath = path.resolve(
        __dirname,
        `${path.basename(__filename)}-snapshots`,
        `${pdfName}-full-chromium-win32.png`
      );

      if (!fs.existsSync(baselinePath)) {
        throw new Error(
          `❌ Baseline missing: ${baselinePath}\n💡 Run 'npm run test:visual-update' to create baselines`
        );
      }

      console.log("📄 Setting up PDF visual regression test...");

      const { server, port } = await setupPDFServer();

      try {
        await preparePDFForScreenshot(page, port);

        console.log("📸 Taking visual regression screenshot...");

        await expect(page).toHaveScreenshot(`${pdfName}-full.png`, {
          fullPage: true,
          animations: "disabled",
          timeout: 30000,
          threshold: 0.3,
          maxDiffPixels: 1000,
        });

        console.log("✅ Visual regression test completed");
      } finally {
        server.close();
      }
    });

    test("PDF visual regression - individual pages", async ({ page }) => {
      if (!fs.existsSync(pdfPath)) {
        throw new Error(`PDF file not found at: ${pdfPath}`);
      }

      // Check if baseline exists
      const baselinePath = path.resolve(
        __dirname,
        `${path.basename(__filename)}-snapshots`,
        `${pdfName}-page-1-chromium-win32.png`
      );

      if (!fs.existsSync(baselinePath)) {
        throw new Error(
          `❌ Baseline missing: ${baselinePath}\n💡 Run 'npm run test:visual-update' to create baselines`
        );
      }

      const { server, port } = await setupPDFServer();

      try {
        await preparePDFForScreenshot(page, port);

        const pagesCount = await page.evaluate(() => {
          return parseInt(
            document.body.getAttribute("data-pages-count") || "0"
          );
        });

        console.log(`📄 Testing ${pagesCount} individual pages...`);

        for (let pageNum = 1; pageNum <= pagesCount; pageNum++) {
          console.log(`📸 Testing page ${pageNum}...`);

          const canvasElement = page.locator(`#page-${pageNum} canvas`);
          await expect(canvasElement).toBeVisible();

          await expect(canvasElement).toHaveScreenshot(
            `${pdfName}-page-${pageNum}.png`,
            {
              animations: "disabled",
              threshold: 0.3,
              maxDiffPixels: 500,
            }
          );
        }

        console.log("✅ Individual page visual regression tests completed");
      } finally {
        server.close();
      }
    });

    test("PDF visual regression - content validation", async ({ page }) => {
      if (!fs.existsSync(pdfPath)) {
        throw new Error(`PDF file not found at: ${pdfPath}`);
      }

      // Check if baseline exists
      const baselinePath = path.resolve(
        __dirname,
        `${path.basename(__filename)}-snapshots`,
        `${pdfName}-content-chromium-win32.png`
      );

      if (!fs.existsSync(baselinePath)) {
        throw new Error(
          `❌ Baseline missing: ${baselinePath}\n💡 Run 'npm run test:visual-update' to create baselines`
        );
      }

      const { server, port } = await setupPDFServer();

      try {
        await preparePDFForScreenshot(page, port);

        const hasError = await page.evaluate(() => {
          return document.body.getAttribute("data-pdf-error") === "true";
        });

        expect(hasError).toBeFalsy();

        const pagesCount = await page.evaluate(() => {
          return parseInt(
            document.body.getAttribute("data-pages-count") || "0"
          );
        });

        expect(pagesCount).toBeGreaterThan(0);
        console.log(`✅ PDF loaded with ${pagesCount} pages`);

        const canvasCount = await page.locator("canvas").count();
        expect(canvasCount).toBe(pagesCount);

        const pdfContainer = page.locator(".pdf-container");
        await expect(pdfContainer).toHaveScreenshot(`${pdfName}-content.png`, {
          animations: "disabled",
          threshold: 0.3,
          maxDiffPixels: 1000,
        });

        console.log("✅ Content validation visual regression test completed");
      } finally {
        server.close();
      }
    });
  });
});
