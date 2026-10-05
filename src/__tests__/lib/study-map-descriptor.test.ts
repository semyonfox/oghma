import { describe, expect, it } from "vitest";
import {
  buildCourseOutline,
  moduleCode,
  parseDescriptor,
} from "@/lib/study-map/descriptor";

// trimmed from the real universityofgalway.ie module page markup
const page = (
  body: string,
) => `<html><head><style>.x{}</style><script>var a = "<p>";</script></head><body>
<nav>Courses</nav><h1>Course Module Information</h1><h2>Course Modules</h2>${body}
<p>The above information outlines module CT230: "Database Systems I" and is valid from 2024 onwards.</p>
<footer>About University of Galway</footer></body></html>`;

describe("public module descriptors", () => {
  it("reads the module code from an imported Canvas course folder", () => {
    expect(moduleCode("CT230-Database-Systems-I")).toBe("CT230");
    expect(moduleCode("ct2109 data structures")).toBe("CT2109");
    expect(moduleCode("Untitled-Course")).toBeNull();
    expect(moduleCode("CT2106OOP")).toBeNull();
  });

  it("turns description, learning outcomes and assessment into Markdown", () => {
    const markdown = parseDescriptor(
      page(`<h3>CT230: Database Systems I</h3><p>Semester 1 | Credits: 5</p>
<p>An introductory course to database systems &amp; SQL programming.</p>
<p>(Language of instruction: English)</p>
<h4>Learning Outcomes</h4><ul><li>Use Relational Algebra for retrieval</li><li>Program using SQL</li></ul>
<h4>Assessments</h4><ul><li>Written Assessment (80%)</li><li>Continuous Assessment (20%)</li></ul>
<h4>Teachers &amp; Administrators</h4><p>JOSEPHINE GRIFFITH</p>`),
      "CT230",
    );
    expect(markdown).toBe(
      [
        "# CT230: Database Systems I",
        "Semester 1 | Credits: 5",
        "An introductory course to database systems & SQL programming.",
        "## Learning outcomes\n\n- Use Relational Algebra for retrieval\n- Program using SQL",
        "## Assessment\n\n- Written Assessment (80%)\n- Continuous Assessment (20%)",
        "Source: https://www.universityofgalway.ie/course-information/module/CT230",
      ].join("\n\n"),
    );
    expect(markdown).not.toContain("GRIFFITH");
  });

  it("returns nothing when a module only lists its assessment split", () => {
    expect(
      parseDescriptor(
        page(`<h3>MA190: Mathematics (Honours)</h3><p>Semester 1 and Semester 2 | Credits: 10</p>
<h4>Assessments</h4><ul><li>Written Assessment (100%)</li></ul>`),
        "MA190",
      ),
    ).toBeNull();
    expect(
      parseDescriptor(page("<p>Module not found</p>"), "XX999"),
    ).toBeNull();
  });

  it("combines the descriptor, Canvas pages and module list into one outline", () => {
    const outline = buildCourseOutline({
      title: "CT230",
      descriptor:
        "# CT230: Database Systems I\n\nSemester 1\n\n## Learning outcomes\n\n- Program using SQL",
      syllabus: "Weekly plan: SQL, then normalisation.",
      frontPage:
        "NOTE: Do not publish your course with this resource as the home page!",
      modules: ["Introduction", "Normalisation", "Query Processing"],
    });
    expect(outline).toBe(
      [
        "# CT230 course outline",
        "## Module descriptor\n\nSemester 1\n\n### Learning outcomes\n\n- Program using SQL",
        "## Canvas syllabus\n\nWeekly plan: SQL, then normalisation.",
        "## Canvas modules\n\n- Introduction\n- Normalisation\n- Query Processing",
      ].join("\n\n"),
    );
  });

  it("needs real course information, not a Canvas template or a couple of folders", () => {
    expect(
      buildCourseOutline({
        title: "CT999",
        descriptor: null,
        syllabus: "  ",
        frontPage:
          "NOTE: Do not publish your course with this resource as the home page!",
        modules: ["Lab 1", "Lab 2"],
      }),
    ).toBeNull();
  });
});
