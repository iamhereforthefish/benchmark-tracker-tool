/**
 * Stock Performance Benchmarker
 * Compare up to 3 tickers against selectable benchmarks
 * Design matching defense-stocks-tracker
 */

// Benchmark definitions
const BENCHMARKS = [
    { ticker: 'VOO', name: 'Vanguard S&P 500 ETF' },
    { ticker: 'QQQ', name: 'Nasdaq-100 ETF' },
    { ticker: 'IWM', name: 'Russell 2000 ETF' },
    { ticker: 'EFA', name: 'Intl Developed (EAFE)' },
    { ticker: 'IBIT', name: 'iShares Bitcoin Trust' },
    { ticker: '^GSPC', name: 'S&P 500 Index' },
    { ticker: '^SP500TR', name: 'S&P 500 Total Return' },
    { ticker: '^NDXT', name: 'Nasdaq-100 Tech Index' },
    { ticker: '^XCMP', name: 'Nasdaq Composite Total Return' },
    { ticker: '^RUTTR', name: 'Russell 2000 Total Return' }
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
let userTickers = [];

// Init
document.addEventListener('DOMContentLoaded', () => {
    buildBenchmarkCheckboxes();

    // Enter key triggers compare on all 3 inputs
    for (let i = 1; i <= 3; i++) {
        document.getElementById(`ticker-input-${i}`).addEventListener('keydown', (e) => {
            if (e.key === 'Enter') handleCompare();
        });
    }
    document.getElementById('ticker-input-1').focus();
});

// ========================================================
// BENCHMARK CHECKBOXES
// ========================================================

function buildBenchmarkCheckboxes() {
    const grid = document.getElementById('benchmark-grid');
    grid.innerHTML = '';

    BENCHMARKS.forEach(b => {
        const label = document.createElement('label');
        label.className = 'benchmark-item';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `bm-${safeTicker(b.ticker)}`;
        checkbox.value = b.ticker;
        checkbox.checked = true; // all selected by default

        const tickerSpan = document.createElement('span');
        tickerSpan.className = 'bm-ticker';
        tickerSpan.textContent = b.ticker;

        const nameSpan = document.createElement('span');
        nameSpan.className = 'bm-name';
        nameSpan.textContent = b.name;

        label.appendChild(checkbox);
        label.appendChild(tickerSpan);
        label.appendChild(nameSpan);
        grid.appendChild(label);
    });
}

function toggleAllBenchmarks(checked) {
    BENCHMARKS.forEach(b => {
        const cb = document.getElementById(`bm-${safeTicker(b.ticker)}`);
        if (cb) cb.checked = checked;
    });
}

function getSelectedBenchmarks() {
    return BENCHMARKS.filter(b => {
        const cb = document.getElementById(`bm-${safeTicker(b.ticker)}`);
        return cb && cb.checked;
    });
}

// ========================================================
// COMPARE
// ========================================================

async function handleCompare() {
    // Gather up to 3 tickers
    const tickers = [];
    for (let i = 1; i <= 3; i++) {
        const val = document.getElementById(`ticker-input-${i}`).value.trim().toUpperCase();
        if (val) tickers.push(val);
    }

    if (tickers.length === 0) {
        showStatus('input-status', 'Please enter at least one ticker symbol', 'error');
        return;
    }

    const selectedBenchmarks = getSelectedBenchmarks();
    if (selectedBenchmarks.length === 0 && tickers.length === 0) {
        showStatus('input-status', 'Please select at least one benchmark or enter a ticker', 'error');
        return;
    }

    if (isLoading) return;
    isLoading = true;
    userTickers = tickers;

    document.getElementById('compare-btn').disabled = true;

    // Show results section
    document.getElementById('results-section').style.display = '';
    document.getElementById('legend-section').style.display = '';
    document.getElementById('results-ticker').textContent = tickers.join(', ');

    // Build ticker list: user tickers first, then selected benchmarks
    const allTickers = [
        ...tickers.map(t => ({ ticker: t, name: t, isUser: true })),
        ...selectedBenchmarks.map(b => ({ ...b, isUser: false }))
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
            cell.id = `perf-${safeTicker(stock.ticker)}-${period}`;
            cell.className = 'perf-cell';
            cell.textContent = 'Loading...';
            row.appendChild(cell);
        });

        tbody.appendChild(row);
    });
}

function safeTicker(ticker) {
    return ticker.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function updateRow(ticker, performance) {
    PERIODS.forEach(period => {
        const cell = document.getElementById(`perf-${safeTicker(ticker)}-${period}`);
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
        const cell = document.getElementById(`perf-${safeTicker(ticker)}-${period}`);
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

    // Fetch 1-month daily adjusted close data for 1d and 1w
    const data1m = await fetchYahooDaily(ticker, '1mo');

    if (data1m && data1m.adjCloses.length >= 2) {
        const closes = data1m.adjCloses;
        const currentPrice = closes[closes.length - 1];

        // 1 Day: last two adjusted closes
        if (closes.length >= 2) {
            const prev = closes[closes.length - 2];
            if (prev) performance['1d'] = ((currentPrice - prev) / prev) * 100;
        }

        // 1 Week: last trading day at or before 7 calendar days ago
        const sevenDaysAgo = now - (7 * 24 * 60 * 60);
        const timestamps = data1m.timestamps;
        let weekIdx = -1;
        for (let i = timestamps.length - 1; i >= 0; i--) {
            if (timestamps[i] <= sevenDaysAgo) {
                weekIdx = i;
                break;
            }
        }
        if (weekIdx >= 0 && closes[weekIdx]) {
            performance['1w'] = ((currentPrice - closes[weekIdx]) / closes[weekIdx]) * 100;
        } else if (closes.length >= 2) {
            // Fallback: use earliest available
            const weekAgo = closes[0];
            if (weekAgo) performance['1w'] = ((currentPrice - weekAgo) / weekAgo) * 100;
        }
    }

    // Get current adjusted close price
    const currentPrice = await getCurrentAdjClose(ticker);
    if (currentPrice === null) return performance;

    // 1 Month: daily adjusted close from 30 days ago
    const thirtyDaysAgo = now - (30 * 24 * 60 * 60);
    const p1m = await fetchFirstAdjClose(ticker, thirtyDaysAgo, now);
    if (p1m) performance['1m'] = ((currentPrice - p1m) / p1m) * 100;

    // 3 Month: daily adjusted close from 90 days ago
    const ninetyDaysAgo = now - (90 * 24 * 60 * 60);
    const p3m = await fetchFirstAdjClose(ticker, ninetyDaysAgo, now);
    if (p3m) performance['3m'] = ((currentPrice - p3m) / p3m) * 100;

    // 6 Month: daily adjusted close from 180 days ago
    const sixMonthsAgo = now - (180 * 24 * 60 * 60);
    const p6m = await fetchFirstAdjClose(ticker, sixMonthsAgo, now);
    if (p6m) performance['6m'] = ((currentPrice - p6m) / p6m) * 100;

    // 1 Year: daily adjusted close from 365 days ago
    const oneYearAgo = now - (365 * 24 * 60 * 60);
    const p1y = await fetchFirstAdjClose(ticker, oneYearAgo, now);
    if (p1y) performance['1y'] = ((currentPrice - p1y) / p1y) * 100;

    // YTD: daily adjusted close from Dec 31 of prior year
    const dec31 = new Date(new Date().getFullYear() - 1, 11, 31);
    const ytdStart = Math.floor(dec31.getTime() / 1000);
    const pYtd = await fetchFirstAdjClose(ticker, ytdStart, now);
    if (pYtd) performance['ytd'] = ((currentPrice - pYtd) / pYtd) * 100;

    return performance;
}

async function getCurrentAdjClose(ticker) {
    const data = await fetchYahooDaily(ticker, '5d');
    if (!data || data.adjCloses.length === 0) return null;
    for (let i = data.adjCloses.length - 1; i >= 0; i--) {
        if (data.adjCloses[i] !== null) return data.adjCloses[i];
    }
    return null;
}

async function fetchFirstAdjClose(ticker, period1, period2) {
    const data = await fetchYahooDailyByPeriod(ticker, period1, period2);
    if (!data || data.adjCloses.length === 0) return null;
    for (let i = 0; i < data.adjCloses.length; i++) {
        if (data.adjCloses[i] !== null) return data.adjCloses[i];
    }
    return null;
}

async function fetchYahooDaily(ticker, range) {
    const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=${range}&interval=1d`;
    return await fetchViaProxies(yahooUrl);
}

async function fetchYahooDailyByPeriod(ticker, period1, period2) {
    const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?period1=${period1}&period2=${period2}&interval=1d`;
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
                // Use adjusted close if available, fall back to regular close
                const adjClose = result.indicators.adjclose?.[0]?.adjclose;
                const regularClose = result.indicators.quote[0].close || [];
                return {
                    timestamps: result.timestamp || [],
                    adjCloses: adjClose || regularClose
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
    if (!table || userTickers.length === 0) {
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
        alignment: { horizontal: 'center', vertical: 'middle' },
        border: {
            bottom: { style: 'thin', color: { argb: 'FFD0D0D0' } }
        }
    };

    const labelCellStyle = {
        font: { name: 'Arial', size: 11, bold: true },
        alignment: { horizontal: 'center', vertical: 'middle' },
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
        { width: 28 }, // Name
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
                cell.alignment = labelCellStyle.alignment;
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
    a.download = `benchmark_${userTickers.join('_')}_${new Date().toISOString().slice(0,10)}.xlsx`;
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
