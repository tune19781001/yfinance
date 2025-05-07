import express from 'express';
import cors from 'cors';
import yahooFinance from 'yahoo-finance2';

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ✅ GET /stock?symbol=AAPL
app.get('/stock', async (req, res) => {
  const symbol = req.query.symbol;
  if (!symbol) {
    return res.status(400).json({ error: "Missing 'symbol' parameter" });
  }

  try {
    const quote = await yahooFinance.quoteSummary(symbol, { modules: ['price', 'summaryDetail'] });

    // ✅ historical APIを使用
    const historical = await yahooFinance.historical(symbol, {
      period1: '2024-04-01',
      period2: new Date(),
      interval: '1d',
    });

    const closes = historical.map(d => d.close).filter(v => v != null);

    const price = quote.price?.regularMarketPrice ?? null;
    const volume = quote.price?.regularMarketVolume ?? null;
    const rsi = calcRSI(closes);
    const ma_5 = average(closes.slice(-5));
    const ma_25 = average(closes.slice(-25));

    res.json({ symbol, price, volume, rsi, ma_5, ma_25 });
  } catch (err) {
    res.status(500).json({
      symbol,
      price: null,
      volume: null,
      rsi: null,
      ma_5: null,
      ma_25: null,
      error: err.message,
    });
  }
});

// ✅ GET /forex?symbol=USDJPY
app.get('/forex', async (req, res) => {
  const symbol = req.query.symbol;
  if (!symbol) {
    return res.status(400).json({ error: "Missing 'symbol' parameter" });
  }

  try {
    const quote = await yahooFinance.quote(symbol + "=X");
    res.json({ symbol, price: quote.regularMarketPrice });
  } catch (err) {
    res.status(500).json({ symbol, price: null, error: err.message });
  }
});

// ✅ GET /etf
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

// ➕ 補助関数
function average(arr) {
  const valid = arr.filter(v => v != null);
  return valid.length > 0
    ? valid.reduce((a, b) => a + b, 0) / valid.length
    : null;
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
