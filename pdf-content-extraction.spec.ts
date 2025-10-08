import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import * as pdfParseModule from "pdf-parse";

test.describe("PDF Content Extraction Tests", () => {
  const downloadsDir = path.resolve("./downloads");
  const selectedPDF = process.env.TEST_PDF || "Credit limit-134333596.pdf";
  const pdfPath = path.resolve(downloadsDir, selectedPDF);

  test("Extract and validate PDF content", async () => {
    if (!fs.existsSync(pdfPath)) {
      throw new Error(`PDF file not found at: ${pdfPath}`);
    }

    const pdfBuffer = fs.readFileSync(pdfPath);
    const pdfData = await (pdfParseModule as any)(pdfBuffer);

    expect(pdfData).toBeDefined();
    expect(pdfData.text).toBeDefined();

    let pageCount =
      pdfData.total ||
      (Array.isArray(pdfData.pages) ? pdfData.pages.length : 0);
    expect(pageCount).toBeGreaterThan(0);

    console.log(`📄 PDF Summary:`);
    console.log(`   📋 Pages: ${pageCount}`);
    console.log(
      `   📝 Text: ${pdfData.text.length} chars, ${
        pdfData.text.split(/\s+/).length
      } words`
    );

    if (pdfData.info) {
      console.log(`   🏷️  Producer: ${pdfData.info.Producer || "Unknown"}`);
      console.log(
        `   📋 Version: ${pdfData.info.PDFFormatVersion || "Unknown"}`
      );
    }

    if (pdfData.text.length > 0) {
      console.log(`📖 PDF Text: ${pdfData.text}`);
      // example for finding certain pieces of data using a regex could be used for policyId ect.
      const emailPattern = /[\w.-]+@[\w.-]+\.\w+/g;
      const emails = pdfData.text.match(emailPattern) || [];
      const lines = pdfData.text
        .split("\n")
        .filter((line: string) => line.trim().length > 0);

      console.log(`🔍 Found: ${emails.length} emails, ${lines.length} lines`);
    }

    console.log("✅ Content extraction completed");
  });
});
