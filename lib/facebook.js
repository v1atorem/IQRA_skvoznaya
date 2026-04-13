'use strict';

const { norm, safeFloat } = require('./utils');

const FB_API_VERSION = 'v19.0';

async function fetchFacebookData(settings) {
  const { fbToken, fbAdAccountIds, dateFrom, dateTo } = settings;

  if (!fbToken || !fbAdAccountIds.length) return {};

  const windMap = {};
  for (const accountId of fbAdAccountIds) {
    await fetchFacebookAccount(fbToken, accountId, dateFrom, dateTo, windMap);
  }
  return windMap;
}

async function fetchFacebookAccount(token, accountId, dateFrom, dateTo, windMap) {
  const since     = (dateFrom || '').slice(0, 10) || new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const until     = (dateTo   || '').slice(0, 10) || new Date().toISOString().slice(0, 10);
  const timeRange = encodeURIComponent(JSON.stringify({ since, until }));

  // ─ Insights (расходы) ─
  let after = null, page = 0;
  do {
    page++;
    let url = `https://graph.facebook.com/${FB_API_VERSION}/act_${accountId}/insights`
      + `?fields=campaign_name,adset_name,ad_name,spend`
      + `&level=ad&time_range=${timeRange}&limit=500&access_token=${token}`;
    if (after) url += `&after=${after}`;

    const res  = await fetch(url);
    const json = await res.json();

    if (json.error) {
      console.error(`FB Insights [act_${accountId}]:`, json.error);
      break;
    }

    for (const row of (json.data || [])) {
      const key = `${norm(row.campaign_name)}|${norm(row.adset_name)}|${norm(row.ad_name)}`;
      windMap[key] = {
        expense:   (windMap[key]?.expense || 0) + safeFloat(row.spend),
        instagram: windMap[key]?.instagram || '',
        status:    windMap[key]?.status    || '',
        source:    'facebook',
      };
    }

    after = json.paging?.cursors?.after || null;
    if (!json.paging?.next) after = null;
  } while (after && page < 30);

  // ─ Ad status + Instagram link ─
  let stAfter = null, stPage = 0;
  do {
    stPage++;
    let url2 = `https://graph.facebook.com/${FB_API_VERSION}/act_${accountId}/ads`
      + `?fields=name,effective_status,adset%7Bname%7D,campaign%7Bname%7D,creative%7Binstagram_permalink_url%7D`
      + `&limit=500&access_token=${token}`;
    if (stAfter) url2 += `&after=${stAfter}`;

    const res2  = await fetch(url2);
    const json2 = await res2.json();
    if (json2.error) break;

    for (const ad of (json2.data || [])) {
      const key = `${norm(ad.campaign?.name)}|${norm(ad.adset?.name)}|${norm(ad.name)}`;
      if (windMap[key]) {
        windMap[key].status    = ad.effective_status || '';
        windMap[key].instagram = ad.creative?.instagram_permalink_url || '';
      }
    }

    stAfter = json2.paging?.cursors?.after || null;
    if (!json2.paging?.next) stAfter = null;
  } while (stAfter && stPage < 15);
}

module.exports = { fetchFacebookData };
