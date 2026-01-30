# Stock Watcher - Stream Deck Plugin

Display real-time stock quotes on your Stream Deck!

## Features

- 📈 Real-time stock price display (including pre-market and after-hours)
- 🔄 Auto-refresh at configurable intervals (2s, 5s, 15s, 30s, 1min, 5min, 10min)
- 📊 Shows price, change, and percentage change from previous close
- ▲▼ Color-coded up/down indicators (green/red)
- ☀️🥐🌗🌙 Market status indicators (regular, pre-market, post-market, closed)

## Installation

1. Download the latest `com.simonpoirier.stockwatcher.streamDeckPlugin` file from the [Releases](https://github.com/simonpoirier/StockWatcher/releases) page
2. Double-click the file to install it in Stream Deck

## Configuration

1. Drag the **Stock Quote** action to a Stream Deck button
2. In the property inspector, enter:
   - **Stock Symbol**: The ticker symbol (e.g., MSFT, AAPL, GOOGL)
   - **Refresh Interval**: How often to update the price

## Display Format

The button displays:
```
MSFT      ☀️
423.38     ▲
-57.26 -12.05%
```

- Stock symbol with market status emoji
- Current price with colored arrow (green ▲ / red ▼)
- Change amount and percentage from previous close

### Market Status Indicators

- ☀️ Regular market hours
- 🥐 Pre-market (4:00 AM - 9:30 AM ET)
- 🌗 After-hours (4:00 PM - 8:00 PM ET)
- 🌙 Market closed

## Data Source

This plugin uses Yahoo Finance for stock data. No API key is required.

## License

MIT
