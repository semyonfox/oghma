import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import {
  paperFromFilename,
  filterPapers,
  readRules,
  storePdf,
  verifyLocal,
  saveCatalogue,
  readCatalogue,
  safePath,
  pdfPath,
  readQuestions,
} from "./library.ts";
import { paperFromLink } from "./archive.ts";
const rules = { collections: { third: ["CT3*"] }, topics: {} };
describe("local paper library", () => {
  it("filters repeat sittings independently of the exam period, with custom collections and year sorting", () => {
    const papers = [
      "2024_2025_CT318_1_1_5.pdf",
      "2025_2026_CT318_1_2_3.pdf",
      "2025_2026_MA284_1_2_3.pdf",
    ].map((p) => paperFromFilename(p));
    assert.deepEqual(
      filterPapers(
        papers,
        { collection: "third", sitting: "2", year: "2025", sort: "-year" },
        rules,
      ).map((p) => p.filename),
      ["2025_2026_CT318_1_2_3.pdf"],
    );
    assert.equal(filterPapers(papers, { period: "5" }, rules).length, 1);
    assert.throws(() => filterPapers(papers, { collection: "missing" }, rules));
    assert.throws(() => filterPapers(papers, { module: "CT3*," }, rules));
  });
  it("validates, hashes, resumes and refuses to replace different files", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "exam-library-test-"));
    try {
      const paper = paperFromFilename("2025_2026_CT318_1_1_5.pdf");
      const bytes = Buffer.from("%PDF-1.4\nfixture");
      await assert.rejects(
        storePdf(root, paper, Buffer.from("<html>Sign in</html>")),
        /not a PDF/,
      );
      await storePdf(root, paper, bytes);
      assert.equal(await verifyLocal(root, paper), true);
      await storePdf(root, paper, bytes);
      await assert.rejects(
        storePdf(root, paper, Buffer.from("%PDF-other")),
        /different contents/,
      );
      await saveCatalogue(root, { version: 1, papers: [paper] });
      assert.deepEqual((await readCatalogue(root)).papers, [paper]);
      await writeFile(safePath(root, paper.localPath!), "%PDF-changed");
      assert.equal(await verifyLocal(root, paper), false);
      assert.throws(() => safePath(root, "../outside"));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it("filters exported questions by text and topic with source pages intact", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "exam-question-filter-"));
    try {
      const paper = paperFromFilename("2025_2026_CT318_1_1_5.pdf");
      paper.localPath = pdfPath(paper);
      paper.extractedPath = "extracted/test.json";
      await mkdir(path.join(root, "extracted"));
      await writeFile(
        path.join(root, paper.extractedPath),
        JSON.stringify({
          questions: [
            {
              number: "1",
              pageStart: 2,
              pageEnd: 3,
              text: "Explain TCP congestion",
              topics: ["networks"],
              marksOnHeading: 10,
            },
            {
              number: "2",
              pageStart: 4,
              pageEnd: 4,
              text: "Evaluate an interface",
              topics: ["hci"],
            },
          ],
        }),
      );
      const questions = await readQuestions(root, [paper], "tcp", "NETWORKS");
      assert.equal(questions.length, 1);
      assert.equal(questions[0]?.pageEnd, 3);
      assert.equal(questions[0]?.sourcePdf, paper.localPath);
      await writeFile(
        path.join(root, paper.extractedPath),
        '{"questions":[{"text":false}]}',
      );
      await assert.rejects(readQuestions(root, [paper]), /Invalid question/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it("preserves two archive sources with the same nominal filename and Irish supplements", async () => {
    const base =
      "https://regexam.nuigalway.ie/regexam/paper_index_download.asp?academic_session=2025&paper_code_nominal=CT318-1&assessment_sitting=1&assessment_period=5&exam_paper_master=1&irish_flag=False";
    const root = await mkdtemp(path.join(os.tmpdir(), "exam-identities-"));
    try {
      const papers = [
        base,
        base.replace("master=1", "master=2"),
        base.replace("False", "True"),
      ].map((url) => paperFromLink({ url, title: "HCI" }));
      assert.equal(new Set(papers.map(pdfPath)).size, 3);
      await saveCatalogue(root, { version: 1, papers });
      assert.deepEqual((await readCatalogue(root)).papers, papers);
      await assert.rejects(
        readRules(path.join(root, "missing.json")),
        /not found/,
      );
      await readFile(path.join(root, "catalogue.json"));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
