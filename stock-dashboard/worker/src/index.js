/**
 * Stock Dashboard Worker
 * 프론트엔드(정적 GitHub Pages)가 호출하는 서버리스 백엔드.
 * API 키(NAVER, ANTHROPIC)는 전부 여기 env(secret)에만 존재하고 브라우저에는 노출되지 않는다.
 *
 * Endpoints:
 *   GET  /search?q=          종목 검색 (한국/미국 공통, Yahoo Finance)
 *   GET  /quote?symbol=      현재가 + 최근 20거래일 OHLCV + 증권가 목표주가/투자의견
 *   GET  /financials?symbol= 최근 4개년 연간 재무 정보 (매출/영업이익/순이익/자본/부채/FCF)
 *   GET  /news?symbol=&name= 관련 뉴스 (한국: 네이버 뉴스 화이트리스트 필터 / 해외: Yahoo Finance 뉴스)
 *   POST /analysis           전문가·AI 종합 분석 (Claude API)
 */

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// [[feedback_news_source_restriction]] 화이트리스트 — 통신사/경제지/증권사만 허용
// mk.co.kr(매일경제)은 제외 — 같은 도메인 경로로 매경스포츠/연예 기사(mksports.co.kr로 리다이렉트되는 것 포함)가
// 섞여 들어와 종목과 무관한 가십성 기사가 다수 노출되는 문제가 있었다.
const NEWS_WHITELIST = [
  "yna.co.kr", "newsis.com", "news1.kr",
  "hankyung.com", "markets.hankyung.com", "mt.co.kr",
  "biz.chosun.com", "edaily.co.kr", "fnnews.com", "sedaily.com", "biz.heraldcorp.com",
  "asiae.co.kr", "news.einfomax.co.kr", "wowtv.co.kr", "ajunews.com",
  // 증권사 리서치/뉴스
  "invest.truefriend.com", "file.truefriend.com",
  "invest.kiwoom.com", "bbn.kiwoom.com", "kiwoom.com",
  "home.imeritz.com", "samsungpop.com",
  "nhqv.com", "miraeassetsecurities.com", "kbsec.com", "hanaw.com",
  "meritz.co.kr", "koreainvestment.com", "kiscred.co.kr",
  "thebell.co.kr", "dealsite.co.kr", "smarttoday.co.kr",
  "kind.krx.co.kr",
];

function corsHeaders(origin, env) {
  const allowed = (env.ALLOWED_ORIGIN || "").split(",").map((s) => s.trim()).filter(Boolean);
  const allowOrigin = allowed.includes(origin) ? origin : allowed[0] || "*";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-App-Key",
    "Vary": "Origin",
  };
}

function json(data, origin, env, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders(origin, env) },
  });
}

function marketOf(symbol) {
  if (/\.(KS|KQ)$/i.test(symbol)) return "KR";
  return "US";
}

async function yahooFetch(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
  if (!res.ok) throw new Error(`yahoo fetch failed: ${res.status} ${url}`);
  return res.json();
}

// Yahoo Finance의 quoteSummary / fundamentals-timeseries API는 crumb(쿠키+토큰) 인증을 요구한다.
// 실패해도 호출부에서 crumb 없이 시도할 수 있도록 예외를 던지지 않고 null을 반환한다.
function extractCookie(res) {
  const setCookies = res.headers.getSetCookie
    ? res.headers.getSetCookie()
    : [res.headers.get("set-cookie")].filter(Boolean);
  return setCookies.map((c) => c.split(";")[0]).join("; ");
}

async function getYahooCrumb() {
  try {
    // getcrumb는 쿠키 없이 콜드로 호출하면 401 "Invalid Cookie"를 반환하므로,
    // 먼저 fc.yahoo.com에 방문해 세션 쿠키(A3 등)를 얻은 뒤 그 쿠키로 getcrumb를 호출해야 한다.
    const preRes = await fetch("https://fc.yahoo.com", { headers: { "User-Agent": UA } });
    const preCookie = extractCookie(preRes);

    const res = await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", {
      headers: { "User-Agent": UA, ...(preCookie ? { Cookie: preCookie } : {}) },
    });
    const cookie2 = extractCookie(res);
    const cookie = [preCookie, cookie2].filter(Boolean).join("; ");
    const crumb = (await res.text()).trim();
    if (!crumb || !cookie) return { crumb: null, cookie: null };
    return { crumb, cookie };
  } catch {
    return { crumb: null, cookie: null };
  }
}

// ---------- /search ----------
// 네이버 증권 자동완성 → Yahoo Finance 심볼로 매핑.
// 한국(KOSPI/KOSDAQ)과 해외 종목을 한 소스로 처리하며 한글 검색을 지원한다.
const EXCHANGE_SUFFIX = {
  KOSPI: ".KS", KOSDAQ: ".KQ",
  TOKYO: ".T", HONGKONG: ".HK", HK: ".HK",
  SHANGHAI: ".SS", SHENZHEN: ".SZ", LONDON: ".L", LSE: ".L",
};

function naverToYahoo(item) {
  const code = item.code;
  const type = (item.typeCode || "").toUpperCase();
  const nation = (item.nationCode || "").toUpperCase();
  if (nation === "KOR") {
    return { symbol: code + (type === "KOSDAQ" ? ".KQ" : ".KS"), market: "KR" };
  }
  if (nation === "USA") {
    return { symbol: code, market: "US" }; // NASDAQ/NYSE: 접미사 없음
  }
  const suf = EXCHANGE_SUFFIX[type];
  return { symbol: suf ? code + suf : code, market: "FOREIGN" };
}

async function handleSearch(query) {
  const url = `https://ac.stock.naver.com/ac?q=${encodeURIComponent(query)}&target=stock,index`;
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
  if (!res.ok) throw new Error(`naver ac fetch failed: ${res.status}`);
  const data = await res.json();
  const seen = new Set();
  const results = [];
  for (const item of data.items || []) {
    if (item.category !== "stock") continue;
    const { symbol, market } = naverToYahoo(item);
    if (seen.has(symbol)) continue;
    seen.add(symbol);
    results.push({
      symbol,
      name: item.name,
      exchange: item.typeName || item.typeCode || "",
      nation: item.nationName || "",
      market,
    });
    if (results.length >= 10) break;
  }
  return { results };
}

// ---------- /quote ----------
function pickRaw(field) {
  if (field == null) return null;
  if (typeof field === "object") return field.raw ?? null;
  return field;
}

async function fetchAnalystInfo(symbol) {
  const fields = {
    targetMeanPrice: null,
    targetHighPrice: null,
    targetLowPrice: null,
    targetMedianPrice: null,
    recommendationKey: null,
    recommendationMean: null,
    numberOfAnalystOpinions: null,
    trailingPE: null,
    forwardPE: null,
    dividendYield: null,
    payoutRatio: null,
    priceToBook: null,
    pegRatio: null,
  };
  try {
    const { crumb, cookie } = await getYahooCrumb();
    const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=financialData,defaultKeyStatistics,summaryDetail${crumb ? `&crumb=${encodeURIComponent(crumb)}` : ""}`;
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    });
    if (!res.ok) throw new Error(`yahoo fetch failed: ${res.status} ${url}`);
    const data = await res.json();
    const result = data.quoteSummary && data.quoteSummary.result && data.quoteSummary.result[0];
    if (!result) return fields;

    const financialData = result.financialData || {};
    const summaryDetail = result.summaryDetail || {};
    const defaultKeyStatistics = result.defaultKeyStatistics || {};

    fields.targetMeanPrice = pickRaw(financialData.targetMeanPrice);
    fields.targetHighPrice = pickRaw(financialData.targetHighPrice);
    fields.targetLowPrice = pickRaw(financialData.targetLowPrice);
    fields.targetMedianPrice = pickRaw(financialData.targetMedianPrice);
    fields.recommendationKey = pickRaw(financialData.recommendationKey);
    fields.recommendationMean = pickRaw(financialData.recommendationMean);
    fields.numberOfAnalystOpinions = pickRaw(financialData.numberOfAnalystOpinions);

    fields.trailingPE = pickRaw(summaryDetail.trailingPE);
    fields.forwardPE = pickRaw(summaryDetail.forwardPE);
    fields.dividendYield = pickRaw(summaryDetail.dividendYield);
    fields.payoutRatio = pickRaw(summaryDetail.payoutRatio);

    fields.priceToBook = pickRaw(defaultKeyStatistics.priceToBook);
    fields.pegRatio = pickRaw(defaultKeyStatistics.pegRatio);

    return fields;
  } catch {
    return fields;
  }
}

async function handleQuote(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1mo&interval=1d`;
  const data = await yahooFetch(url);
  const result = data.chart && data.chart.result && data.chart.result[0];
  if (!result) throw new Error("no chart data for symbol");

  const meta = result.meta;
  const timestamps = result.timestamp || [];
  const q = result.indicators.quote[0] || {};

  const candles = timestamps
    .map((t, i) => {
      const close = q.close ? q.close[i] : null;
      if (close == null) return null; // 미확정/결측일 제외 (임의 수치 채우지 않음)
      return {
        date: new Date(t * 1000).toISOString().slice(0, 10),
        open: q.open ? q.open[i] : null,
        high: q.high ? q.high[i] : null,
        low: q.low ? q.low[i] : null,
        close,
        volume: q.volume ? q.volume[i] : null,
      };
    })
    .filter(Boolean)
    .slice(-20); // 최근 20거래일

  const price = meta.regularMarketPrice;
  const prevClose = meta.chartPreviousClose ?? meta.previousClose;
  const change = price != null && prevClose != null ? price - prevClose : null;
  const changePercent = change != null && prevClose ? (change / prevClose) * 100 : null;

  const analystInfo = await fetchAnalystInfo(symbol);

  return {
    symbol,
    name: meta.longName || meta.shortName || symbol,
    currency: meta.currency,
    exchange: meta.fullExchangeName || meta.exchangeName,
    price,
    prevClose,
    change,
    changePercent,
    dayHigh: meta.regularMarketDayHigh,
    dayLow: meta.regularMarketDayLow,
    fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh,
    fiftyTwoWeekLow: meta.fiftyTwoWeekLow,
    marketTime: meta.regularMarketTime ? new Date(meta.regularMarketTime * 1000).toISOString() : null,
    candles,
    ...analystInfo,
  };
}

// ---------- /financials ----------
async function handleFinancials(symbol) {
  const empty = {
    symbol,
    years: [],
    revenue: [],
    operatingIncome: [],
    netIncome: [],
    equity: [],
    debt: [],
    freeCashFlow: [],
  };
  try {
    const types = "annualTotalRevenue,annualOperatingIncome,annualNetIncome,annualStockholdersEquity,annualTotalDebt,annualFreeCashFlow";
    const { crumb, cookie } = await getYahooCrumb();
    // period1=0(1970-01-01)은 Yahoo API가 결과를 비워서 반환하므로 실제 존재 가능한 과거 시점을 써야 한다.
    const period1 = Math.floor(new Date("2000-01-01").getTime() / 1000);
    const period2 = Math.floor(Date.now() / 1000);
    const url = `https://query2.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(symbol)}?type=${types}&period1=${period1}&period2=${period2}${crumb ? `&crumb=${encodeURIComponent(crumb)}` : ""}`;
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    });
    if (!res.ok) throw new Error(`yahoo fetch failed: ${res.status} ${url}`);
    const data = await res.json();
    const results = (data.timeseries && data.timeseries.result) || [];

    const typeToKey = {
      annualTotalRevenue: "revenue",
      annualOperatingIncome: "operatingIncome",
      annualNetIncome: "netIncome",
      annualStockholdersEquity: "equity",
      annualTotalDebt: "debt",
      annualFreeCashFlow: "freeCashFlow",
    };

    // year -> { revenue, operatingIncome, ... }
    const byYear = new Map();
    const yearSet = new Set();

    for (const item of results) {
      const metaType = item.meta && item.meta.type && item.meta.type[0];
      const key = typeToKey[metaType];
      if (!key) continue;
      const entries = item[metaType] || [];
      for (const entry of entries) {
        if (!entry || !entry.asOfDate) continue;
        const year = entry.asOfDate.slice(0, 4);
        yearSet.add(year);
        if (!byYear.has(year)) byYear.set(year, {});
        byYear.get(year)[key] = pickRaw(entry.reportedValue);
      }
    }

    const years = Array.from(yearSet).sort().slice(-4);
    const out = { symbol, years };
    for (const key of Object.values(typeToKey)) {
      out[key] = years.map((y) => (byYear.get(y) && byYear.get(y)[key] != null ? byYear.get(y)[key] : null));
    }
    return out;
  } catch {
    return empty;
  }
}

// ---------- /news ----------
function stripHtml(s) {
  return (s || "").replace(/<[^>]+>/g, "").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&#39;/g, "'");
}

async function handleNewsKR(name, env) {
  const url = `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(name)}&display=50&sort=date`;
  const res = await fetch(url, {
    headers: {
      "X-Naver-Client-Id": env.NAVER_CLIENT_ID,
      "X-Naver-Client-Secret": env.NAVER_CLIENT_SECRET,
    },
  });
  if (!res.ok) throw new Error(`naver news fetch failed: ${res.status}`);
  const data = await res.json();
  const items = (data.items || [])
    .map((it) => {
      let host = "";
      try {
        host = new URL(it.originallink || it.link).hostname.replace(/^www\./, "");
      } catch {
        host = "";
      }
      return {
        title: stripHtml(it.title),
        description: stripHtml(it.description),
        url: it.originallink || it.link,
        source: host,
        date: it.pubDate,
      };
    })
    .filter((it) => NEWS_WHITELIST.some((domain) => it.source.endsWith(domain)))
    // 화이트리스트 매체라도 종목명이 본문 주제와 무관하게 스쳐 지나가듯 언급된 기사가 섞여든다.
    // 제목 또는 설명에 종목명이 실제로 등장하는 기사만 남겨 관련도를 높인다.
    .filter((it) => it.title.includes(name) || it.description.includes(name))
    .slice(0, 12);
  return { items, sourceType: "naver" };
}

async function handleNewsForeign(query) {
  const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=0&newsCount=12`;
  const data = await yahooFetch(url);
  const items = (data.news || []).map((n) => ({
    title: n.title,
    description: "",
    url: n.link,
    source: n.publisher || "",
    date: n.providerPublishTime ? new Date(n.providerPublishTime * 1000).toISOString() : null,
  }));
  return { items, sourceType: "yahoo" };
}

// ---------- AI 분석 캐시 세션 판정 ----------
// 장 마감 시간대(KST 기준, [[project_stock_dashboard]] 참고)에는 데이터가 갱신되지 않으므로
// 굳이 Claude API를 다시 호출하지 않고 같은 세션의 캐시를 재사용해 토큰을 절약한다.
// 국내: KST 19:00~05:00(다음날) 마감 / 해외: KST 08:00~20:00 마감.
// 마감 구간에 새로 진입한 뒤 그 세션에서의 첫 조회는 캐시가 없으므로 자연히 1회 갱신된다.
function kstNow() {
  // Workers 런타임은 시스템 tz가 UTC이므로 KST(UTC+9)를 직접 더해 계산한다.
  return new Date(Date.now() + 9 * 60 * 60 * 1000);
}

function analysisSession(market) {
  const now = kstNow();
  const hour = now.getUTCHours(); // kstNow는 이미 KST로 shift된 Date이므로 getUTCHours가 KST 시각
  const dateStr = now.toISOString().slice(0, 10);

  const isKR = market === "KR";
  const closeStart = isKR ? 19 : 20; // 마감 시작 시각(KST)
  const closeEnd = isKR ? 5 : 8;     // 마감 종료 시각(다음날, KST)

  const isClosed = hour >= closeStart || hour < closeEnd;
  if (!isClosed) {
    // 장중: 캐시를 쓰지 않고 매번 갱신
    return { cacheable: false, sessionId: null };
  }

  // 마감 세션의 대표 날짜: 자정 넘어 이어지는 새벽 시간대(hour < closeEnd)는
  // 전날 저녁부터 시작된 같은 마감 세션이므로 하루 전 날짜로 묶는다.
  let sessionDate = dateStr;
  if (hour < closeEnd) {
    const prev = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    sessionDate = prev.toISOString().slice(0, 10);
  }
  return { cacheable: true, sessionId: `${market}:${sessionDate}` };
}

// ---------- /analysis ----------
async function handleAnalysis(body, env) {
  const { symbol, name, market, price, changePercent, candles = [], news = [] } = body;

  const session = analysisSession(market);
  const cacheKey = session.cacheable ? `analysis:${symbol}:${session.sessionId}` : null;

  if (cacheKey && env.ANALYSIS_CACHE) {
    const cached = await env.ANALYSIS_CACHE.get(cacheKey, "json");
    if (cached) return { ...cached, cached: true };
  }

  const candleSummary = candles.length
    ? `최근 ${candles.length}거래일: ${candles[0].date} 종가 ${candles[0].close} → ${candles[candles.length - 1].date} 종가 ${candles[candles.length - 1].close} (기간 등락 ${(((candles[candles.length - 1].close - candles[0].close) / candles[0].close) * 100).toFixed(2)}%)`
    : "가격 데이터 없음";

  const newsBlock = news.length
    ? news.slice(0, 10).map((n, i) => `${i + 1}. [${n.source || "출처불명"}] ${n.title}`).join("\n")
    : "관련 뉴스 없음";

  const system = `당신은 신중하고 데이터에 근거해 말하는 증권 분석가입니다. 아래 규칙을 반드시 지키세요.
- 제공된 가격 데이터와 뉴스 목록 밖의 사실을 창작하지 않습니다. 뉴스에 없는 목표주가·실적 수치를 지어내지 않습니다.
- 목표주가나 투자의견을 언급할 때는 반드시 어느 뉴스에서 나온 내용인지 근거를 함께 밝힙니다. 뉴스에 그런 언급이 없으면 "최근 뉴스에서 구체적인 목표주가 언급은 확인되지 않았다"고 정직하게 씁니다.
- 매수/매도를 직접 권유하지 않고, 강세 요인과 약세 요인을 균형 있게 제시한 뒤 신중한 종합 판단으로 마무리합니다.
- 한국어로, 3~4개 짧은 단락으로 작성합니다. 마크다운 헤더(#) 없이 일반 문단으로만 씁니다.`;

  const userMsg = `종목: ${name} (${symbol}, ${market === "KR" ? "한국" : "해외"} 시장)
현재가: ${price ?? "-"}  최근 등락률: ${changePercent != null ? changePercent.toFixed(2) + "%" : "-"}
${candleSummary}

최근 관련 뉴스:
${newsBlock}

위 정보를 바탕으로 "전문가·AI 종합 분석" 섹션에 들어갈 글을 작성해줘. 뉴스에서 언급된 증권사 목표주가·투자의견이 있으면 반드시 인용하고, 없으면 없다고 명시해.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1500,
      system,
      messages: [{ role: "user", content: userMsg }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`claude api failed: ${res.status} ${errText}`);
  }
  const data = await res.json();
  if (data.stop_reason === "refusal") {
    return { text: "AI 분석이 정책상의 이유로 생성되지 않았습니다.", generatedAt: new Date().toISOString() };
  }
  const textBlock = (data.content || []).find((b) => b.type === "text");
  const result = {
    text: textBlock ? textBlock.text : "",
    generatedAt: new Date().toISOString(),
  };

  if (cacheKey && env.ANALYSIS_CACHE) {
    // 마감 세션이 끝나는 시점(최대 24시간 후) 이후엔 자동 만료되도록 TTL을 넉넉히 둔다.
    await env.ANALYSIS_CACHE.put(cacheKey, JSON.stringify(result), { expirationTtl: 60 * 60 * 24 });
  }
  return result;
}

// ---------- router ----------
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders(origin, env) });
    }

    // 방어는 CORS(허용된 Origin만 브라우저에서 응답을 읽을 수 있음) 하나로 한정한다.
    // 정적 페이지에서는 클라이언트 코드에 넣은 값이 진짜 비밀일 수 없으므로,
    // "비밀키로 막는 척"하는 대신 이 경계를 정직하게 유일한 방어선으로 삼는다.

    try {
      if (url.pathname === "/search" && request.method === "GET") {
        const q = url.searchParams.get("q") || "";
        if (!q.trim()) return json({ results: [] }, origin, env);
        return json(await handleSearch(q), origin, env);
      }

      if (url.pathname === "/quote" && request.method === "GET") {
        const symbol = url.searchParams.get("symbol") || "";
        if (!symbol) return json({ error: "symbol required" }, origin, env, 400);
        return json(await handleQuote(symbol), origin, env);
      }

      if (url.pathname === "/financials" && request.method === "GET") {
        const symbol = url.searchParams.get("symbol") || "";
        if (!symbol) return json({ error: "symbol required" }, origin, env, 400);
        return json(await handleFinancials(symbol), origin, env);
      }

      if (url.pathname === "/news" && request.method === "GET") {
        const symbol = url.searchParams.get("symbol") || "";
        const name = url.searchParams.get("name") || symbol;
        const market = marketOf(symbol);
        // 해외 종목은 name이 한글 표기(예: "엔비디아")일 수 있어 Yahoo 검색에 맞지 않는다.
        // 티커 심볼 자체로 검색해야 안정적으로 뉴스가 잡힌다.
        const result = market === "KR" ? await handleNewsKR(name, env) : await handleNewsForeign(symbol.replace(/\.[A-Z]+$/, ""));
        return json(result, origin, env);
      }

      if (url.pathname === "/analysis" && request.method === "POST") {
        const body = await request.json();
        return json(await handleAnalysis(body, env), origin, env);
      }

      return json({ error: "not found" }, origin, env, 404);
    } catch (err) {
      return json({ error: String(err && err.message ? err.message : err) }, origin, env, 500);
    }
  },
};
