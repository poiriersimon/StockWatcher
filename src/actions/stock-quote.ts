import streamDeck, {
    action,
    KeyDownEvent,
    SingletonAction,
    WillAppearEvent,
    WillDisappearEvent,
    DidReceiveSettingsEvent,
} from "@elgato/streamdeck";

const BASE_URL = "https://finnhub.io/api/v1";

interface Quote {
    c: number;  // Current price
    d: number;  // Change
    dp: number; // Percent change
    h: number;  // High price of the day
    l: number;  // Low price of the day
    o: number;  // Open price of the day
    pc: number; // Previous close price
    t: number;  // Timestamp
}

interface MarketStatus {
    exchange: string;
    holiday: string | null;
    isOpen: boolean;
    session: string;
    timezone: string;
    t: number;
}

type Settings = {
    symbol?: string;
    apiKey?: string;
    refreshInterval?: string;
};

async function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithBackoff<T>(
    url: string,
    maxRetries: number = 3,
    initialDelay: number = 1000
): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const response = await fetch(url);

        if (response.ok) {
            return response.json() as Promise<T>;
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

        throw new Error(`Request failed: ${response.statusText}`);
    }

    throw lastError || new Error("Request failed");
}

async function getQuote(symbol: string, apiKey: string): Promise<Quote> {
    return fetchWithBackoff<Quote>(
        `${BASE_URL}/quote?symbol=${symbol}&token=${apiKey}`
    );
}

async function getMarketStatus(apiKey: string, exchange: string = "US"): Promise<MarketStatus> {
    return fetchWithBackoff<MarketStatus>(
        `${BASE_URL}/stock/market-status?exchange=${exchange}&token=${apiKey}`
    );
}

function getMarketEmoji(status: MarketStatus): string {
    if (!status.isOpen) {
        return "🌙";  // Closed
    }
    
    switch (status.session) {
        case "pre-market":
            return "🥐";  // Pre-market
        case "regular":
            return "☀️";  // Regular market
        case "post-market":
            return "🌗";  // Post-market
        default:
            return "📊";
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
        const { symbol, apiKey } = settings;
        const action = streamDeck.actions.getActionById(actionId);

        streamDeck.logger.info(`updateDisplay called for ${actionId}`);
        streamDeck.logger.info(`Symbol: ${symbol}, API Key present: ${!!apiKey}`);

        if (!action) {
            streamDeck.logger.error(`Action not found: ${actionId}`);
            return;
        }

        if (!symbol || !apiKey) {
            streamDeck.logger.info(`Missing settings - showing setup required`);
            await action.setTitle("Setup\nRequired");
            return;
        }

        try {
            streamDeck.logger.info(`Fetching quote for ${symbol}...`);
            
            const [quote, marketStatus] = await Promise.all([
                getQuote(symbol.toUpperCase(), apiKey),
                getMarketStatus(apiKey)
            ]);
            
            streamDeck.logger.info(`Quote received: ${JSON.stringify(quote)}`);
            
            const marketEmoji = getMarketEmoji(marketStatus);
            const price = quote.c.toFixed(2);
            const arrow = quote.d >= 0 ? "▲" : "▼";
            const change = quote.d.toFixed(2);
            const changePercent = quote.dp.toFixed(2);
            const isPositive = quote.d >= 0;

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
            
            streamDeck.logger.info(`Updated ${symbol}: ${price} (${change})`);
        } catch (error: any) {
            streamDeck.logger.error(`Error fetching ${symbol}: ${error?.message || error}`);
            await action.setTitle(`${symbol}\nError`);
            await action.showAlert();
        }
    }
}
