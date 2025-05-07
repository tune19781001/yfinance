import express from 'express';
import cors from 'cors';
import yahooFinance from 'yahoo-finance2';

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ✅ /stock?symbol=XXXX
app.get('/stock', async (req, res) => {
  const symbol = req.query.symbol;
  if (!symbol) return res.status(400).json({ error: "Missing 'symbol' parameter" });

  try {
    const result = await fetchStockData(symbol);
    res.json(result);
  } catch (err) {
    res.status(500).json({ symbol, price: null, volume: null, rsi: null, ma_5: null, ma_25: null, error: err.message });
  }
});

// ✅ /multi-stock?symbols=AAA,BBB
app.get('/multi-stock', async (req, res) => {
  const symbolsParam = req.query.symbols;
  if (!symbolsParam) return res.status(400).json({ error: "Missing 'symbols' parameter" });

  const symbols = symbolsParam.split(',').map(s => s.trim());
  const results = [];

  for (const symbol of symbols) {
    try {
      const data = await fetchStockData(symbol);
      results.push(data);
    } catch (err) {
      results.push({
        symbol,
        price: null,
        volume: null,
        rsi: null,
        ma_5: null,
        ma_25: null,
        error: err.message
      });
    }
  }

  res.json({ results });
});

// ✅ /score?symbol=XXXX ← New!
app.get('/score', async (req, res) => {
  const symbol = req.query.symbol;
  if (!symbol) return res.status(400).json({ error: "Missing 'symbol' parameter" });

  try {
    const data = await fetchStockData(symbol);

    let score = 0;
    const comments = [];

    // ✅ RSI評価
    if (data.rsi != null) {
      if (data.rsi < 40) {
        score += 5;
        comments.push(`RSIは良好な買い圏（${data.rsi}）`);
      } else if (data.rsi > 70) {
        comments.push(`RSIは過熱気味（${data.rsi}）`);
      } else {
        score += 3;
        comments.push(`RSIは中立〜やや買い圏（${data.rsi}）`);
      }
    } else {
      comments.push("RSIが取得できませんでした");
    }

    // ✅ MA評価
    if (data.price > data.ma_5 && data.ma_5 > data.ma_25) {
      score += 5;
      comments.push("MAは上昇傾向：価格 > MA5 > MA25");
    } else if (data.price < data.ma_5 && data.ma_5 < data.ma_25) {
      comments.push("MAは下降傾向：価格 < MA5 < MA25");
    } else {
      score += 2;
      comments.push("MAは横ばい〜やや崩れ");
    }

    // ✅ 出来高（volume）評価
    if (data.volume != null && data.volume > 10000000) {
      score += 5;
      comments.push("出来高も伴っており注目されている");
    } else if (data.volume != null) {
      score += 3;
      comments.push("出来高は平均程度");
    } else {
      comments.push("出来高情報が取得できませんでした");
    }

    const judgment = score >= 12 ? "買い優勢"
                     : score >= 8 ? "中立～やや買い"
                     : score >= 5 ? "様子見"
                     : "売り警戒";

    res.json({ symbol, score, judgment, comments });

  } catch (err) {
    res.status(500).json({ symbol, score: 0, judgment: "取得失敗", comments: [err.message] });
  }
});

// ✅ /forex?symbol=USDJPY
app.get('/forex', async (req, res) => {
  const symbol = req.query.symbol;
  if (!symbol) return res.status(400).json({ error: "Missing 'symbol' parameter" });

  try {
    const quote = await yahooFinance.quote(symbol + "=X");
    res.json({ symbol, price: quote.regularMarketPrice });
  } catch (err) {
    res.status(500).json({ symbol, price: null, error: err.message });
  }
});

// ✅ /etf
app.get('/etf', async (req, res) => {
  const symbols = ["SPY", "QQQ", "XLK", "ARKK"];
  try {
    const results = await Promise.all(
      symbols.map(async (sym) => {
        const quote = await yahooFinance.quote(sym);
        return {
          symbol: sym,
          price: quote.regularMarketPrice,
          change: quote.regularMarketChange,
          changesPercentage: quote.regularMarketChangePercent,
          previousClose: quote.regularMarketPreviousClose,
        };
      })
    );
    res.json({ etfs: results });
  } catch (err) {
    res.status(500).json({ etfs: [], error: err.message });
  }
});

// 🔧 データ取得ロジック
async function fetchStockData(symbol) {
  const quote = await yahooFinance.quote(symbol);
  const historical = await yahooFinance.historical(symbol, {
    period1: '2024-04-01',
    period2: new Date(),
    interval: '1d',
  });

  const closes = historical.map(d => d.close).filter(v => v != null);

  const price = quote.regularMarketPrice ?? null;
  const volume = quote.regularMarketVolume ?? null;
  const rsi = calcRSI(closes);
  const ma_5 = average(closes.slice(-5));
  const ma_25 = average(closes.slice(-25));

  return { symbol, price, volume, rsi, ma_5, ma_25 };
}

// ➕ 補助関数
function average(arr) {
  const valid = arr.filter(v => v != null);
  return valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
}

function calcRSI(closes) {
  if (closes.length < 15) return null;
  let gains = 0, losses = 0;
  for (let i = closes.length - 15; i < closes.length - 1; i++) {
    const diff = closes[i + 1] - closes[i];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }
  const avgGain = gains / 14;
  const avgLoss = losses / 14;
  if (avgLoss === 0) return 100;
  if (avgGain === 0) return 0;
  const rs = avgGain / avgLoss;
  return Math.round((100 - (100 / (1 + rs))) * 10) / 10;
}

// 🚀 起動
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
