/**
 * Signs in as each demo account and counts duo and pod results from /api/match.
 * Passes when every viewer has at least 2 of each and at least one related_tag reason shows up.
 * WRITES match_events (shown), so run it against the LOCAL stack only:
 *
 *   npx supabase db reset && <dev server on :3000 pointed at local Supabase>
 *   LOCAL=1 npx tsx scripts/check-demo-matches.ts
 */
const BASE = process.env.BASE ?? "http://localhost:3000";
if (process.env.LOCAL !== "1") {
  console.error("Refusing to run: it writes match_events. Point the dev server at LOCAL Supabase, then set LOCAL=1.");
  process.exit(2);
}

type Reason = { kind: string };
type Result = { reasons?: Reason[] };

async function main() {
  const demos = (await (await fetch(`${BASE}/api/auth/demo-profiles`)).json()) as { id: string; full_name: string }[];
  let related = 0;
  let ok = demos.length > 0;
  console.log("viewer".padEnd(24), "duo".padStart(4), "pods".padStart(5));
  for (const d of demos) {
    const sw = await fetch(`${BASE}/api/auth/switch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "demo", userId: d.id }),
    });
    const cookie = (sw.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
    const counts: number[] = [];
    for (const kind of ["duo", "pods"]) {
      const res = await fetch(`${BASE}/api/match?kind=${kind}`, { headers: { Cookie: cookie } });
      const body = (await res.json()) as { results?: Result[]; code?: string };
      const results = body.results ?? [];
      counts.push(results.length);
      related += results.filter((r) => r.reasons?.some((x) => x.kind === "related_tag")).length;
      if (!res.ok) console.log(`  ${d.full_name} ${kind}: HTTP ${res.status} ${body.code ?? ""}`);
    }
    if (counts[0] < 2 || counts[1] < 2) ok = false;
    console.log(d.full_name.padEnd(24), String(counts[0]).padStart(4), String(counts[1]).padStart(5));
  }
  console.log(`results with a related_tag reason: ${related}`);
  if (related < 1) ok = false;
  console.log(ok ? "PASS" : "FAIL");
  process.exit(ok ? 0 : 1);
}
void main();
