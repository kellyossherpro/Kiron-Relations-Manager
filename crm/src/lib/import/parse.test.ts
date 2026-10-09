import { describe, expect, it } from "vitest";
import { makeXlsx } from "@/test/xlsx";
import { parseCsv, readSpreadsheet } from "./parse";

describe("reading HubSpot exports", () => {
  it("CSV: quotes, commas and line breaks inside a cell, Excel's BOM, semicolons", () => {
    const csv = '﻿Record ID,Deal Name,Notes\r\n101,"Example, Ltd – Casino","Line one\nline ""two"""\r\n\r\n102,Plain,\r\n';
    expect(parseCsv(csv)).toEqual({
      headers: ["Record ID", "Deal Name", "Notes"],
      rows: [["101", "Example, Ltd – Casino", 'Line one\nline "two"'], ["102", "Plain", ""]],
    });
    expect(parseCsv("A;B\n1;2,5\n").rows).toEqual([["1", "2,5"]]);
  });

  it("Excel: text, numbers, dates and empty cells", async () => {
    const bytes = makeXlsx([
      ["Record ID", "Deal Name", "Amount", "Close Date", "Notes"],
      ["101", "Bluebay – Example & Co", 15000, { date: 46296 }, ""],
      [102, "Second <deal>", 2500.5, "", "x"],
    ]);
    expect(await readSpreadsheet("deals-export.xlsx", bytes)).toEqual({
      headers: ["Record ID", "Deal Name", "Amount", "Close Date", "Notes"],
      rows: [["101", "Bluebay – Example & Co", "15000", "2026-10-01", ""], ["102", "Second <deal>", "2500.5", "", "x"]],
    });
    await expect(readSpreadsheet("deals.pdf", bytes)).rejects.toThrow(".xlsx or .csv");
    await expect(readSpreadsheet("broken.xlsx", new Uint8Array([1, 2, 3]))).rejects.toThrow("isn't a readable Excel file");
  });
});
