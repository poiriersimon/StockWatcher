import streamDeck, {
    action,
    KeyDownEvent,
    SingletonAction,
    WillAppearEvent,
    WillDisappearEvent,
    DidReceiveSettingsEvent,
} from "@elgato/streamdeck";

const YAHOO_CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart";

// Unified quote interface for display
interface StockQuote {
    symbol: string;
    price: number;           // Current/latest price (includes extended hours)
    previousClose: number;   // Previous day close
    change: number;          // Change from previous close
    changePercent: number;   // Percent change from previous close
    marketState: "PRE" | "REGULAR" | "POST" | "CLOSED";
}

interface YahooChartResponse {
    chart: {
        result: Array<{
            meta: {
                symbol: string;
                regularMarketPrice: number;
                previousClose: number;
                regularMarketTime: number;
                currentTradingPeriod?: {
                    pre?: { start: number; end: number };
                    regular?: { start: number; end: number };
                    post?: { start: number; end: number };
                };
            };
            timestamp?: number[];
            indicators?: {
                quote: Array<{
                    close: (number | null)[];
                }>;
            };
        }>;
        error: any;
    };
}

type Settings = {
    symbol?: string;
    apiKey?: string;  // Kept for backwards compatibility, not used with Yahoo
    refreshInterval?: string;
};

async function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry(
    url: string,
    options: RequestInit = {},
    maxRetries: number = 3,
    initialDelay: number = 1000
): Promise<Response> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const response = await fetch(url, {
            ...options,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                ...options.headers,
            },
        });

        if (response.ok) {
            return response;
        }

        if (response.status === 429) {
            if (attempt < maxRetries) {
                const delay = initialDelay * Math.pow(2, attempt);
                streamDeck.logger.info(`Rate limited (429). Retrying in ${delay}ms... (attempt ${attempt + 1}/${maxRetries})`);
                await sleep(delay);
                lastError = new Error("Rate limit exceeded");
                continue;
            }
            throw new Error("Rate limit exceeded after maximum retries");
        }

        throw new Error(`Request failed: ${response.status} ${response.statusText}`);
    }

    throw lastError || new Error("Request failed");
}

function determineMarketState(meta: YahooChartResponse['chart']['result'][0]['meta']): StockQuote['marketState'] {
    const now = Math.floor(Date.now() / 1000);
    const tradingPeriod = meta.currentTradingPeriod;

    if (!tradingPeriod) return "CLOSED";

    if (tradingPeriod.pre && now >= tradingPeriod.pre.start && now < tradingPeriod.pre.end) {
        return "PRE";
    }
    if (tradingPeriod.regular && now >= tradingPeriod.regular.start && now < tradingPeriod.regular.end) {
        return "REGULAR";
    }
    if (tradingPeriod.post && now >= tradingPeriod.post.start && now < tradingPeriod.post.end) {
        return "POST";
    }
    return "CLOSED";
}

function getLatestPriceFromCandles(result: YahooChartResponse['chart']['result'][0]): number | null {
    const timestamps = result.timestamp;
    const quotes = result.indicators?.quote?.[0];

    if (!timestamps || !quotes?.close) return null;

    // Find the last non-null close price
    for (let i = timestamps.length - 1; i >= 0; i--) {
        if (quotes.close[i] !== null) {
            return quotes.close[i];
        }
    }
    return null;
}

async function getYahooQuote(symbol: string): Promise<StockQuote> {
    const url = `${YAHOO_CHART_URL}/${symbol}?interval=1m&range=1d&includePrePost=true`;
    
    const response = await fetchWithRetry(url);
    const data = await response.json() as YahooChartResponse;

    if (data.chart.error) {
        throw new Error(`Yahoo API Error: ${JSON.stringify(data.chart.error)}`);
    }

    const result = data.chart.result?.[0];
    if (!result) {
        throw new Error("No data returned from Yahoo Finance");
    }

    const meta = result.meta;
    const marketState = determineMarketState(meta);
    
    // Get the latest price - use candle data for extended hours, otherwise regular market price
    let price: number;
    if (marketState === "PRE" || marketState === "POST") {
        const latestCandle = getLatestPriceFromCandles(result);
        price = latestCandle ?? meta.regularMarketPrice;
    } else {
        price = meta.regularMarketPrice;
    }

    const previousClose = meta.previousClose;
    const change = price - previousClose;
    const changePercent = (change / previousClose) * 100;

    return {
        symbol: meta.symbol,
        price,
        previousClose,
        change,
        changePercent,
        marketState,
    };
}

function getMarketEmoji(marketState: StockQuote['marketState']): string {
    switch (marketState) {
        case "PRE":
            return "🥐";  // Pre-market
        case "REGULAR":
            return "☀️";  // Regular market
        case "POST":
            return "🌗";  // Post-market
        case "CLOSED":
        default:
            return "🌙";  // Closed
    }
}

function generateStockImage(
    symbol: string,
    marketEmoji: string,
    arrow: string,
    price: string,
    change: string,
    changePercent: string,
    isPositive: boolean
): string {
    const arrowColor = isPositive ? "#00ff00" : "#ff4444";
    const changeColor = isPositive ? "#00ff00" : "#ff4444";
    
    const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
            <rect width="144" height="144" fill="#000000"/>
            <text x="8" y="42" font-family="Arial, sans-serif" font-size="32" fill="#ffffff" font-weight="bold">${symbol}</text>
            <text x="136" y="42" font-family="Arial, sans-serif" font-size="22" text-anchor="end">${marketEmoji}</text>
            <text x="8" y="80" font-family="Arial, sans-serif" font-size="28" fill="#ffffff">${price}</text>
            <text x="136" y="80" font-family="Arial, sans-serif" font-size="28" fill="${arrowColor}" text-anchor="end">${arrow}</text>
            <text x="8" y="115" font-family="Arial, sans-serif" font-size="18" fill="${changeColor}">${change} ${changePercent}%</text>
        </svg>
    `;
    
    return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

@action({ UUID: "com.simonpoirier.stockwatcher.quote" })
export class StockQuoteAction extends SingletonAction<Settings> {
    private refreshIntervals: Map<string, ReturnType<typeof setInterval>> = new Map();

    /**
     * Start or restart the refresh interval for an action
     */
    private startRefreshInterval(actionId: string, settings: Settings): void {
        // Clear any existing interval
        const existingInterval = this.refreshIntervals.get(actionId);
        if (existingInterval) {
            clearInterval(existingInterval);
            streamDeck.logger.info(`Cleared existing interval for ${actionId}`);
        }

        const refreshMs = parseInt(settings.refreshInterval || "60000", 10);
        streamDeck.logger.info(`Starting refresh interval: ${refreshMs}ms for ${actionId}`);
        
        const interval = setInterval(async () => {
            streamDeck.logger.info(`Refresh timer fired for ${actionId}`);
            const action = streamDeck.actions.getActionById(actionId);
            if (action) {
                const currentSettings = await action.getSettings() as Settings;
                await this.updateDisplay(actionId, currentSettings);
            }
        }, refreshMs);
        this.refreshIntervals.set(actionId, interval);
    }

    /**
     * Called when the action appears on Stream Deck
     */
    override async onWillAppear(ev: WillAppearEvent<Settings>): Promise<void> {
        const { settings } = ev.payload;
        const actionId = ev.action.id;

        streamDeck.logger.info(`onWillAppear for ${actionId}`);

        // Update immediately
        await this.updateDisplay(actionId, settings);

        // Set up periodic refresh
        this.startRefreshInterval(actionId, settings);
    }

    /**
     * Called when the action disappears from Stream Deck
     */
    override onWillDisappear(ev: WillDisappearEvent<Settings>): void {
        const actionId = ev.action.id;
        const interval = this.refreshIntervals.get(actionId);
        if (interval) {
            clearInterval(interval);
            this.refreshIntervals.delete(actionId);
        }
    }

    /**
     * Called when settings are changed in the property inspector
     */
    override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<Settings>): Promise<void> {
        const actionId = ev.action.id;
        const settings = ev.payload.settings;
        
        streamDeck.logger.info(`Settings received: ${JSON.stringify(settings)}`);
        
        // Update display immediately
        await this.updateDisplay(actionId, settings);
        
        // Restart the refresh interval with new settings
        this.startRefreshInterval(actionId, settings);
    }

    /**
     * Called when user presses the key - force refresh
     */
    override async onKeyDown(ev: KeyDownEvent<Settings>): Promise<void> {
        const actionId = ev.action.id;
        const settings = ev.payload.settings;
        
        streamDeck.logger.info(`Key pressed for action ${actionId}`);
        streamDeck.logger.info(`Current settings: ${JSON.stringify(settings)}`);
        
        // Force set a title immediately to confirm the action works
        const action = streamDeck.actions.getActionById(actionId);
        if (action) {
            await action.setTitle("Loading...");
            streamDeck.logger.info(`Set loading title for ${actionId}`);
        }
        
        await this.updateDisplay(actionId, settings);
    }

    /**
     * Update the display with current stock data
     */
    private async updateDisplay(actionId: string, settings: Settings): Promise<void> {
        const { symbol } = settings;
        const action = streamDeck.actions.getActionById(actionId);

        streamDeck.logger.info(`updateDisplay called for ${actionId}`);
        streamDeck.logger.info(`Symbol: ${symbol}`);

        if (!action) {
            streamDeck.logger.error(`Action not found: ${actionId}`);
            return;
        }

        if (!symbol) {
            streamDeck.logger.info(`Missing symbol - showing setup required`);
            await action.setTitle("Setup\nRequired");
            return;
        }

        try {
            streamDeck.logger.info(`Fetching quote for ${symbol}...`);
            
            const quote = await getYahooQuote(symbol.toUpperCase());
            
            streamDeck.logger.info(`Quote received: ${JSON.stringify(quote)}`);
            
            const marketEmoji = getMarketEmoji(quote.marketState);
            const price = quote.price.toFixed(2);
            const arrow = quote.change >= 0 ? "▲" : "▼";
            const change = quote.change.toFixed(2);
            const changePercent = quote.changePercent.toFixed(2);
            const isPositive = quote.change >= 0;

            // Generate SVG image with different font sizes per line
            const imageData = generateStockImage(
                symbol.toUpperCase(),
                marketEmoji,
                arrow,
                price,
                change,
                changePercent,
                isPositive
            );
            
            streamDeck.logger.info(`Setting image for ${symbol}`);
            await action.setImage(imageData);
            await action.setTitle("");  // Clear title since we're using image
            
            streamDeck.logger.info(`Updated ${symbol}: $${price} (${change}, ${quote.marketState})`);
        } catch (error: any) {
            streamDeck.logger.error(`Error fetching ${symbol}: ${error?.message || error}`);
            await action.setTitle(`${symbol}\nError`);
            await action.showAlert();
        }
    }
}
