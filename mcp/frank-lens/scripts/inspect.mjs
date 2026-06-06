#!/usr/bin/env node

import { listLenses, getTickerLens, buildFrankContext } from "../dist/methodology.js";

const lenses = listLenses();
const tickerLens = getTickerLens({ ticker: "NVDA" });
const context = buildFrankContext({
  question: "按 Frank 框架看 NVDA 是杀估值、杀业绩还是杀逻辑？",
  ticker: "NVDA",
});

console.log(JSON.stringify({
  counts: lenses.counts,
  nvdaCoverage: tickerLens.coverage,
  selectedLensCount: context.selected_lenses.length,
  firstSelectedLens: context.selected_lenses[0]?.key,
}, null, 2));
