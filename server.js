const express = require('express');
const cors = require('cors');
const cron = require('node-cron');

const app = express();
const PORT = process.env.PORT || 3000;

const CULTS_USER    = process.env.CULTS_USER    || '';
const CULTS_API_KEY = process.env.CULTS_API_KEY || '';
const SHOPIFY_DOMAIN = process.env.SHOPIFY_DOMAIN || 'fabricreator.com';

app.use(cors({ origin: '*' }));
app.use(express.json());

const cache = {
  creations: { data: null, ts: 0 },
  stats:     { data: null, ts: 0 },
  sales:     { data: null, ts: 0 },
};
const TTL = 30 * 60 * 1000;

async function cultsQuery(query) {
  const credentials = Buffer.from(CULTS_USER + ':' + CULTS_API_KEY).toString('base64');
  const res = await fetch('https://cults3d.com/graphql', {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + credentials,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: query }),
  });
  return res.json();
}

app.get('/api/creations', async (req, res) => {
  try {
    const now = Date.now();
    if (cache.creations.data && (now - cache.creations.ts) < TTL) {
      return res.json(cache.creations.data);
    }
    const limit = req.query.limit || 20;
    const data = await cultsQuery('{ creations(limit: ' + limit + ', nick: "' + CULTS_USER + '") { name url description likesCount viewsCount illustrations { imageUrl } tags } }');
    cache.creations = { data: data, ts: now };
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener disenos' });
  }
});

app.get('/api/stats', async (req, res) => {
  try {
    const now = Date.now();
    if (cache.stats.data && (now - cache.stats.ts) < TTL) {
      return res.json(cache.stats.data);
    }
    const data = await cultsQuery('{ me { nick avatarUrl followersCount followingsCount totalSalesAmount viewsCount creationsCount } }');
    cache.stats = { data: data, ts: now };
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener estadisticas' });
  }
});

app.get('/api/sales', async (req, res) => {
  try {
    const now = Date.now();
    if (cache.sales.data && (now - cache.sales.ts) < TTL) {
      return res.json(cache.sales.data);
    }
    const data = await cultsQuery('{ me { sales(limit: 20) { soldAt appliedAmount creation { name url } } } }');
    cache.sales = { data: data, ts: now };
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener ventas' });
  }
});

app.post('/api/refresh', (req, res) => {
  cache.creations = { data: null, ts: 0 };
  cache.stats     = { data: null, ts: 0 };
  cache.sales     = { data: null, ts: 0 };
  res.json({ ok: true, message: 'Cache limpiado' });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', user: CULTS_USER || 'sin configurar' });
});

cron.schedule('*/30 * * * *', async () => {
  try {
    const data = await cultsQuery('{ creations(limit: 20, nick: "' + CULTS_USER + '") { name url likesCount viewsCount illustrations { imageUrl } } }');
    cache.creations = { data: data, ts: Date.now() };
    console.log('Cache actualizado OK');
  } catch (e) {
    console.error('Error cron:', e.message);
  }
});

app.listen(PORT, () => {
  console.log('Cults Hub corriendo en puerto ' + PORT);
  console.log('Usuario: ' + (CULTS_USER || 'CULTS_USER no configurado'));
  console.log('API Key: ' + (CULTS_API_KEY ? 'configurada' : 'CULTS_API_KEY no configurada'));
});
