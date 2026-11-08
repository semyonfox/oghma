// "CT230-Database-Systems-I" or "CT230 Database Systems I" → code + name, display only
const MODULE_CODE = /^([A-Z]{2,4}[0-9]{3,4}[A-Z]?)(?![A-Za-z0-9])[\s:–—-]*/i;

export function splitModuleCode(name: string): { code: string | null; title: string } {
  const match = MODULE_CODE.exec(name.trim());
  if (!match) return { code: null, title: name };
  const title = name.trim().slice(match[0].length).replace(/-/g, " ").trim();
  return title
    ? { code: match[1].toUpperCase(), title }
    : { code: null, title: name };
}
