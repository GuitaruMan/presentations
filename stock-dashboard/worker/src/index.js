/**
 * Stock Dashboard Worker
 * 프론트엔드(정적 GitHub Pages)가 호출하는 서버리스 백엔드.
 * API 키(NAVER, ANTHROPIC)는 전부 여기 env(secret)에만 존재하고 브라우저에는 노출되지 않는다.
 *
 * Endpoints:
 *   GET  /search?q=          종목 검색 (한국/미국 공통, Yahoo Finance)
 *   GET  /quote?symbol=      현재가 + 최근 20거래일 OHLCV
 *   GET  /news?symbol=&name= 관련 뉴스 (한국: 네이버 뉴스 화이트리스트 필터 / 해외: Yahoo Finance 뉴스)
 *   POST /analysis           전문가·AI 종합 분석 (Claude API)
 */

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// [[feedback_news_source_restriction]] 화이트리스트 — 통신사/경제지/증권사만 허용
const NEWS_WHITELIST = [
  "yna.co.kr", "newsis.com", "news1.kr",
  "hankyung.com", "markets.hankyung.com", "mk.co.kr", "mt.co.kr",
  "biz.chosun.com", "edaily.co.kr", "fnnews.com", "sedaily.com", "biz.heraldcorp.com",
  "invest.truefriend.com", "file.truefriend.com",
  "invest.kiwoom.com", "bbn.kiwoom.com", "home.imeritz.com", "samsungpop.com",
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

// ---------- /search ----------
async function handleSearch(query) {
  const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=10&newsCount=0&lang=ko-KR&region=KR`;
  const data = await yahooFetch(url);
  const quotes = (data.quotes || [])
    .filter((q) => q.quoteType === "EQUITY" && q.symbol)
    .map((q) => ({
      symbol: q.symbol,
      name: q.longname || q.shortname || q.symbol,
      exchange: q.exchDisp || q.exchange || "",
      market: marketOf(q.symbol),
    }));
  return { results: quotes };
}

// ---------- /quote ----------
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
  };
}

// ---------- /news ----------
function stripHtml(s) {
  return (s || "").replace(/<[^>]+>/g, "").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&#39;/g, "'");
}

async function handleNewsKR(name, env) {
  const url = `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(name)}&display=30&sort=date`;
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

// ---------- /analysis ----------
async function handleAnalysis(body, env) {
  const { symbol, name, market, price, changePercent, candles = [], news = [] } = body;

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
      model: "claude-opus-4-8",
      max_tokens: 1500,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium" },
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
  return {
    text: textBlock ? textBlock.text : "",
    generatedAt: new Date().toISOString(),
  };
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

      if (url.pathname === "/news" && request.method === "GET") {
        const symbol = url.searchParams.get("symbol") || "";
        const name = url.searchParams.get("name") || symbol;
        const market = marketOf(symbol);
        const result = market === "KR" ? await handleNewsKR(name, env) : await handleNewsForeign(name || symbol);
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
