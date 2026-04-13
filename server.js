'use strict';

// Загружаем .env при локальной разработке
if (process.env.NODE_ENV !== 'production') {
  try { require('fs').readFileSync('.env').toString().split('\n').forEach(line => {
    const [k, ...v] = line.split('=');
    if (k && !k.startsWith('#')) process.env[k.trim()] = v.join('=').trim();
  }); } catch {}
}

const express = require('express');
const path    = require('path');

const { fetchFacebookData }  = require('./lib/facebook');
const { fetchGoogleAdsData } = require('./lib/googleads');
const { fetchAmoData }       = require('./lib/amocrm');
const { aggregateData, mergeWithAdData, buildTableData } = require('./lib/utils');
const { saveRun, getRuns, getRunById } = require('./lib/db');

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── Helpers ────────────────────────────────────────────────────────────

function buildSettings(body) {
  return {
    usdRate:             parseFloat(body.usdRate) || 500,
    dateFrom:            body.dateFrom || null,
    dateTo:              body.dateTo   || null,
    pipelineIds:         (body.pipelineIds || []).map(String).filter(Boolean),
    fbToken:             process.env.FB_TOKEN || '',
    fbAdAccountIds:      (body.fbAdAccountIds || [])
                           .map(id => id.toString().replace('act_', '').trim())
                           .filter(Boolean),
    amoSubdomain:        body.amoSubdomain    || process.env.AMO_SUBDOMAIN    || '',
    amoFieldUtmMedium:   parseInt(body.amoFieldUtmMedium)   || 0,
    amoFieldUtmCampaign: parseInt(body.amoFieldUtmCampaign) || 0,
    amoFieldUtmContent:  parseInt(body.amoFieldUtmContent)  || 0,
    amoFieldAbc:         parseInt(body.amoFieldAbc)         || 0,
    googleCustomerId:    (body.googleCustomerId || '').replace(/-/g, ''),
    googleManagerId:     (body.googleManagerId  || '').replace(/-/g, ''),
    googleUtmMedium:     body.googleUtmMedium || 'cpc',
    amoAccessToken:      process.env.AMO_ACCESS_TOKEN || '',
  };
}

function sseWrite(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

// ── POST /api/run  (SSE stream) ────────────────────────────────────────

app.post('/api/run', async (req, res) => {
  res.writeHead(200, {
    'Content-Type':  'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection':    'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });

  const log = msg => { console.log(msg); sseWrite(res, 'log', { msg }); };
  const settings = buildSettings(req.body);

  try {
    log('⏳ [1/4] Загружаем Facebook...');
    const fbMap = await fetchFacebookData(settings);
    log(`✅ Facebook: ${Object.keys(fbMap).length} связок`);

    log('⏳ [2/4] Загружаем Google Ads...');
    const gadsMap = await fetchGoogleAdsData(settings);
    log(`✅ Google Ads: ${Object.keys(gadsMap).length} связок`);

    const adMap = { ...fbMap };
    for (const k in gadsMap) {
      if (adMap[k]) adMap[k].expense += gadsMap[k].expense;
      else adMap[k] = { ...gadsMap[k] };
    }

    log('⏳ [3/4] Загружаем AmoCRM...');
    const leads = await fetchAmoData(settings);
    log(`✅ AmoCRM: ${leads.length} лидов`);

    log('⏳ [4/4] Агрегируем и сохраняем...');
    const { resultMap, mediumSummary } = aggregateData(leads);
    mergeWithAdData(resultMap, mediumSummary, adMap);

    const tableData = buildTableData(resultMap, mediumSummary, settings.usdRate);

    const totalLeads    = Object.values(mediumSummary).reduce((s, v) => s + v.leads,   0);
    const totalBundles  = Object.keys(resultMap).length;
    const totalSpendUsd = Object.values(resultMap).reduce((s, v) => s + v.expense, 0);
    const totalRevenue  = Object.values(mediumSummary).reduce((s, v) => s + v.revenue, 0);

    const stats = {
      totalLeads,
      totalBundles,
      totalSpendUsd: +totalSpendUsd.toFixed(2),
      totalRevenue:  Math.round(totalRevenue),
    };

    const runId = await saveRun({
      dateFrom: settings.dateFrom,
      dateTo:   settings.dateTo,
      stats,
      rows:     tableData,
    });

    log('✅ Сохранено в базу данных');

    sseWrite(res, 'done', { success: true, stats: { ...stats, runId }, tableData });

  } catch (e) {
    console.error('Run error:', e);
    sseWrite(res, 'error', { message: e.message });
  }

  res.end();
});

// ── GET /api/runs  (история) ───────────────────────────────────────────

app.get('/api/runs', async (req, res) => {
  try {
    const runs = await getRuns(100);
    res.json(runs);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/runs/:id  (конкретный запуск) ─────────────────────────────

app.get('/api/runs/:id', async (req, res) => {
  try {
    const run = await getRunById(req.params.id);
    res.json(run);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/status  (статус токенов) ─────────────────────────────────

app.get('/api/status', (req, res) => {
  res.json({
    fb:        !!process.env.FB_TOKEN,
    google:    !!process.env.GOOGLE_REFRESH_TOKEN,
    amoAccess: !!process.env.AMO_ACCESS_TOKEN,
  });
});

// ── SPA fallback ───────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 IQRA Analytics сервер запущен на порту ${PORT}`));
