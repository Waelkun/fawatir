const prisma = require('../config/db');
const https = require('https');

// Default hardcoded rates (fallback in case of API failure)
const DEFAULT_RATES = {
  "USD": { "SAR": 3.75, "EUR": 0.92, "TRY": 32.20, "USD": 1.0 },
  "SAR": { "USD": 0.27, "EUR": 0.25, "TRY": 8.58, "SAR": 1.0 },
  "EUR": { "SAR": 4.07, "USD": 1.08, "TRY": 34.90, "EUR": 1.0 },
  "TRY": { "SAR": 0.12, "USD": 0.031, "EUR": 0.029, "TRY": 1.0 }
};

/**
 * Fetches latest exchange rates from Open Exchange Rates API and updates local DB cache
 */
const fetchAndCacheRates = async () => {
  return new Promise((resolve, reject) => {
    https.get('https://open.er-api.com/v6/latest/USD', (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', async () => {
        try {
          const json = JSON.parse(data);
          if (json && json.result === 'success') {
            const rates = json.rates;
            
            // We want conversion rates relative to USD, SAR, EUR, etc.
            // Let's store direct relationships in DB
            const currencies = ['USD', 'SAR', 'EUR', 'TRY'];
            
            for (const from of currencies) {
              for (const to of currencies) {
                if (from === to) continue;
                
                // Calculate rate based on USD base rate
                // rate = (1 / rates[from]) * rates[to]
                const rateFromUsd = rates[from];
                const rateToUsd = rates[to];
                
                if (rateFromUsd && rateToUsd) {
                  const rate = (1 / rateFromUsd) * rateToUsd;
                  
                  await prisma.exchangeRate.upsert({
                    where: { from_to: { from, to } },
                    update: { rate, updatedAt: new Date() },
                    create: { from, to, rate }
                  });
                }
              }
            }
            console.log('Exchange rates updated successfully from API.');
            resolve(true);
          } else {
            resolve(false);
          }
        } catch (err) {
          console.error('Failed to parse exchange rates API response:', err);
          resolve(false);
        }
      });
    }).on('error', (err) => {
      console.error('Exchange rates API network request failed:', err);
      resolve(false);
    });
  });
};

/**
 * Returns exchange rate between two currencies
 */
const getExchangeRate = async (from, to) => {
  const cleanFrom = from.toUpperCase().trim();
  const cleanTo = to.toUpperCase().trim();

  if (cleanFrom === cleanTo) return 1.0;

  try {
    const rateRecord = await prisma.exchangeRate.findUnique({
      where: { from_to: { from: cleanFrom, to: cleanTo } }
    });
    if (rateRecord) {
      return rateRecord.rate;
    }
  } catch (error) {
    console.error(`Error querying exchange rate in DB:`, error);
  }

  // Fallback to static rates if DB query fails or rates not seeded
  if (DEFAULT_RATES[cleanFrom] && DEFAULT_RATES[cleanFrom][cleanTo]) {
    return DEFAULT_RATES[cleanFrom][cleanTo];
  }
  
  // Cross-rate calculation fallback if not direct
  if (DEFAULT_RATES['USD'][cleanFrom] && DEFAULT_RATES['USD'][cleanTo]) {
    return (1 / DEFAULT_RATES['USD'][cleanFrom]) * DEFAULT_RATES['USD'][cleanTo];
  }

  return 1.0; // final fallback
};

/**
 * Converts an amount from one currency to another
 */
const convertCurrency = async (amount, from, to) => {
  const rate = await getExchangeRate(from, to);
  return amount * rate;
};

module.exports = {
  fetchAndCacheRates,
  getExchangeRate,
  convertCurrency
};
