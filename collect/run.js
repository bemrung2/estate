/*
 * One round of collecting: every watched 단지 · 평형 gets a snapshot for the
 * current slot.
 *
 * It is safe to run twice — a snapshot is keyed by (watch, slot), so a second
 * run in the same half-day replaces the first rather than adding to it.
 */
const SOURCES = { zigbang: require("./zigbang.js"), naver: require("./naver.js") };

const KST = 9 * 3600 * 1000;

/* the half-day `when` falls in, in Korean time: "2026-11-11T00" | "…T12" */
function slotOf(when) {
  const k = new Date((when || new Date()).getTime() + KST);
  return k.toISOString().slice(0, 10) + (k.getUTCHours() < 12 ? "T00" : "T12");
}

function stats(listings) {
  const prices = listings.map((l) => l.price).filter((p) => p > 0).sort((a, b) => a - b);
  if (!prices.length) return { count: listings.length, min_price: null, med_price: null, max_price: null };
  const mid = prices.length >> 1;
  return {
    count: listings.length,
    min_price: prices[0],
    med_price: prices.length % 2 ? prices[mid] : Math.round((prices[mid - 1] + prices[mid]) / 2),
    max_price: prices[prices.length - 1]
  };
}

const pause = (ms) => new Promise((done) => setTimeout(done, ms));

/*
 * opts.only         collect just these watch ids
 * opts.onlyMissing  leave a watch alone if this slot already has its snapshot
 *                   (a newly added watch gets its first numbers right away,
 *                   without overwriting what the schedule recorded)
 */
async function run(data, opts) {
  opts = opts || {};
  const slot = slotOf(opts.now);
  let watches = await data.watches();
  if (opts.only) watches = watches.filter((w) => opts.only.indexOf(w.id) >= 0);

  /* one request per 단지 · 거래 — its 평형s are split out of the same answer */
  const groups = {};
  for (const w of watches) {
    if (opts.onlyMissing && (await data.snapshot(w.id, slot))) continue;
    const key = [w.source, w.complex_id, w.trade].join("|");
    (groups[key] = groups[key] || []).push(w);
  }

  const report = { slot, saved: 0, failed: [] };
  let first = true;
  for (const key of Object.keys(groups)) {
    const group = groups[key];
    const head = group[0];
    try {
      const source = SOURCES[head.source];
      if (!source) throw new Error("unknown source " + head.source);
      if (!first) await pause(400);          /* 남의 서버다 — 몰아치지 않는다 */
      first = false;
      const cat = await source.catalog(head.complex_id, head.trade);
      const taken = new Date().toISOString();
      for (const w of group) {
        const listings = cat.listings
          .filter((l) => l.type === w.room_type_id)
          .map(({ type, complexName, ...rest }) => rest)
          .sort((a, b) => a.price - b.price);
        await data.putSnapshot({ watch_id: w.id, slot, taken_at: taken, ...stats(listings), listings });
        report.saved++;
      }
    } catch (e) {
      report.failed.push({ complex: head.complex_name, error: String(e.message || e).slice(0, 200) });
    }
  }
  return report;
}

module.exports = { run, slotOf, stats, SOURCES };
