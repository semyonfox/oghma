(async () => {
  const origin = "https://regexam.nuigalway.ie";
  const bridge = "http://127.0.0.1:18763";
  if (location.origin !== origin)
    throw new Error("Open the Galway exam archive before connecting");
  if (window.examLibraryConnected)
    throw new Error("This tab is already connected");
  window.examLibraryConnected = true;
  const allowed = new Set([
    "paper_index_search_form.asp",
    "paper_index_search_results.asp",
    "paper_index_download.asp",
  ]);
  console.log("Exam library connected. Keep this archive tab open.");
  try {
    while (window.examLibraryConnected) {
      const next = await fetch(bridge + "/next", { credentials: "omit" });
      if (next.status === 204) {
        await new Promise((r) => setTimeout(r, 500));
        continue;
      }
      if (!next.ok) throw new Error("Local bridge is unavailable");
      const job = await next.json();
      let result;
      try {
        const url = new URL(job.url);
        if (
          url.origin !== origin ||
          !url.pathname.startsWith("/regexam/") ||
          !allowed.has(url.pathname.split("/").pop())
        )
          throw new Error("Unsupported archive URL");
        const response = await fetch(url, {
          method: job.body === undefined ? "GET" : "POST",
          ...(job.body === undefined
            ? {}
            : { body: new URLSearchParams(job.body) }),
          credentials: "same-origin",
          redirect: job.kind === "pdf" ? "follow" : "error",
          signal: AbortSignal.timeout(60000),
        });
        if (!response.ok) throw new Error(`Archive HTTP ${response.status}`);
        if (new URL(response.url).origin !== origin)
          throw new Error("Archive session expired; sign in again");
        if (job.kind === "pdf") {
          const bytes = new Uint8Array(await response.arrayBuffer());
          if (bytes.length > 32 * 1024 * 1024)
            throw new Error("PDF exceeds 32 MiB");
          if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-")
            throw new Error(
              "Archive returned a non-PDF; sign in again or refresh the scan",
            );
          let binary = "";
          for (let i = 0; i < bytes.length; i += 8192)
            binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
          result = { bytes: btoa(binary) };
        } else {
          const doc = new DOMParser().parseFromString(
            await response.text(),
            "text/html",
          );
          if (job.kind === "form") {
            const years = Array.from(
              doc.querySelectorAll('select[name="ay_1"] option'),
              (o) => o.value,
            ).filter(Boolean);
            if (!years.length)
              throw new Error("Archive form not found; sign in again");
            result = { years };
          } else {
            const text = doc.body.textContent.replace(/\s+/g, " ");
            const totalMatch = text.match(/Total matches found:\s*([\d,]+)/i);
            const limited = text.match(
              /Your query returned:\s*([\d,]+) matches/i,
            );
            if (limited) {
              result = {
                total: Number(limited[1].replaceAll(",", "")),
                limited: true,
                rows: [],
                papers: [],
              };
            } else {
              if (
                !totalMatch &&
                !/no (?:matching |matches|records|papers|results)/i.test(text)
              )
                throw new Error(
                  "Unrecognised archive results; sign in again or inspect the page",
                );
              const rows = Array.from(doc.querySelectorAll("tr")).filter(
                (row) =>
                  /^\d{4}\/\d{4}$/.test(row.cells[0]?.textContent.trim() ?? ""),
              );
              const papers = rows.flatMap((row) =>
                Array.from(
                  row.querySelectorAll('a[href*="paper_index_download.asp"]'),
                  (link) => ({
                    url: new URL(link.getAttribute("href"), response.url).href,
                    title: row.cells[2]?.textContent.trim() ?? "",
                    code: row.cells[1]?.textContent.trim() ?? "",
                  }),
                ),
              );
              result = {
                total: totalMatch
                  ? Number(totalMatch[1].replaceAll(",", ""))
                  : 0,
                limited: false,
                rows: rows.map((row) =>
                  Array.from(row.cells)
                    .slice(0, 6)
                    .map((cell) => cell.textContent.trim())
                    .join("|"),
                ),
                papers,
              };
            }
          }
        }
      } catch (error) {
        result = {
          error:
            error instanceof Error ? error.message : "Archive request failed",
        };
      }
      const sent = await fetch(bridge + "/result/" + job.id, {
        method: "POST",
        credentials: "omit",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(result),
      });
      if (!sent.ok) throw new Error("Local bridge rejected a result");
    }
  } catch (error) {
    console.error(
      "Exam library disconnected:",
      error instanceof Error ? error.message : "Connection failed",
    );
  } finally {
    window.examLibraryConnected = false;
  }
})();
