import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { archiveUrl } from "./bridge.ts";
import { paperFromLink, parseSearchResult, splitSearch } from "./archive.ts";

const link =
  "https://regexam.nuigalway.ie/regexam/paper_index_download.asp?academic_session=2025&paper_code_nominal=CT318-1&assessment_sitting=1&assessment_period=5&exam_paper_master=3221012165&irish_flag=False";
describe("archive metadata and coverage", () => {
  it("separates sitting, period and archive identity", () => {
    const paper = paperFromLink({
      url: link,
      title: "Human Computer Interaction",
    });
    assert.equal(paper.filename, "2025_2026_CT318_1_1_5.pdf");
    assert.equal(paper.sitting, "1");
    assert.equal(paper.period, "5");
    assert.equal(paper.archiveId, "3221012165");
    assert.equal(paper.id, "2025_2026_ct318_1_1_5.pdf@3221012165");
  });
  it("keeps Irish supplements and distinct source papers separate", () => {
    const english = paperFromLink({ url: link, title: "HCI" });
    const irish = paperFromLink({
      url: link.replace("False", "True"),
      title: "HCI",
    });
    const other = paperFromLink({
      url: link.replace("3221012165", "123"),
      title: "HCI",
    });
    assert.equal(irish.filename, english.filename);
    assert.equal(irish.component, english.component);
    assert.equal(irish.language, "ga");
    assert.equal(new Set([english.id, irish.id, other.id]).size, 3);
  });
  it("uses the result row for bonded papers with a COMMON download code", () => {
    assert.equal(
      paperFromLink({
        url: link.replace("CT318-1", "COMMON"),
        title: "Innovation",
        code: "MG310-1",
      }).moduleCode,
      "MG310",
    );
  });
  it("accepts legacy dotted module codes", () => {
    assert.equal(
      paperFromLink({
        url: link.replace("CT318-1", "AY102.R-1"),
        title: "Accountancy",
      }).moduleCode,
      "AY102.R",
    );
  });
  it("rejects untrusted origins, credentials and unexpected endpoints", () => {
    for (const url of [
      "https://evil.test/regexam/paper_index_download.asp",
      "https://regexam.nuigalway.ie/logout",
      "https://user:pass@regexam.nuigalway.ie/regexam/paper_index_download.asp",
    ])
      assert.throws(() => archiveUrl(url));
  });
  it("refuses to call a truncated result complete", () => {
    assert.throws(
      () =>
        parseSearchResult({
          total: 501,
          limited: false,
          rows: ["one"],
          papers: [],
        }),
      /incomplete/,
    );
    assert.equal(
      parseSearchResult({ total: 501, limited: true, rows: [], papers: [] })
        .limited,
      true,
    );
  });
  it("splits years without overlap or gaps", () => {
    assert.deepEqual(splitSearch({ prefix: "C%", from: "2007", to: "2025" }), [
      { prefix: "C%", from: "2007", to: "2016" },
      { prefix: "C%", from: "2017", to: "2025" },
    ]);
    const prefixes = splitSearch({ prefix: "%", from: "2025", to: "2025" });
    assert.equal(prefixes.length, 36);
    assert.equal(new Set(prefixes.map((p) => p.prefix)).size, 36);
  });
});
