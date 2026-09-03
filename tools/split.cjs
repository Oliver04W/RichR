/* One-off: split src/RichR.jsx into modules. Usage: node tools/split.cjs [--write]
   Every top-level declaration is assigned to a module (MODULES below); each
   module exports all its declarations and imports exactly what it references.
   Prints eager cross-module references that could bite under circular imports. */
const fs = require("fs");
const path = require("path");
const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;

const SRC = path.join(__dirname, "..", "src", "RichR.jsx");
const src = fs.readFileSync(SRC, "utf8");
const ast = parser.parse(src, { sourceType: "module", plugins: ["jsx"], attachComment: true });

// ---- module assignment ----
const M = {
  "lib/format.js": "CURRENCIES TYPES DATE_LOCALE fmtDate fmtTime fmtDateTime priceStaleness sym money moneyShort pct daysHeld DEFAULT_FX fxConvert uid slug timeAgo clamp01 round6 pctOf daysOld withTimeout TICKER_RE extractTickers",
  "lib/portfolio.js": "PROFILES profileOf VERDICTS SAMPLE seed holdingValue byValueDesc cleanHolding editHolding removeHoldings setHoldingShares addHoldingShares portfolioTotals socialStats SHARE_ITEMS shareOf SCORE_WEIGHTS computeScore explainScoreChange SCORE_LABEL scoreTone winningStreak diffHoldingsEvents publishBoard perfTheme periodReturn idxOnOrBefore BENCHMARKS DEFAULT_BENCH benchOf histCache holdingsKey loadDailySeries PH_RANGES PH_SERVICE_RANGE cutSeries EXCHANGE_BY_SUFFIX exchangeOf isFund",
  "lib/storage.js": "dataKey loadLocal saveLocal loadCloud saveCloud watchTicker aiFetch",
  "ui/primitives.jsx": "TICKER_DOMAINS guessDomain BRAND_COLORS hashColor Logo Ret Skeleton StatCard MetricCard BottomSheet AVATAR_BG Avatar ConfirmDialog Stepper RowMenu SwipeRow Sparkline MEDAL ChartTip",
  "features/social.jsx": "SOCIAL_ME _mutual mutualIdsCached NAME_CACHE useNames loadMutualFriends REACTIONS eventText PostBody",
  "features/sentiment.jsx": "VOTE_META VOTE_ORDER latestCalls activeCalls useReturnsSince VoteChip SentimentBar MIN_SAMPLE STALE_DAYS SENT_CACHE sentimentBus fetchSentiment useSentiment tallyAfterVote VOTE_CHAIN castVote removeVote SentimentRows WeekDelta VoteButtons SentimentCard ScopeSummary HIST_RANGES SentimentHistory SentimentMini DiscoverSentiment RecheckCalls StockSocial CallsList",
  "features/feed.jsx": "FEED_CACHE HomeFeed ChatCard CardPicker ActivityFeed",
  "features/communities.jsx": "useMyCommunities VIS_META visOf isDiscoverable canSelfJoin VisChip parseTopics communityMatches inviteUrl fmtMembers CommunityCard GroupsTab InviteSheet looksLikeTicker TopicInput NewGroupModal GroupChat CommunityHoldings CommunitySentiment PositionShareCard SharePositionPicker MembersSheet",
  "features/create.jsx": "CREATE_ACTIONS CreateMenu CreatePostSheet TransactionSheet",
  "features/holdings.jsx": "PositionsTab WatchCard PositionCard QuickEditSheet SharesSheet EditPortfolio PositionModal DetailSheet",
  "features/import.jsx": "OK_TYPES isCsvFile CSV_TEMPLATE CSV_HEADERS parseCsvNumber parseCsvText parseHoldingsCsv ImportModal",
  "features/home.jsx": "HomeTab IdentityStrip PortfolioCard Standing HoldingsPreview BenchPicker PeriodReturns OnboardingCard ScoreCard FriendsBenchmark MoversCard ALLOC_COLORS AllocationCard GoalsSection GoalModal PerformanceChart PortfolioHistorySheet",
  "features/friends.jsx": "FriendsTab FriendsSwitcher",
  "features/profile.jsx": "TAB_LABEL OwnPortfolioCard ProfileTab ProfileSheet buildShareCardBlob roundRect shareProfileCard ShareCardPreview PublicProfile",
  "features/research.jsx": "ResearchTab PriceChart CompanyInfoCard AiThesisCard ThesesTab",
  "features/insights.jsx": "InsightsTab RiskView IMPACT NewsView",
};
const moduleOf = Object.create(null);
for (const [file, names] of Object.entries(M)) for (const n of names.split(/\s+/)) moduleOf[n] = file;

// ---- collect top-level declarations ----
const externalImports = Object.create(null); // localName -> { source, imported }
const decls = [];           // { names:[], node, start, end, module }
const body = ast.program.body;
let mainNode = null, helpersNode = null;
for (let i = 0; i < body.length; i++) {
  const n = body[i];
  if (n.type === "ImportDeclaration") {
    for (const s of n.specifiers) externalImports[s.local.name] = { source: n.source.value, imported: s.type === "ImportDefaultSpecifier" ? "default" : s.imported.name };
    continue;
  }
  let names = [], d = n;
  if (n.type === "ExportDefaultDeclaration") { mainNode = n; continue; }
  if (n.type === "ExportNamedDeclaration") d = n.declaration;
  if (d.type === "FunctionDeclaration" || d.type === "ClassDeclaration") names = [d.id.name];
  else if (d.type === "VariableDeclaration") names = d.declarations.map((v) => v.id.name);
  else throw new Error("unexpected top-level " + n.type + " at line " + n.loc.start.line);
  if (names[0] === "__helpers") { helpersNode = n; continue; }
  // slice start: earliest leading comment that begins after the previous statement ended
  const prevEnd = i > 0 ? body[i - 1].end : 0;
  let start = n.start;
  for (const c of n.leadingComments || []) if (c.start >= prevEnd && c.start < start) start = c.start;
  const mod = moduleOf[names[0]];
  if (!mod) throw new Error("no module for " + names[0] + " (line " + n.loc.start.line + ")");
  decls.push({ names, node: d, start, end: n.end, module: mod, exported: n.type === "ExportNamedDeclaration" });
}
const topNames = new Set(decls.flatMap((d) => d.names));

// ---- references ----
function refsOf(node, { eagerOnly = false } = {}) {
  const ids = new Set();
  traverse(node, {
    noScope: true,
    Function(p) { if (eagerOnly) p.skip(); },
    Identifier(p) { ids.add(p.node.name); },
    JSXIdentifier(p) { ids.add(p.node.name); },
  }, undefined, undefined);
  return ids;
}
// traverse() wants a File/Program; wrap
function refsOfNode(n, opts) {
  const file = { type: "File", program: { type: "Program", body: [n.type === "FunctionDeclaration" || n.type === "VariableDeclaration" || n.type === "ClassDeclaration" ? n : { type: "ExpressionStatement", expression: n }], sourceType: "module", directives: [] } };
  const ids = new Set();
  traverse(file, {
    Function(p) { if (opts && opts.eagerOnly) p.skip(); },
    Identifier(p) { ids.add(p.node.name); },
    JSXIdentifier(p) { ids.add(p.node.name); },
  });
  return ids;
}

const files = {};
for (const file of Object.keys(M)) files[file] = { decls: [], refs: new Set(), eager: new Set() };
for (const d of decls) {
  files[d.module].decls.push(d);
  for (const r of refsOfNode(d.node)) files[d.module].refs.add(r);
  if (d.node.type === "VariableDeclaration") for (const r of refsOfNode(d.node, { eagerOnly: true })) files[d.module].eager.add(r);
}

// ---- emit ----
const rel = (from, to) => { let r = path.relative(path.dirname("src/" + from), "src/" + to).replace(/\\/g, "/"); if (!r.startsWith(".")) r = "./" + r; return r; };
function importsFor(file, refs, own) {
  const ext = {}, internal = {};
  for (const r of refs) {
    if (own.has(r)) continue;
    if (externalImports[r]) { const e = externalImports[r]; (ext[e.source] = ext[e.source] || []).push(r); }
    else if (topNames.has(r)) { const m = moduleOf[r]; if (m !== file) (internal[m] = internal[m] || []).push(r); }
  }
  const lines = [];
  for (const [source, names] of Object.entries(ext)) {
    const def = names.find((n) => externalImports[n].imported === "default");
    const named = names.filter((n) => n !== def).sort();
    const src2 = source === "./supabase" ? (file === "RichR.jsx" ? "./supabase" : rel(file, "supabase")) : source;
    lines.push(`import ${def ? def + (named.length ? ", " : "") : ""}${named.length ? `{ ${named.join(", ")} }` : ""} from "${src2}";`);
  }
  for (const [m, names] of Object.entries(internal).sort()) lines.push(`import { ${[...new Set(names)].sort().join(", ")} } from "${rel(file, m)}";`);
  return lines.join("\n");
}
const banner = "/* Split out of RichR.jsx — see tools/split.cjs. Keep modules small; shared pure helpers live in lib/. */\n";
const out = {};
for (const [file, info] of Object.entries(files)) {
  const own = new Set(info.decls.flatMap((d) => d.names));
  let code = "";
  for (const d of info.decls) {
    let text = src.slice(d.start, d.end);
    if (!d.exported) {
      // add export to the declaration itself (after leading comments)
      const declOffset = d.node.start - d.start;
      text = text.slice(0, declOffset) + "export " + text.slice(declOffset);
    }
    code += text + "\n\n";
  }
  // eager cross-module references (potential circular-import TDZ)
  for (const r of info.eager) if (topNames.has(r) && moduleOf[r] !== file && !own.has(r)) console.log(`EAGER ${file}: ${r} from ${moduleOf[r]}`);
  out[file] = banner + importsFor(file, info.refs, own) + "\n\n" + code.trimEnd() + "\n";
}
// main file: RichR component + __helpers + re-export PublicProfile
const mainRefs = new Set([...refsOfNode(mainNode.declaration), ...refsOfNode(helpersNode.declaration)]);
const mainText = src.slice(mainNode.start, mainNode.end);
const helpersText = src.slice(helpersNode.start, helpersNode.end);
out["RichR.jsx"] = "/* RichR — main app shell. Feature code lives in src/features/*, shared helpers in src/lib/*, UI atoms in src/ui/*. */\n" +
  importsFor("RichR.jsx", mainRefs, new Set(["RichR"])) + "\n\nexport { PublicProfile } from \"./features/profile.jsx\";\n\n" + mainText + "\n\n/* Pure helpers exposed for unit tests only (see src/*.test.js). */\n" + helpersText + "\n";

// dependency graph summary
const graph = {};
for (const [file, info] of Object.entries(files)) {
  const own = new Set(info.decls.flatMap((d) => d.names));
  graph[file] = [...new Set([...info.refs].filter((r) => topNames.has(r) && !own.has(r)).map((r) => moduleOf[r]))].sort();
}
console.log(JSON.stringify(graph, null, 1));
if (process.argv.includes("--write")) {
  for (const [file, text] of Object.entries(out)) { const p = path.join(__dirname, "..", "src", file); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text); }
  console.log("written", Object.keys(out).length, "files");
}
