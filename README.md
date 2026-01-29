# Stock Watcher - Stream Deck Plugin

Display real-time stock quotes on your Stream Deck!

## Features

- 📈 Real-time stock price display
- 🔄 Auto-refresh at configurable intervals (2s, 5s, 15s, 30s, 1min, 5min, 10min)
- 📊 Shows price, change, and percentage change
- ▲▼ Color-coded up/down indicators (green/red)
- ☀️🥐🌗🌙 Market status indicators (regular, pre-market, post-market, closed)

## Installation

1. Download the latest `com.simonpoirier.stockwatcher.streamDeckPlugin` file from the [Releases](https://github.com/simonpoirier/StockWatcher/releases) page
2. Double-click the file to install it in Stream Deck

## Configuration

1. Drag the **Stock Quote** action to a Stream Deck button
2. In the property inspector, enter:
   - **Stock Symbol**: The ticker symbol (e.g., MSFT, AAPL, GOOGL)
   - **API Key**: Your Finnhub API key
   - **Refresh Interval**: How often to update the price

### Getting a Finnhub API Key

1. Go to [finnhub.io](https://finnhub.io/)
2. Sign up for a free account
3. Copy your API key from the dashboard
4. Paste it in the plugin settings

> **Note:** The free Finnhub tier allows 60 API calls per minute. Using very short refresh intervals with multiple stocks may hit this limit.

## Display Format

The button displays:
```
MSFT      ☀️
423.38     ▲
-57.26 -12.05%
```

- Stock symbol with market status emoji
- Current price with colored arrow (green ▲ / red ▼)
- Change amount and percentage

## License

MIT
