import { describe, expect, it } from "vitest";
import { buildHtmlReport } from "./report";

describe("report builder", () => {
  it("renders output names into html", async () => {
    const html = await buildHtmlReport(
      [
        {
          id: "1",
          outputName: "converted.webp",
          blob: new Blob(["demo"], { type: "image/webp" }),
          width: 800,
          height: 600,
        },
      ],
      [
        {
          id: "1",
          file: { name: "source.png", size: 42 },
        },
      ],
      {
        generatedAt: "2026-01-01T00:00:00.000Z",
        engine: "worker",
        settings: { outputFormat: "image/webp" },
        items: [{ id: "1" }],
      },
    );

    expect(html).toContain("converted.webp");
    expect(html).toContain("Image Converter Report");
  });
});
