import type { CanvasAssignment, CanvasClient, CanvasFile } from "./client";
import { canvasIdForBigintColumn } from "./id";

/** Only Canvas file references are importable; never fetch arbitrary description URLs. */
export function assignmentFileIds(assignment: CanvasAssignment, baseUrl: string, courseId: string): string[] {
  const ids = new Set<string>();
  for (const file of assignment.attachments ?? []) {
    ids.add(canvasIdForBigintColumn(file.id, "Canvas file ID"));
  }
  const html = typeof assignment.description === "string" ? assignment.description : "";
  for (const match of html.matchAll(/\b(?:href|src|data-api-endpoint)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) {
    try {
      const value = (match[1] ?? match[2] ?? match[3]).replace(/&amp;/gi, "&");
      const url = new URL(value, baseUrl);
      if (url.origin !== new URL(baseUrl).origin) continue;
      const filePath = url.pathname.match(/^\/(?:api\/v1\/)?(?:courses\/(\d+)\/)?files\/(\d+)(?:\/(?:download|preview))?\/?$/);
      if (!filePath || (filePath[1] && filePath[1] !== courseId)) continue;
      ids.add(canvasIdForBigintColumn(filePath[2], "Canvas file ID"));
    } catch {
      // Malformed or external links remain available in the original instructions.
    }
  }
  return [...ids];
}

export interface AssignmentMaterialFile {
  id: string;
  file: CanvasFile | null;
  unavailable: boolean;
}

export async function discoverAssignmentMaterials(
  client: Pick<CanvasClient, "baseUrl" | "getFile">,
  courseId: string,
  assignment: CanvasAssignment,
): Promise<AssignmentMaterialFile[]> {
  const ids = assignmentFileIds(assignment, `${client.baseUrl.replace(/\/api\/v1$/, "")}/courses/${courseId}/assignments/${assignment.id}`, courseId);
  const materials: AssignmentMaterialFile[] = [];
  // Serial requests respect Canvas request-cost throttling.
  for (const id of ids) {
    const result = await client.getFile(courseId, id);
    if (result.error && !result.forbidden) throw new Error("Could not load assignment materials from Canvas");
    const file = result.data;
    materials.push({ id, file, unavailable: !file || result.forbidden || file.locked_for_user === true || file.hidden_for_user === true });
  }
  return materials;
}
