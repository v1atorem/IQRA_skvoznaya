'use strict';

const { norm, normUtm, safeFloat, safeInt } = require('./utils');

const AMO_API_VERSION = 'v4';

async function getAmoStatusMap(subdomain, token) {
  const url = `https://${subdomain}.amocrm.ru/api/${AMO_API_VERSION}/leads/pipelines?limit=250`;
  const res  = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
  const json = await res.json();

  const map = {};
  for (const pipeline of (json._embedded?.pipelines || [])) {
    for (const status of (pipeline._embedded?.statuses || [])) {
      map[status.id] = norm(status.name);
    }
  }
  return map;
}

function toTimestamp(dateStr, endOfDay) {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number);
  const dt = new Date(y, m - 1, d, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0);
  return Math.floor(dt.getTime() / 1000);
}

async function fetchAmoData(settings) {
  const { amoSubdomain, amoAccessToken, amoFieldUtmMedium, amoFieldUtmCampaign,
          amoFieldUtmContent, amoFieldAbc, pipelineIds, dateFrom, dateTo } = settings;

  if (!amoAccessToken) throw new Error('AMO_ACCESS_TOKEN не задан');
  if (!amoSubdomain)   throw new Error('amoSubdomain не задан');

  const statusMap = await getAmoStatusMap(amoSubdomain, amoAccessToken);

  const since = toTimestamp(dateFrom, false);
  const until = toTimestamp(dateTo,   true);

  const leads = [];
  let page = 1;

  while (true) {
    let url = `https://${amoSubdomain}.amocrm.ru/api/${AMO_API_VERSION}/leads`
      + `?with=custom_fields&limit=250&page=${page}`;

    for (const id of pipelineIds) url += `&filter[pipeline_id][]=${id}`;
    if (since) url += `&filter[created_at][from]=${since}`;
    if (until) url += `&filter[created_at][to]=${until}`;

    const res = await fetch(url, {
      headers: { Authorization: 'Bearer ' + amoAccessToken },
    });

    if (res.status === 401) throw new Error('AmoCRM: 401 Unauthorized — обновите AMO_ACCESS_TOKEN');
    if (res.status === 204) break;

    const json  = await res.json();
    const items = json._embedded?.leads || [];
    if (items.length === 0) break;

    for (const lead of items) {
      const cf = {};
      for (const field of (lead.custom_fields_values || [])) {
        cf[field.field_id] = field.values?.[0]?.value ?? '';
      }

      const stageName  = statusMap[lead.status_id] || norm(String(lead.status_id || ''));
      const lossReason = norm(cf[2712507] || '');

      const mediumVal   = normUtm(cf[amoFieldUtmMedium]);
      const campaignVal = normUtm(cf[amoFieldUtmCampaign]);
      const contentVal  = normUtm(cf[amoFieldUtmContent]);

      const isBroken = v => /^\d{10,}$/.test(v) || v.includes('{{');

      leads.push({
        medium:     isBroken(mediumVal)   ? 'без utm' : mediumVal,
        campaign:   isBroken(campaignVal) ? 'без utm' : campaignVal,
        content:    isBroken(contentVal)  ? 'без utm' : contentVal,
        revenue:    safeFloat(lead.price),
        abcScore:   (cf[amoFieldAbc] || '').toString().trim().toLowerCase(),
        stage:      stageName,
        lossReason,
      });
    }

    page++;
    if (items.length < 250) break;
    await new Promise(r => setTimeout(r, 250));
  }

  return leads;
}

module.exports = { fetchAmoData };
