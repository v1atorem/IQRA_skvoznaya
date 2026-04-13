'use strict';

const { createClient } = require('@supabase/supabase-js');

let _client = null;

function getClient() {
  if (!_client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) throw new Error('SUPABASE_URL и SUPABASE_SERVICE_KEY должны быть заданы');
    _client = createClient(url, key);
  }
  return _client;
}

async function saveRun({ dateFrom, dateTo, stats, rows }) {
  const { data, error } = await getClient()
    .from('runs')
    .insert({
      date_from: dateFrom || null,
      date_to:   dateTo   || null,
      stats,
      rows,
    })
    .select('id')
    .single();

  if (error) throw new Error('Supabase insert error: ' + error.message);
  return data.id;
}

async function getRuns(limit = 50) {
  const { data, error } = await getClient()
    .from('runs')
    .select('id, created_at, date_from, date_to, stats')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error('Supabase select error: ' + error.message);
  return data || [];
}

async function getRunById(id) {
  const { data, error } = await getClient()
    .from('runs')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw new Error('Supabase select error: ' + error.message);
  return data;
}

module.exports = { saveRun, getRuns, getRunById };
