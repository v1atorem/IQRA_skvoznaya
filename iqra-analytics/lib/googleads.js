'use strict';

const { normUtm, safeFloat, extractUtmParam } = require('./utils');

async function getGoogleAccessToken() {
  const { GOOGLE_REFRESH_TOKEN, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = process.env;

  if (!GOOGLE_REFRESH_TOKEN) throw new Error('GOOGLE_REFRESH_TOKEN не задан в env');

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: GOOGLE_REFRESH_TOKEN,
      client_id:     GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      grant_type:    'refresh_token',
    }),
  });

  const data = await res.json();
  if (!data.access_token) {
    throw new Error('Google OAuth ошибка: ' + JSON.stringify(data));
  }
  return data.access_token;
}

async function fetchGoogleAdsData(settings) {
  const devToken    = process.env.GOOGLE_DEV_TOKEN;
  const customerId  = (settings.googleCustomerId || process.env.GOOGLE_CUSTOMER_ID || '').replace(/-/g, '');
  const managerId   = (settings.googleManagerId  || process.env.GOOGLE_MANAGER_ID  || '').replace(/-/g, '');
  const utmMedium   = settings.googleUtmMedium || 'cpc';
  const dateFrom    = (settings.dateFrom || '').slice(0, 10);
  const dateTo      = (settings.dateTo   || '').slice(0, 10);

  if (!devToken || !customerId) {
    console.warn('Google Ads: GOOGLE_DEV_TOKEN или customerId не заданы — пропускаем');
    return {};
  }

  const from = dateFrom || new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const to   = dateTo   || new Date().toISOString().slice(0, 10);

  let accessToken;
  try {
    accessToken = await getGoogleAccessToken();
  } catch (e) {
    console.warn('Google Ads: не удалось получить access token:', e.message);
    return {};
  }

  const url = `https://googleads.googleapis.com/v20/customers/${customerId}/googleAds:search`;
  const query = `
    SELECT campaign.name, ad_group.name, ad_group_ad.ad.final_urls,
           segments.date, metrics.cost_micros, metrics.clicks
    FROM ad_group_ad
    WHERE segments.date BETWEEN '${from}' AND '${to}'
      AND campaign.status != 'REMOVED'
      AND ad_group_ad.status != 'REMOVED'
      AND metrics.cost_micros > 0
    ORDER BY segments.date`.trim();

  const headers = {
    'Authorization':   `Bearer ${accessToken}`,
    'developer-token': devToken,
    'Content-Type':    'application/json',
  };
  if (managerId) headers['login-customer-id'] = managerId;

  const rawRows   = [];
  let   pageToken = null;

  do {
    const body = { query };
    if (pageToken) body.pageToken = pageToken;

    const r = await fetch(url, {
      method: 'POST', headers,
      body: JSON.stringify(body),
    });

    if (!r.ok) {
      const txt = await r.text();
      throw new Error(`Google Ads API HTTP ${r.status}: ${txt.slice(0, 300)}`);
    }

    const json = await r.json();
    if (json.error) throw new Error(JSON.stringify(json.error));

    for (const row of (json.results || [])) {
      const finalUrl    = (row.adGroupAd?.ad?.finalUrls || [])[0] || '';
      rawRows.push({
        campaignName: row.campaign?.name || '',
        adGroupName:  row.adGroup?.name  || '',
        utmMedium:    extractUtmParam(finalUrl, 'utm_medium')   || '',
        utmCampaign:  extractUtmParam(finalUrl, 'utm_campaign') || '',
        utmContent:   extractUtmParam(finalUrl, 'utm_content')  || '',
        spend:        (row.metrics?.costMicros || 0) / 1e6,
      });
    }

    pageToken = json.nextPageToken || null;
  } while (pageToken);

  const gadsMap = {};
  for (const r of rawRows) {
    const medium   = normUtm(r.utmMedium   || utmMedium);
    const campaign = normUtm(r.utmCampaign || r.campaignName);
    const content  = normUtm(r.utmContent  || r.adGroupName);
    const key = `${medium}|${campaign}|${content}`;
    if (!gadsMap[key]) gadsMap[key] = { expense: 0, instagram: '', status: 'GOOGLE_ADS', source: 'google' };
    gadsMap[key].expense += r.spend;
  }

  return gadsMap;
}

module.exports = { fetchGoogleAdsData };
