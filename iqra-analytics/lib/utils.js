'use strict';

const QUAL_STAGES = [
  'пробный урок/диагностика',
  'принимает решение',
  'жб наработки',
  'счет выставлен',
  'предоплата получена',
  'траншевая оплата с договором',
  'успешно реализовано',
  'закрыто и не реализовано',
];

const QUAL_LOSS_REASONS = [
  'дорого', 'отказ рассрочки', 'выбрали конкурентов',
  'лпр не дал согласия', 'не понравился пу',
];

const SALE_STAGES = [
  'успешно реализовано',
  'траншевая оплата с договором',
  'предоплата получена',
];

const ABC_QUAL_VALUES = ['a', 'b', 'a+'];

function norm(str) {
  return (str || '').toString().trim().toLowerCase()
    .replace(/#\s*/g, '').replace(/\s+/g, ' ').replace(/\./g, '').trim();
}

function normUtm(str) {
  const s = norm(str);
  return s === '' ? 'без utm' : s;
}

function safeFloat(v) { return parseFloat(v) || 0; }
function safeInt(v)   { return parseInt(v)   || 0; }

function fmtDate(date) {
  return date instanceof Date
    ? date.toISOString().slice(0, 10)
    : String(date || '').slice(0, 10);
}

function extractUtmParam(url, param) {
  if (!url) return '';
  const match = url.match(new RegExp('[?&]' + param + '=([^&]+)'));
  return match ? decodeURIComponent(match[1]) : '';
}

function isQualLead(stage, lossReason) {
  if (stage !== 'закрыто и не реализовано' && QUAL_STAGES.includes(stage)) return true;
  if (stage === 'закрыто и не реализовано') {
    if (!lossReason) return false;
    return QUAL_LOSS_REASONS.some(r => lossReason.includes(r));
  }
  return false;
}

function calcMetrics(item, usdRate) {
  const expenseKZT = item.expense * usdRate;
  return {
    romi:       expenseKZT > 0        ? (item.revenue - expenseKZT) / expenseKZT : null,
    cplUsd:     item.leads > 0        ? item.expense / item.leads                 : null,
    qualPct:    item.leads > 0        ? item.qualLeads    / item.leads            : null,
    cpql:       item.qualLeads > 0    ? expenseKZT / item.qualLeads               : null,
    abcQualPct: item.leads > 0        ? item.abcQualLeads / item.leads            : null,
    cpqlAbc:    item.abcQualLeads > 0 ? expenseKZT / item.abcQualLeads           : null,
    convRate:   item.leads > 0        ? item.sales / item.leads                   : null,
    cac:        item.sales > 0        ? expenseKZT / item.sales                   : null,
    expenseKZT,
  };
}

function aggregateData(leads) {
  const resultMap     = {};
  const mediumSummary = {};

  for (const lead of leads) {
    const { medium, campaign, content, revenue, abcScore, stage, lossReason } = lead;
    const key = `${medium}|${campaign}|${content}`;

    if (!resultMap[key]) {
      resultMap[key] = {
        medium, campaign, content,
        leads: 0, revenue: 0, expense: 0,
        instagram: '', status: '',
        scores: {}, stages: {},
        qualLeads: 0, abcQualLeads: 0, sales: 0,
      };
    }

    const item = resultMap[key];
    item.leads += 1;
    if (SALE_STAGES.includes(stage))          item.revenue      += revenue;
    item.scores[abcScore] = (item.scores[abcScore] || 0) + 1;
    item.stages[stage]    = (item.stages[stage]    || 0) + 1;
    if (isQualLead(stage, lossReason))        item.qualLeads    += 1;
    if (ABC_QUAL_VALUES.includes(abcScore))   item.abcQualLeads += 1;
    if (SALE_STAGES.includes(stage))          item.sales        += 1;

    if (!mediumSummary[medium]) {
      mediumSummary[medium] = {
        leads: 0, revenue: 0, expense: 0,
        qualLeads: 0, abcQualLeads: 0, sales: 0,
      };
    }
    const ms = mediumSummary[medium];
    ms.leads += 1;
    if (SALE_STAGES.includes(stage))          ms.revenue      += revenue;
    if (isQualLead(stage, lossReason))        ms.qualLeads    += 1;
    if (ABC_QUAL_VALUES.includes(abcScore))   ms.abcQualLeads += 1;
    if (SALE_STAGES.includes(stage))          ms.sales        += 1;
  }

  return { resultMap, mediumSummary };
}

function mergeWithAdData(resultMap, mediumSummary, adMap) {
  for (const key in resultMap) {
    const match = adMap[key] || {};
    const item  = resultMap[key];
    item.expense   = match.expense   || 0;
    item.instagram = match.instagram || '';
    item.status    = match.status    || '';

    if (mediumSummary[item.medium]) {
      mediumSummary[item.medium].expense =
        (mediumSummary[item.medium].expense || 0) + item.expense;
    }
  }
}

function buildTableData(resultMap, mediumSummary, usdRate) {
  const rows = [];
  const sortedMediums = Object.keys(mediumSummary).sort();

  const flattenRow = (item, m) => ({
    leads:        item.leads,
    cplUsd:       m.cplUsd     != null ? +m.cplUsd.toFixed(2)     : null,
    revenueKzt:   Math.round(item.revenue),
    expenseUsd:   +item.expense.toFixed(2),
    expenseKzt:   Math.round(m.expenseKZT),
    romi:         m.romi       != null ? +m.romi.toFixed(4)        : null,
    qualPct:      m.qualPct    != null ? +m.qualPct.toFixed(4)     : null,
    qualLeads:    item.qualLeads,
    cpqlKzt:      m.cpql       != null ? Math.round(m.cpql)        : null,
    abcQualPct:   m.abcQualPct != null ? +m.abcQualPct.toFixed(4)  : null,
    abcQualLeads: item.abcQualLeads,
    cpqlAbcKzt:   m.cpqlAbc    != null ? Math.round(m.cpqlAbc)     : null,
    sales:        item.sales,
    convRate:     m.convRate   != null ? +m.convRate.toFixed(4)    : null,
    cacKzt:       m.cac        != null ? Math.round(m.cac)         : null,
  });

  for (const medium of sortedMediums) {
    const ms = mediumSummary[medium];
    const mm = calcMetrics(ms, usdRate);
    rows.push({ type: 'summary', medium, campaign: '▶ ' + medium, content: '',
      ...flattenRow(ms, mm) });

    const entries = Object.values(resultMap)
      .filter(e => e.medium === medium)
      .sort((a, b) => b.leads - a.leads);

    for (const entry of entries) {
      const em = calcMetrics(entry, usdRate);
      rows.push({
        type: 'detail', medium: entry.medium,
        campaign: entry.campaign, content: entry.content,
        status: entry.status, instagram: entry.instagram,
        ...flattenRow(entry, em),
      });
    }
  }

  const grand = Object.values(mediumSummary).reduce((acc, ms) => {
    acc.leads        += ms.leads;
    acc.revenue      += ms.revenue;
    acc.expense      += ms.expense;
    acc.qualLeads    += ms.qualLeads;
    acc.abcQualLeads += ms.abcQualLeads;
    acc.sales        += ms.sales;
    return acc;
  }, { leads: 0, revenue: 0, expense: 0, qualLeads: 0, abcQualLeads: 0, sales: 0 });

  const gm = calcMetrics(grand, usdRate);
  rows.push({ type: 'total', medium: '🏆 ИТОГО', campaign: '', content: '',
    ...flattenRow(grand, gm) });

  return rows;
}

module.exports = {
  norm, normUtm, safeFloat, safeInt, fmtDate,
  extractUtmParam, isQualLead, calcMetrics,
  aggregateData, mergeWithAdData, buildTableData,
  QUAL_STAGES, QUAL_LOSS_REASONS, SALE_STAGES, ABC_QUAL_VALUES,
};
