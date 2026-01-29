import streamDeck from "@elgato/streamdeck";
import { StockQuoteAction } from "./actions/stock-quote";

// Register the stock quote action
streamDeck.actions.registerAction(new StockQuoteAction());

// Connect to Stream Deck
streamDeck.connect();
