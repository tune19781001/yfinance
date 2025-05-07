import express from 'express';
import cors from 'cors';
import yahooFinance from 'yahoo-finance2';

const app = express();
const port = process.env.PORT;
if (!port) throw new Error("PORT environment variable not set");

app.use(cors());
app.use(express.json());

// /stock
app.get('/stock', async (req, res) => {
  const symbol = req.query.symbol;
  if (!symbol) return res.status(400).json({ error: "Missing 'symbol' parameter" });

  try {
    const result = await fetchStockData(symbol);
    res.json(result);
  } catch (err) {
    res.status(500).json({ symbol, error: err.message });
  }
});

// /multi-stock
app.get('/multi-stock', async (req, res) => {
  const symbols = (req.query.symbols || "").split(',').map(s => s.trim());
  const results = [];

  for (const symbol of symbols) {
    try {
      const data = await fetchStockData(symbol);
      results.push(data);
    } catch (err) {
      results.push({ symbol, error: err.message });
    }
  }

  res.json({ results });
});

// /score
app.get('/score', async (req, res) => {
  const symbol = req.query.symbol;
  if (!symbol) return res.status(400).json({ error: "Missing 'symbol' parameter" });

  try {
    const data = await fetchStockData(symbol);
    let score = 0;
    const comments = [];

    if (data.rsi < 40) {
      score += 5;
      comments.push(`RSIは良好な買い圏（${data.rsi}）`);
    } else if (data.rsi > 70) {
      comments.push(`RSIは過熱気味（${data.rsi}）`);
    } else {
      score += 3;
      comments.push(`RSIは中立〜やや買い圏（${data.rsi}）`);
    }

    if (data.price > data.ma_5 && data.ma_5 > data.ma_25) {
      score += 5;
      comments.push("MAは上昇傾向：価格 > MA5 > MA25");
    } else if (data.price < data.ma_5 && data.ma_5 < data.ma_25) {
      comments.push("MAは下降傾向：価格 < MA5 < MA25");
    } else {
      score += 2;
      comments.push("MAは横ばい〜やや崩れ");
    }

    if (data.volume > 10000000) {
      score += 5;
      comments.push("出来高も伴っており注目されている");
    } else {
      score += 3;
      comments.push("出来高は平均程度");
    }

    const judgment = score >= 12 ? "買い優勢" :
                     score >= 8 ? "中立～やや買い" :
                     score >= 5 ? "様子見" : "売り警戒";

    res.json({ ...data, score, judgment, comments });

  } catch (err) {
    res.status(500).json({ symbol, score: 0, judgment: "取得失敗", comments: [err.message] });
  }
});

// /trend（NEW）
app.get('/trend', async (req, res) => {
  const symbols = (req.query.symbols || "").split(',').map(s => s.trim());
  const results = [];

  for (const symbol of symbols) {
    try {
      const data = await fetchStockData(symbol);
      let trend = "横ばい";

      if (data.price > data.ma_5 && data.ma_5 > data.ma_25) {
        trend = "上昇傾向";
      } else if (data.price < data.ma_5 && data.ma_5 < data.ma_25) {
        trend = "下降傾向";
      }

      results.push({
        symbol,
        price: data.price,
        ma_5: data.ma_5,
        ma_25: data.ma_25,
        trend
      });
    } catch (err) {
      results.push({ symbol, error: err.message });
    }
  }

  res.json({ results });
});

// /forex
app.get('/forex', async (req, res) => {
  const symbol = req.query.symbol;
  if (!symbol) return res.status(400).json({ error: "Missing 'symbol' parameter" });

  try {
    const quote = await yahooFinance.quote(symbol + "=X");
    res.json({ symbol, price: quote.regularMarketPrice });
  } catch (err) {
    res.status(500).json({ symbol, error: err.message });
  }
});

// /etf
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
          previousClose: quote.regularMarketPreviousClose
        };
      })
    );
    res.json({ etfs: results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 共通データ取得ロジック
async function fetchStockData(symbol) {
  const quote = await yahooFinance.quote(symbol);
  const historical = await yahooFinance.historical(symbol, {
    period1: '2024-04-01',
    period2: new Date(),
    interval: '1d'
  });

  const closes = historical.map(d => d.close).filter(v => v != null);

  const price = quote.regularMarketPrice ?? null;
  const volume = quote.regularMarketVolume ?? null;
  const rsi = calcRSI(closes);
  const ma_5 = average(closes.slice(-5));
  const ma_25 = average(closes.slice(-25));

  return { symbol, price, volume, rsi, ma_5, ma_25 };
}

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

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
// ...（上部はそのまま）

// /multi-score（NEW）
app.get('/multi-score', async (req, res) => {
  const symbols = (req.query.symbols || "").split(',').map(s => s.trim());
  const results = [];

  for (const symbol of symbols) {
    try {
      const data = await fetchStockData(symbol);
      let score = 0;
      const comments = [];

      if (data.rsi < 40) {
        score += 5;
        comments.push(`RSIは良好な買い圏（${data.rsi}）`);
      } else if (data.rsi > 70) {
        comments.push(`RSIは過熱気味（${data.rsi}）`);
      } else {
        score += 3;
        comments.push(`RSIは中立〜やや買い圏（${data.rsi}）`);
      }

      if (data.price > data.ma_5 && data.ma_5 > data.ma_25) {
        score += 5;
        comments.push("MAは上昇傾向：価格 > MA5 > MA25");
      } else if (data.price < data.ma_5 && data.ma_5 < data.ma_25) {
        comments.push("MAは下降傾向：価格 < MA5 < MA25");
      } else {
        score += 2;
        comments.push("MAは横ばい〜やや崩れ");
      }

      if (data.volume > 10000000) {
        score += 5;
        comments.push("出来高も伴っており注目されている");
      } else {
        score += 3;
        comments.push("出来高は平均程度");
      }

      const judgment = score >= 12 ? "買い優勢"
                       : score >= 8 ? "中立～やや買い"
                       : score >= 5 ? "様子見"
                       : "売り警戒";

      results.push({
        ...data,
        score,
        judgment,
        comments
      });

    } catch (err) {
      results.push({
        symbol,
        error: err.message
      });
    }
  }

  res.json({ results });
});
