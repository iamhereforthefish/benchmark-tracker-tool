/**
 * Stock Performance Benchmarker
 * Compare any ticker against SPY, QQQ, IWM, EFA, GLD
 * Design matching defense-stocks-tracker
 */

// Benchmark definitions
const BENCHMARKS = [
    { ticker: 'SPY', name: 'S&P 500' },
    { ticker: 'QQQ', name: 'Nasdaq-100' },
    { ticker: 'IWM', name: 'Russell 2000' },
    { ticker: 'EFA', name: 'Intl Developed (EAFE)' },
    { ticker: 'GLD', name: 'Gold' }
];

// Performance periods
const PERIODS = ['1d', '1w', '1m', '3m', '6m', '1y', 'ytd'];
const PERIOD_LABELS = {
    '1d': '1 Day',
    '1w': '1 Week',
    '1m': '1 Month',
    '3m': '3 Month',
    '6m': '6 Month',
    '1y': '1 Year',
    'ytd': 'YTD'
};

// CORS proxies (same as defense-stocks-tracker)
const CORS_PROXIES = [
    { url: 'https://api.allorigins.win/raw?url=', wrapped: false },
    { url: 'https://api.allorigins.win/get?url=', wrapped: true },
    { url: 'https://corsproxy.io/?', wrapped: false }
];

let isLoading = false;
let userTicker = '';

// Enter key triggers compare
document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('ticker-input');
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleCompare();
    });
    input.focus();
});

async function handleCompare() {
    const input = document.getElementById('ticker-input');
    const ticker = input.value.trim().toUpperCase();

    if (!ticker) {
        showStatus('input-status', 'Please enter a ticker symbol', 'error');
        return;
    }

    if (isLoading) return;
    isLoading = true;
    userTicker = ticker;

    document.getElementById('compare-btn').disabled = true;

    // Show results section
    document.getElementById('results-section').style.display = '';
    document.getElementById('legend-section').style.display = '';
    document.getElementById('results-ticker').textContent = ticker;

    // Build the table with user ticker + benchmarks
    const allTickers = [
        { ticker: ticker, name: ticker, isUser: true },
        ...BENCHMARKS.map(b => ({ ...b, isUser: false }))
    ];

    buildTable(allTickers);
    showStatus('save-status', 'Fetching data...', 'loading');
    showStatus('input-status', '', '');

    let successCount = 0;
    let totalCount = allTickers.length;

    for (const stock of allTickers) {
        showStatus('save-status', `Fetching ${stock.ticker}...`, 'loading');
        try {
            const perf = await fetchAllPerformance(stock.ticker);
            updateRow(stock.ticker, perf);
            successCount++;
        } catch (err) {
            console.error(`Failed ${stock.ticker}:`, err);
            updateRowError(stock.ticker);
        }
        await sleep(600);
    }

    isLoading = false;
    document.getElementById('compare-btn').disabled = false;

    // Enable export button once data is loaded
    document.getElementById('export-btn').disabled = false;

    if (successCount === totalCount) {
        showStatus('save-status', 'All data loaded!', 'success');
    } else {
        showStatus('save-status', `Loaded ${successCount}/${totalCount}. Click Refresh to retry.`, 'error');
    }
}

function buildTable(allTickers) {
    const tbody = document.getElementById('stocks-body');
    tbody.innerHTML = '';

    allTickers.forEach(stock => {
        const row = document.createElement('tr');
        if (stock.isUser) row.className = 'user-ticker-row';

        const tickerCell = document.createElement('td');
        tickerCell.className = 'ticker';
        tickerCell.textContent = stock.ticker;
        row.appendChild(tickerCell);

        const nameCell = document.createElement('td');
        nameCell.className = 'company';
        nameCell.textContent = stock.name;
        row.appendChild(nameCell);

        PERIODS.forEach(period => {
            const cell = document.createElement('td');
            cell.id = `perf-${stock.ticker}-${period}`;
            cell.className = 'perf-cell';
            cell.textContent = 'Loading...';
            row.appendChild(cell);
        });

        tbody.appendChild(row);
    });
}

function updateRow(ticker, performance) {
    PERIODS.forEach(period => {
        const cell = document.getElementById(`perf-${ticker}-${period}`);
        if (!cell) return;
        const value = performance[period];
        if (value !== null && value !== undefined) {
            const formatted = (value >= 0 ? '+' : '') + value.toFixed(2) + '%';
            cell.textContent = formatted;
            cell.className = 'perf-cell ' + (value >= 0 ? 'positive' : 'negative');
        } else {
            cell.textContent = '--';
            cell.className = 'perf-cell';
        }
    });
}

function updateRowError(ticker) {
    PERIODS.forEach(period => {
        const cell = document.getElementById(`perf-${ticker}-${period}`);
        if (!cell) return;
        cell.textContent = 'Error';
        cell.className = 'perf-cell error';
    });
}

// ========================================================
// DATA FETCHING (Yahoo Finance via CORS proxies)
// ========================================================

async function fetchAllPerformance(ticker) {
    const performance = {};
    const now = Math.floor(Date.now() / 1000);

    // Fetch 1-month daily data for 1d, 1w, 1m calculations
    const data1m = await fetchYahooData(ticker, '1mo', '1d');

    if (data1m && data1m.closes.length >= 2) {
        const closes = data1m.closes;
        const currentPrice = closes[closes.length - 1];

        // 1 Day
        if (closes.length >= 2) {
            const prev = closes[closes.length - 2];
            if (prev) performance['1d'] = ((currentPrice - prev) / prev) * 100;
        }

        // 1 Week (~5 trading days)
        if (closes.length >= 6) {
            const weekAgo = closes[closes.length - 6];
            if (weekAgo) performance['1w'] = ((currentPrice - weekAgo) / weekAgo) * 100;
        }

        // 1 Month (first close in the 1mo data)
        const firstValid1m = closes.find(p => p !== null);
        if (firstValid1m) performance['1m'] = ((currentPrice - firstValid1m) / firstValid1m) * 100;
    }

    // Fetch longer periods via period1/period2
    const currentPrice = await getCurrentPrice(ticker);
    if (currentPrice === null) return performance;

    // 3 Month
    const threeMonthsAgo = now - (90 * 24 * 60 * 60);
    const p3m = await fetchFirstPrice(ticker, threeMonthsAgo, now);
    if (p3m) performance['3m'] = ((currentPrice - p3m) / p3m) * 100;

    // 6 Month
    const sixMonthsAgo = now - (182 * 24 * 60 * 60);
    const p6m = await fetchFirstPrice(ticker, sixMonthsAgo, now);
    if (p6m) performance['6m'] = ((currentPrice - p6m) / p6m) * 100;

    // 1 Year
    const oneYearAgo = now - (365 * 24 * 60 * 60);
    const p1y = await fetchFirstPrice(ticker, oneYearAgo, now);
    if (p1y) performance['1y'] = ((currentPrice - p1y) / p1y) * 100;

    // YTD
    const startOfYear = new Date(new Date().getFullYear(), 0, 1);
    const ytdStart = Math.floor(startOfYear.getTime() / 1000);
    const pYtd = await fetchFirstPrice(ticker, ytdStart, now);
    if (pYtd) performance['ytd'] = ((currentPrice - pYtd) / pYtd) * 100;

    return performance;
}

async function getCurrentPrice(ticker) {
    const data = await fetchYahooData(ticker, '5d', '1d');
    if (!data || data.closes.length === 0) return null;
    for (let i = data.closes.length - 1; i >= 0; i--) {
        if (data.closes[i] !== null) return data.closes[i];
    }
    return null;
}

async function fetchFirstPrice(ticker, period1, period2) {
    const data = await fetchYahooByPeriod(ticker, period1, period2);
    if (!data || data.closes.length === 0) return null;
    for (let i = 0; i < data.closes.length; i++) {
        if (data.closes[i] !== null) return data.closes[i];
    }
    return null;
}

async function fetchYahooData(ticker, range, interval) {
    const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=${range}&interval=${interval}`;
    return await fetchViaProxies(yahooUrl);
}

async function fetchYahooByPeriod(ticker, period1, period2) {
    const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?period1=${period1}&period2=${period2}&interval=1wk`;
    return await fetchViaProxies(yahooUrl);
}

async function fetchViaProxies(yahooUrl) {
    for (let attempt = 0; attempt < 2; attempt++) {
        for (const proxy of CORS_PROXIES) {
            try {
                const url = `${proxy.url}${encodeURIComponent(yahooUrl)}`;
                const response = await fetch(url);
                if (!response.ok) continue;

                let data;
                if (proxy.wrapped) {
                    const wrapper = await response.json();
                    data = JSON.parse(wrapper.contents);
                } else {
                    data = await response.json();
                }

                if (!data.chart?.result?.[0]) continue;
                const result = data.chart.result[0];
                return {
                    timestamps: result.timestamp || [],
                    closes: result.indicators.quote[0].close || []
                };
            } catch (error) {
                continue;
            }
        }
        if (attempt < 1) await sleep(500);
    }
    return null;
}

// ========================================================
// EXPORT TO GOOGLE SHEETS (.xlsx)
// ========================================================

async function exportToSheets() {
    const table = document.getElementById('performance-table');
    if (!table || !userTicker) {
        showStatus('save-status', 'No data to export. Run a comparison first.', 'error');
        return;
    }

    showStatus('save-status', 'Generating spreadsheet...', 'loading');

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Benchmark Comparison');

    // Header style: white Arial 12pt on #0F2A36 background
    const headerStyle = {
        font: { name: 'Arial', size: 12, bold: true, color: { argb: 'FFFFFFFF' } },
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F2A36' } },
        alignment: { horizontal: 'center', vertical: 'middle' },
        border: {
            top: { style: 'thin', color: { argb: 'FF44C1C1' } },
            bottom: { style: 'thin', color: { argb: 'FF44C1C1' } },
            left: { style: 'thin', color: { argb: 'FF44C1C1' } },
            right: { style: 'thin', color: { argb: 'FF44C1C1' } }
        }
    };

    // Data cell style
    const dataCellStyle = {
        font: { name: 'Arial', size: 11 },
        alignment: { horizontal: 'right', vertical: 'middle' },
        border: {
            bottom: { style: 'thin', color: { argb: 'FFD0D0D0' } }
        }
    };

    const labelCellStyle = {
        font: { name: 'Arial', size: 11, bold: true },
        alignment: { horizontal: 'left', vertical: 'middle' },
        border: {
            bottom: { style: 'thin', color: { argb: 'FFD0D0D0' } }
        }
    };

    // Column headers
    const headers = ['Ticker', 'Name', '1 Day', '1 Week', '1 Month', '3 Month', '6 Month', '1 Year', 'YTD'];
    const headerRow = sheet.addRow(headers);
    headerRow.height = 30;
    headerRow.eachCell((cell) => {
        cell.font = headerStyle.font;
        cell.fill = headerStyle.fill;
        cell.alignment = headerStyle.alignment;
        cell.border = headerStyle.border;
    });

    // Set column widths
    sheet.columns = [
        { width: 12 }, // Ticker
        { width: 24 }, // Name
        { width: 12 }, // 1 Day
        { width: 12 }, // 1 Week
        { width: 12 }, // 1 Month
        { width: 12 }, // 3 Month
        { width: 12 }, // 6 Month
        { width: 12 }, // 1 Year
        { width: 12 }  // YTD
    ];

    // Read data rows from the DOM table
    const tbody = table.querySelector('tbody');
    const rows = tbody.querySelectorAll('tr');

    rows.forEach((tr) => {
        const cells = tr.querySelectorAll('td');
        const rowData = [];
        cells.forEach(td => rowData.push(td.textContent.trim()));

        const dataRow = sheet.addRow(rowData);
        dataRow.height = 24;

        dataRow.eachCell((cell, colNumber) => {
            if (colNumber <= 2) {
                cell.font = labelCellStyle.font;
                cell.alignment = { horizontal: 'left', vertical: 'middle' };
            } else {
                cell.font = { name: 'Arial', size: 11, bold: true };
                cell.alignment = dataCellStyle.alignment;

                // Color: green for positive, red for negative
                const val = cell.value;
                if (typeof val === 'string') {
                    if (val.startsWith('+')) {
                        cell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FF047857' } };
                    } else if (val.startsWith('-')) {
                        cell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFF8130E' } };
                    }
                }
            }
            cell.border = dataCellStyle.border;
        });

        // Highlight user ticker row
        if (tr.classList.contains('user-ticker-row')) {
            dataRow.eachCell((cell) => {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0F7F4' } };
            });
        }
    });

    // Generate and download
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `benchmark_${userTicker}_${new Date().toISOString().slice(0,10)}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showStatus('save-status', 'Downloaded! Open the .xlsx file in Google Sheets to view.', 'success');
}

// ========================================================
// UTILITIES
// ========================================================

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function showStatus(elementId, message, type) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.textContent = message;
    el.className = 'save-status ' + type;
    if (type === 'success') {
        setTimeout(() => {
            el.textContent = '';
            el.className = 'save-status';
        }, 4000);
    }
}
