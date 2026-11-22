// "Ved Pawar" / "Ascendion" → "Ved_Pawar" / "Ascendion" (letters and digits only, for any OS).
function filePart(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // é → e
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/(^_|_$)/g, "")
    .slice(0, 40);
}

// Recruiter-friendly name: Ved_Pawar_Resume_Ascendion.pdf. The name comes from the résumé's
// own header ({\Huge \scshape Full Name}); the company is the title's part before " — ".
export function downloadName(latex: string, title: string): string {
  const name = latex.match(/\\Huge\s*\\scshape\s+([^}\\]+)\}/)?.[1]?.trim();
  const company = filePart(title.split(/\s+[—–-]\s+/)[0]);
  const parts = [name && filePart(name), "Resume", company.toLowerCase() !== "resume" && company];
  return parts.filter(Boolean).join("_") + ".pdf";
}
