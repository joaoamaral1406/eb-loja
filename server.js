const express    = require('express');
const stripe     = require('stripe')(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder');
const axios      = require('axios');
const Database   = require('better-sqlite3');
const cors       = require('cors');
const bodyParser = require('body-parser');
const path       = require('path');

const app = express();
const db  = new Database('orders.db');

// ─── Serve frontend (fix "Cannot GET /") ──────────────────
app.use(express.static(path.join(__dirname, 'public')));
app.use(cors());
app.use('/webhook', bodyParser.raw({ type: 'application/json' }));
app.use(express.json());

// ─── Banco ────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS orders (
    id             TEXT PRIMARY KEY,
    stripe_session TEXT,
    item_id        TEXT,
    item_name      TEXT,
    item_type      TEXT,
    price          REAL,
    roblox_id      TEXT,
    roblox_nick    TEXT,
    email          TEXT,
    coupon         TEXT,
    discount       REAL DEFAULT 0,
    status         TEXT DEFAULT 'pending',
    delivered      INTEGER DEFAULT 0,
    created_at     DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS coupons (
    code      TEXT PRIMARY KEY,
    type      TEXT,
    value     REAL,
    uses_left INTEGER DEFAULT -1,
    active    INTEGER DEFAULT 1
  );
  CREATE TABLE IF NOT EXISTS items (
    id          TEXT PRIMARY KEY,
    category    TEXT,
    name        TEXT,
    description TEXT,
    price       REAL,
    old_price   REAL,
    image       TEXT,
    featured    INTEGER DEFAULT 0,
    active      INTEGER DEFAULT 1,
    sort_order  INTEGER DEFAULT 0
  );
`);

// Seed inicial de itens
const { n } = db.prepare('SELECT COUNT(*) as n FROM items').get();
if (n === 0) {
  const ins = db.prepare('INSERT INTO items (id,category,name,description,price,old_price,image,featured,active,sort_order) VALUES (?,?,?,?,?,?,?,?,1,?)');
  [
    // ── PATENTES ─────────────────────────────────────────
    // Praças
    ['rec',    'patentes','[REC] Recruta',            'Patente inicial do EB. Acesso aos treinamentos básicos do servidor.',               4.90, null,   '🪖', 0,  1],
    ['sld',    'patentes','[SLD] Soldado',             'Primeiro posto oficial. Participa de operações e missões básicas.',                 9.90, null,   '🎖️',0,  2],
    ['cb',     'patentes','[CB] Cabo',                 'Lidera pequenos grupos em campo. Reconhecimento entre os praças.',                 14.90, null,   '🎖️',0,  3],
    // Sargentos
    ['3sgt',   'patentes','[3º SGT] Terceiro Sargento','Suboficial com autoridade sobre praças. Acesso a treinamentos avançados.',         24.90, null,   '⭐', 0,  4],
    ['2sgt',   'patentes','[2º SGT] Segundo Sargento', 'Supervisor de seção. Pode comandar missões especiais.',                           39.90, null,   '⭐', 0,  5],
    ['1sgt',   'patentes','[1º SGT] Primeiro Sargento','Sargento sênior. Alto prestígio e benefícios exclusivos.',                        59.90, null,   '⭐', 0,  6],
    ['st',     'patentes','[ST] Subtenente',           'Elo entre praças e oficiais. Acesso a salas VIP e missões restritas.',            79.90, 99.90,  '🏅', 1,  7],
    // Oficiais
    ['ct',     'patentes','[CT] Cadete',               'Início da carreira de oficial. Formação e liderança de pelotões.',                89.90, null,   '🏅', 0,  8],
    ['asp',    'patentes','[ASP] Aspirante a Oficial', 'Aspirante com acesso a missões exclusivas de oficiais.',                          109.90,null,   '🏅', 0,  9],
    ['2ten',   'patentes','[2º TEN] Segundo Tenente',  'Oficial júnior. Comanda pelotões e lidera operações táticas.',                   129.90,null,   '🏅', 0, 10],
    ['1ten',   'patentes','[1º TEN] Primeiro Tenente', 'Tenente experiente com maior autonomia operacional.',                            159.90,null,   '🏆', 0, 11],
    ['cap',    'patentes','[CAP] Capitão',              'Comanda companhias inteiras. Acesso a todas as zonas restritas.',               199.90,249.90, '🏆', 1, 12],
    ['maj',    'patentes','[MAJ] Major',                'Oficial de estado-maior. Poderes administrativos ampliados.',                   249.90,null,   '🏆', 0, 13],
    ['tencel', 'patentes','[TENCEL] Tenente Coronel',  'Comanda batalhões. Autoridade máxima abaixo do generalato.',                    299.90,null,   '👑', 0, 14],
    ['cel',    'patentes','[CEL] Coronel',              'Comanda regimentos inteiros. Nível máximo da carreira de oficial.',             399.90,499.90, '👑', 1, 15],
    // Generais
    ['genbda', 'patentes','[GEN BDA] General de Brigada',  'General de brigada. Elite do comando militar.',                             499.90,null,   '🌟', 0, 16],
    ['gendv',  'patentes','[GEN DV] General de Divisão',   'Comanda divisões completas. Um dos postos mais altos.',                     699.90,null,   '🌟', 0, 17],
    ['genex',  'patentes','[GEN EX] General de Exército',  'Cúpula do generalato. Máxima autoridade operacional do EB.',               999.90,null,   '🌟', 0, 18],

    // ── GAMEPASSES ────────────────────────────────────────
    ['vip',      'gamepasses','VIP Pass',          'Tag [VIP] no nome, sala exclusiva e spawn com itens extras.',        14.90, null,   '👑', 0, 1],
    ['2xcoins',  'gamepasses','2x Moedas',         'Ganhe o dobro de moedas em todas as missões e treinamentos.',        19.90, null,   '💰', 0, 2],
    ['arsenal',  'gamepasses','Arsenal Especial',  '5 armas exclusivas + armadura + veículo militar único.',             24.90, null,   '🔫', 1, 3],
    ['admincmd', 'gamepasses','Admin Commands',    'Comandos especiais de administração dentro do jogo.',                49.90, null,   '⚙️', 0, 4],

    // ── ITENS ÚNICOS ──────────────────────────────────────
    ['skin-bip', 'itens','Skin BIP',  'Skin exclusiva da Brigada de Infantaria Paraquedista.',  34.90, null, '🪂', 0, 1],
    ['skin-cie', 'itens','Skin CIE',  'Skin do Centro de Inteligência do Exército.',            34.90, null, '🕵️',0, 2],
    ['skin-rcm', 'itens','Skin RcMec','Skin do Regimento de Cavalaria Mecanizado.',             34.90, null, '🚗', 0, 3],

    // ── DIVISÕES ──────────────────────────────────────────
    ['div-bip',  'divisoes','BIP — Brigada Paraquedista',     'Treinamentos de paraquedismo e operações aerotransportadas.',  49.90, null,  '🪂', 0, 1],
    ['div-cie',  'divisoes','CIE — Centro de Inteligência',   'Divisão de inteligência, espionagem e missões secretas.',      59.90, null,  '🕵️',0, 2],
    ['div-rcm',  'divisoes','RcMec — Cavalaria Mecanizada',   'Divisão de veículos blindados e cavalaria mecanizada.',        49.90, null,  '🚗', 0, 3],
    ['div-bic',  'divisoes','BiCaat — Infantaria Caatinga',   'Especialistas em combate no bioma caatinga.',                  44.90, null,  '🌵', 0, 4],
    ['div-bac',  'divisoes','BAC — Batalhão de Aviação',      'Batalhão de aviação de combate do Exército.',                  54.90, null,  '✈️', 0, 5],
    ['div-bfe',  'divisoes','BFESp — Forças Especiais',       'Batalhão de Forças Especiais de elite.',                       69.90, null,  '⚡', 1, 6],
    ['div-bpe',  'divisoes','BPE — Polícia do Exército',      'Batalhão de Polícia Militar do Exército.',                     49.90, null,  '🛡️', 0, 7],
    ['div-ave',  'divisoes','AvEx — Aviação do Exército',     'Pilotos de elite da aviação militar brasileira.',              59.90, null,  '🚁', 0, 8],

    // ── ESPECIAIS ─────────────────────────────────────────
    ['em',    'especiais','[EM] Elite Militar',    'Posto de elite máxima. Reconhecimento especial dentro do servidor.',          799.90, 999.90, '💎', 1, 1],
    ['es',    'especiais','[ES] Elite Secreta',    'Divisão secreta de operações especiais. Acesso a missões classificadas.',     999.90, null,   '🔐', 0, 2],
    ['er',    'especiais','[ER] Elite Real',        'O mais alto posto da elite. Prestígio máximo entre os membros.',            1199.90,null,   '👁️',0, 3],
    ['vpres', 'especiais','[V PRES] Vice Presidente','Segundo posto mais alto da liderança. Autoridade em todo o servidor.',     1499.90,null,   '🌠', 0, 4],
    ['socio', 'especiais','[SC] Sócio',             'Membro fundador com benefícios vitalícios e acesso total.',                 1999.90,null,   '💠', 0, 5],
    ['scr',   'especiais','[SCR] Sub-Criador',      'Posto de co-criador do servidor. Acesso irrestrito e benefícios únicos.',   2499.90,null,   '🔱', 0, 6],

    // ── BUNDLES ───────────────────────────────────────────
    ['pack-start',  'bundles','Pack Iniciante',  'Soldado + VIP Pass + 500 moedas bônus',                             19.90,  34.90,  '📦', 0, 1],
    ['pack-sgto',   'bundles','Pack Sargento',   'Subtenente + VIP Pass + 2x Moedas',                                 129.90, 199.90, '🎁', 0, 2],
    ['pack-oficial','bundles','Pack Oficial',    'Capitão + VIP Pass + 2x Moedas + Arsenal Especial',                 299.90, 449.90, '🎁', 1, 3],
    ['pack-gen',    'bundles','Pack General',    'General de Brigada + Todos os Gamepasses + 10.000 moedas bônus',    749.90,1149.90, '💎', 0, 4],
    ['pack-elite',  'bundles','Pack Elite',      'Elite Militar + Todos os Gamepasses + Admin Commands + skin',      1299.90,1999.90, '🔱', 0, 5],
  ].forEach(r => ins.run(...r));

  db.prepare("INSERT INTO coupons VALUES ('BEMVINDO10','percent',10,100,1)").run();
  db.prepare("INSERT INTO coupons VALUES ('DESCONTO20','fixed',20,50,1)").run();
}

// ─── Roblox: busca usuário ─────────────────────────────────
app.get('/api/roblox/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const [u, av] = await Promise.all([
      axios.get(`https://users.roblox.com/v1/users/${id}`),
      axios.get(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${id}&size=150x150&format=Png`)
    ]);
    res.json({
      id:          u.data.id,
      name:        u.data.name,
      displayName: u.data.displayName,
      avatar:      av.data.data[0]?.imageUrl || null,
      profileUrl:  `https://www.roblox.com/users/${id}/profile`
    });
  } catch {
    res.status(404).json({ error: 'Usuário não encontrado. Verifique o ID.' });
  }
});

// ─── ENTREGA ───────────────────────────────────────────────
//
//  PATENTES e DIVISÕES  → notificação no Discord (#vendedores)
//                         Um admin humano entra no jogo e dá o rank/slot.
//
//  GAMEPASSES e ITENS   → MessagingService Lua no jogo (automático)
//                         + confirmação no Discord (#vendas)
//
//  BUNDLES              → MessagingService Lua (automático)
// ──────────────────────────────────────────────────────────

// Envia via Roblox Open Cloud MessagingService (para gamepasses/itens)
async function sendMessaging(order) {
  const universeId = process.env.ROBLOX_UNIVERSE_ID;
  const apiKey     = process.env.ROBLOX_OPEN_CLOUD_KEY;
  if (!universeId || !apiKey) throw new Error('ROBLOX_UNIVERSE_ID ou ROBLOX_OPEN_CLOUD_KEY não configurados');
  await axios.post(
    `https://apis.roblox.com/messaging-service/v1/universes/${universeId}/topics/eb_delivery`,
    {
      message: JSON.stringify({
        robloxId:   order.roblox_id,
        robloxNick: order.roblox_nick,
        itemId:     order.item_id,
        itemName:   order.item_name,
        itemType:   order.item_type,
        orderId:    order.id,
      })
    },
    { headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' } }
  );
}

// Notifica vendedores no Discord para dar rank manualmente
async function notifyVendedores(order) {
  const catLabel = order.item_type === 'patentes' ? '🎖️ PATENTE' : order.item_type === 'especiais' ? '💎 ESPECIAL' : '🪖 DIVISÃO';
  await discord(process.env.DISCORD_WEBHOOK_VENDEDORES, {
    title: `${catLabel} — Entrega Manual Necessária`,
    color: 0xc9962a,
    description: '**Um admin deve entrar no jogo e dar o rank/slot abaixo:**',
    fields: [
      { name: '👤 Nick Roblox',  value: `**@${order.roblox_nick}**`,           inline: true  },
      { name: '🆔 ID Roblox',    value: `\`${order.roblox_id}\``,              inline: true  },
      { name: '🎖️ Item',         value: `**${order.item_name}**`,              inline: false },
      { name: '💵 Valor pago',   value: `R$ ${order.price.toFixed(2)}`,        inline: true  },
      { name: '🧾 Pedido',       value: `\`${order.id}\``,                     inline: true  },
      { name: '🔗 Perfil',       value: `https://www.roblox.com/users/${order.roblox_id}/profile`, inline: false },
    ],
    footer: { text: '✅ Pagamento confirmado pelo Stripe · Entregue manualmente' },
    timestamp: new Date().toISOString(),
  });
}

// Roteador principal de entrega
async function deliver(order) {
  if (order.item_type === 'patentes' || order.item_type === 'divisoes') {
    // Notifica Discord #vendedores para entrega manual
    await notifyVendedores(order);
  } else {
    // Gamepasses, itens únicos e bundles → automático via Lua
    await sendMessaging(order);
  }
}

// ─── Discord ───────────────────────────────────────────────
async function discord(url, embed) {
  if (!url) return;
  try { await axios.post(url, { username: 'EB · Loja Bot', embeds: [embed] }); } catch {}
}

// ─── API: itens ────────────────────────────────────────────
app.get('/api/items', (_, res) =>
  res.json(db.prepare('SELECT * FROM items WHERE active=1 ORDER BY category,sort_order,name').all())
);

// ─── API: cupom ────────────────────────────────────────────
app.post('/api/coupon', (req, res) => {
  const { code, price } = req.body;
  const c = db.prepare('SELECT * FROM coupons WHERE code=? AND active=1').get((code||'').toUpperCase());
  if (!c)              return res.status(404).json({ error: 'Cupom inválido ou expirado.' });
  if (c.uses_left===0) return res.status(400).json({ error: 'Cupom esgotado.' });
  const discount   = c.type==='percent' ? +(price*c.value/100).toFixed(2) : Math.min(c.value, price-0.50);
  const finalPrice = +(price - discount).toFixed(2);
  res.json({ valid:true, type:c.type, value:c.value, discount, finalPrice });
});

// ─── API: checkout ─────────────────────────────────────────
app.post('/api/checkout', async (req, res) => {
  const { itemId, robloxId, robloxNick, email, couponCode } = req.body;
  if (!itemId||!robloxId||!robloxNick||!email) return res.status(400).json({ error:'Dados incompletos.' });

  const item = db.prepare('SELECT * FROM items WHERE id=? AND active=1').get(itemId);
  if (!item) return res.status(404).json({ error:'Item não encontrado.' });

  let finalPrice = item.price, discount = 0, couponUsed = null;
  if (couponCode) {
    const c = db.prepare('SELECT * FROM coupons WHERE code=? AND active=1').get(couponCode.toUpperCase());
    if (c && c.uses_left!==0) {
      discount   = c.type==='percent' ? +(item.price*c.value/100).toFixed(2) : Math.min(c.value,item.price-0.50);
      finalPrice = +(item.price-discount).toFixed(2);
      couponUsed = c.code;
    }
  }

  const oid = 'EB-'+Date.now()+'-'+Math.random().toString(36).slice(2,6).toUpperCase();
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{ price_data:{ currency:'brl', product_data:{ name:`[EB] ${item.name}`, description:`Para: ${robloxNick}` }, unit_amount: Math.round(finalPrice*100) }, quantity:1 }],
      mode: 'payment',
      customer_email: email,
      success_url: `${process.env.FRONTEND_URL||'http://localhost:3000'}/?success=true&order=${oid}`,
      cancel_url:  `${process.env.FRONTEND_URL||'http://localhost:3000'}/?canceled=true`,
      metadata: { order_id:oid, item_id:itemId, item_type:item.category, item_name:item.name, roblox_id:robloxId, roblox_nick:robloxNick, email },
    });

    db.prepare('INSERT INTO orders (id,stripe_session,item_id,item_name,item_type,price,roblox_id,roblox_nick,email,coupon,discount) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
      .run(oid, session.id, itemId, item.name, item.category, finalPrice, robloxId, robloxNick, email, couponUsed, discount);
    if (couponUsed) db.prepare("UPDATE coupons SET uses_left=CASE WHEN uses_left>0 THEN uses_left-1 ELSE uses_left END WHERE code=?").run(couponUsed);

    res.json({ sessionId: session.id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Webhook Stripe ────────────────────────────────────────
app.post('/webhook', async (req, res) => {
  let event;
  try { event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET||''); }
  catch { return res.status(400).send('Webhook error'); }

  if (event.type === 'checkout.session.completed') {
    const order = db.prepare('SELECT * FROM orders WHERE stripe_session=?').get(event.data.object.id);
    if (!order) return res.json({ ok:true });
    db.prepare("UPDATE orders SET status='paid' WHERE id=?").run(order.id);
    let delivered = false;
    try { await deliver(order); db.prepare("UPDATE orders SET delivered=1 WHERE id=?").run(order.id); delivered = true; }
    catch (err) { await discord(process.env.DISCORD_WEBHOOK_ALERTAS, { title:'⚠️ Erro na Entrega!', color:0xff9800, fields:[{name:'Item',value:order.item_name,inline:true},{name:'Nick',value:order.roblox_nick,inline:true},{name:'Erro',value:err.message,inline:false}] }); }
    await discord(process.env.DISCORD_WEBHOOK_VENDAS, { title:'✅ Nova Venda!', color:0x4caf50, fields:[{name:'Item',value:order.item_name,inline:true},{name:'Valor',value:`R$ ${order.price.toFixed(2)}`,inline:true},{name:'Nick Roblox',value:order.roblox_nick,inline:true},{name:'ID Roblox',value:order.roblox_id,inline:true},{name:'Pedido',value:order.id,inline:false},{name:'Entregue',value:delivered?'✅ Automático':'❌ Falhou',inline:true}], timestamp:new Date().toISOString() });
  }

  if (event.type === 'charge.dispute.created') {
    const order = db.prepare("SELECT * FROM orders WHERE status='paid' ORDER BY created_at DESC LIMIT 1").get();
    await discord(process.env.DISCORD_WEBHOOK_ALERTAS, { title:'🚨 CHARGEBACK!', color:0xe74c3c, description:'**Remova o item do jogador imediatamente!**', fields:[{name:'Nick',value:order?.roblox_nick||'?',inline:true},{name:'ID',value:order?.roblox_id||'?',inline:true},{name:'Item',value:order?.item_name||'?',inline:true}], timestamp:new Date().toISOString() });
    if (order) db.prepare("UPDATE orders SET status='chargeback' WHERE id=?").run(order.id);
  }

  res.json({ received:true });
});

// ─── Admin ────────────────────────────────────────────────
function auth(req,res,next){ req.headers['x-admin-secret']===process.env.ADMIN_SECRET ? next() : res.status(401).json({error:'Não autorizado'}); }
app.get('/admin/orders',               auth, (q,r)=>r.json(db.prepare('SELECT * FROM orders ORDER BY created_at DESC LIMIT 500').all()));
app.get('/admin/items',                auth, (q,r)=>r.json(db.prepare('SELECT * FROM items ORDER BY category,sort_order').all()));
app.post('/admin/items',               auth, (req,res)=>{ const {id,category,name,description,price,old_price,image,featured}=req.body; db.prepare('INSERT OR REPLACE INTO items (id,category,name,description,price,old_price,image,featured,active,sort_order) VALUES (?,?,?,?,?,?,?,?,1,0)').run(id,category,name,description,price,old_price||null,image||'🎖️',featured||0); res.json({ok:true}); });
app.put('/admin/items/:id',            auth, (req,res)=>{ const {name,description,price,old_price,image,featured,active}=req.body; db.prepare('UPDATE items SET name=?,description=?,price=?,old_price=?,image=?,featured=?,active=? WHERE id=?').run(name,description,price,old_price||null,image,featured||0,active??1,req.params.id); res.json({ok:true}); });
app.delete('/admin/items/:id',         auth, (req,res)=>{ db.prepare('UPDATE items SET active=0 WHERE id=?').run(req.params.id); res.json({ok:true}); });
app.get('/admin/coupons',              auth, (q,r)=>r.json(db.prepare('SELECT * FROM coupons').all()));
app.post('/admin/coupons',             auth, (req,res)=>{ const {code,type,value,uses_left}=req.body; db.prepare('INSERT OR REPLACE INTO coupons VALUES (?,?,?,?,1)').run(code.toUpperCase(),type,value,uses_left??-1); res.json({ok:true}); });
app.delete('/admin/coupons/:code',     auth, (req,res)=>{ db.prepare('UPDATE coupons SET active=0 WHERE code=?').run(req.params.code); res.json({ok:true}); });
app.post('/admin/redeliver/:orderId',  auth, async (req,res)=>{ const o=db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.orderId); if(!o) return res.status(404).json({error:'Não encontrado'}); try{ await deliver(o); db.prepare("UPDATE orders SET delivered=1 WHERE id=?").run(o.id); res.json({ok:true}); }catch(err){ res.status(500).json({error:err.message}); } });
app.get('/api/stats', (_,res)=>res.json({ totalSales: db.prepare("SELECT COUNT(*) as n FROM orders WHERE status IN ('paid','delivered')").get().n }));
app.get('/health', (_,res)=>res.json({ok:true}));

const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=>console.log(`🎖  EB Loja → http://localhost:${PORT}`));
