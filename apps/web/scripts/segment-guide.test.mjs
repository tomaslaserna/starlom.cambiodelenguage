import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from 'typescript';
const require = createRequire(import.meta.url);
function load(name, aliases = {}) {
  const js = ts.transpileModule(readFileSync(new URL(`../src/lib/${name.endsWith('.tsx')?name:`${name}.ts`}`, import.meta.url), 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const m = {exports:{}};
  Function('require','module','exports',js)(s=>aliases[s]??require(s),m,m.exports);
  return m.exports;
}
const domain = () => load('segment-guide-domain', {'@/lib/timezone':load('timezone'),'@/lib/order-pricing':load('order-pricing')});
const row = (extra={}) => ({segment:'Restaurante',customer_count:'10',order_count:'20',product_id:'p',product_name:'Detergente 5 L',product_code:'D5',presentation_units:'1',buyers:'2',product_orders:'3',average_quantity:'2.5',...extra});
test('90 complete Argentina days excludes the local current day',()=>{
  assert.deepEqual(domain().segmentGuidePeriod(new Date('2026-11-27T01:00:00Z')), {from:'2026-08-28',until:'2026-11-26',through:'2026-11-25',generatedOn:'2026-11-26'});
});
test('confirmed empty categories persist; threshold and average retain their denominators',()=>{
  const guide=domain().buildSegmentGuide([row(),row({product_id:'rare',buyers:'1'})],['Restaurante','Carnicería'],domain().segmentGuidePeriod(new Date('2026-11-27T15:00:00Z')));
  const r=guide.segments.find(x=>x.segment==='Restaurante');
  assert.equal(r.products[0].quantity,3);
  assert.equal(r.products[0].averageQuantity,2.5);
  assert.equal(r.products[0].orderCount,3);
  assert.equal(r.products[0].habitual,true);
  assert.equal(r.products[1].habitual,false);
  assert.equal(guide.segments.find(x=>x.segment==='Carnicería').products.length,0);
  assert.equal('clientId' in r.products[0],false);
});
test('one buyer is preliminary but usable; 20 percent is inclusive; cap does not fill with occasional products',()=>{
  const d=domain();
  const g=d.buildSegmentGuide([row({customer_count:'1',buyers:'1'}),...Array.from({length:25},(_,i)=>row({product_id:`p${i}`}))],['Restaurante'],d.segmentGuidePeriod());
  assert.equal(d.segmentBaseLines(g.segments[0]).length,20);
  const small=d.buildSegmentGuide([row({customer_count:'1',buyers:'1'})],[],d.segmentGuidePeriod()).segments[0];
  assert.equal(small.preliminary,true);
  assert.equal(d.segmentBaseLines(small).length,1);
  const occasional=d.buildSegmentGuide([row({buyers:'1'})],[],d.segmentGuidePeriod()).segments[0];
  assert.equal(d.segmentBaseLines(occasional).length,0);
});
test('base uses current selected-list pricing; no historical price or zero-priced line',()=>{
  const d=domain();
  const group=d.buildSegmentGuide([row(),row({product_id:'zero'}),row({product_id:'gone'})],[],d.segmentGuidePeriod()).segments[0];
  const result=d.pricedSegmentBase(group,[{id:'p',prices:{'L2 - ANCLA':123}},{id:'zero',prices:{'L2 - ANCLA':0}}],'L2 - ANCLA');
  assert.deepEqual(result.lines,[{productId:'p',quantity:'3',discount:'0'}]);
  assert.equal(result.unavailable.length,2);
});
test('real SQL consolidates per-order lines, subtracts operational NC once, excludes other tenants and noncanonical or undelivered sales',async()=>{
  const {PGlite}=await import('@electric-sql/pglite');
  const db=new PGlite();
  try {
    await db.exec(`CREATE TABLE clients(id text,empresa_id int,business_segment text);
      CREATE TABLE products(id text,empresa_id int,name text,sku text,presentation_units numeric,active boolean);
      CREATE TABLE sales(id text,empresa_id int,client_id text,sale_date date,order_status text,status text,source_sheet text);
      CREATE TABLE sale_items(sale_id text,empresa_id int,product_id text,quantity numeric);
      CREATE TABLE sales_internal_documents(empresa_id int,sale_id text,class_name text,fiscal boolean,operational_document_id text,detail_json jsonb);
      INSERT INTO clients VALUES ('c1',1,'Restaurante'),('c2',1,'Restaurante'),('c3',2,'Restaurante'),('empty',1,'Bar'),('unconfirmed',1,NULL);
      INSERT INTO products VALUES ('p',1,'Detergente','D',1,true),('inactive',1,'Viejo','V',1,false),('p2',2,'Ajeno','A',1,true);
      INSERT INTO sales VALUES ('s1',1,'c1','2026-11-01','entregado',NULL,NULL),('s2',1,'c2','2026-11-02','entregado',NULL,NULL),('cancel',1,'c1','2026-11-02','cancelado',NULL,NULL),('duplicate',1,'c1','2026-11-02','entregado',NULL,'bad-sheet'),('tenant',2,'c3','2026-11-02','entregado',NULL,NULL),('today',1,'c1','2026-11-27','entregado',NULL,NULL),('old',1,'c1','2026-01-01','entregado',NULL,NULL),('unknown',1,'unconfirmed','2026-11-02','entregado',NULL,NULL),('returned',1,'c1','2026-11-02','entregado',NULL,NULL);
      INSERT INTO sale_items VALUES ('s1',1,'p',2),('s1',1,'p',4),('s2',1,'p',2),('cancel',1,'p',100),('duplicate',1,'p',100),('tenant',2,'p2',100),('today',1,'p',100),('old',1,'p',100),('unknown',1,'p',100),('s1',1,'inactive',100),('returned',1,'p',4);
      INSERT INTO sales_internal_documents VALUES (1,'s1','NC',false,NULL,'[{"id":"p","quantity":2}]'),(1,'s1','NC',true,'mirror','[{"id":"p","quantity":2}]'),(2,'s1','NC',false,NULL,'[{"id":"p","quantity":99}]'),(1,'returned','NC',false,NULL,'[{"id":"p","quantity":4}]');`);
    const guide=load('segment-guide',{'@/lib/segment-guide-domain':domain(),'@/lib/customer-segments':{CUSTOMER_BUSINESS_SEGMENTS:['Restaurante','Bar','Carnicería']},'@/lib/db':{queryWithCompanyContext:(_c,sql,params)=>db.query(sql,params)},'@/lib/order-status':load('order-status'),'@/lib/sales-source-sql':load('sales-source-sql')});
    const result=await guide.getSegmentGuide(1,new Date('2026-11-27T15:00:00Z'));
    const r=result.segments.find(x=>x.segment==='Restaurante');
    assert.equal(r.customerCount,2);
    assert.equal(r.orderCount,2);
    assert.equal(r.products.length,1);
    assert.equal(r.products[0].averageQuantity,3);
    assert.equal(r.products[0].buyerCount,2);
    assert.equal(r.products[0].orderCount,2);
    assert.equal(result.segments.find(x=>x.segment==='Bar').products.length,0);
  } finally {await db.close();}
});

test('PDF contains real index pages, all products including occasional purchases, and empty categories',async()=>{
  const d=domain();
  const guide=d.buildSegmentGuide(Array.from({length:85},(_,i)=>row({product_id:`p${i}`,product_name:`Producto ${i} presentación bidón 5 litros`,buyers:i%2?'1':'2'})),['Restaurante','Carnicería'],d.segmentGuidePeriod(new Date('2026-11-27T15:00:00Z')));
  const renderer=load('pdf/renderer',{'../format':load('format')});
  const drawn=[];
  const pdf=load('pdf/segment-guide',{'@/lib/pdf/renderer':{...renderer,createPdfFile:(filename,build)=>renderer.createPdfFile(filename,async ctx=>{
    const doc=ctx.pdf.doc; let page=0;
    doc.on('pageAdded',()=>{page=doc.bufferedPageRange().count-1;});
    const switchTo=doc.switchToPage.bind(doc); doc.switchToPage=n=>{page=n;return switchTo(n);};
    const text=doc.text.bind(doc); doc.text=(s,...args)=>{drawn.push({text:String(s),page});return text(s,...args);};
    await build(ctx);
  })}});
  const result=await pdf.buildSegmentGuidePdf(guide);
  assert.ok(result.buffer.length>1000);
  const all=drawn.map(x=>x.text).join('\n');
  assert.match(all,/Sin historial suficiente/);
  assert.match(all,/Producto 84/);
  assert.match(all,/Ocasionales/);
  const first=drawn.find(p=>p.page>=2 && p.text==='Restaurante');
  assert.ok(first);
  const index=drawn.filter(p=>p.page===1).map(p=>p.text).join('\n');
  assert.match(index,new RegExp(`Restaurante[\\s.]+${first.page+1}`));
  assert.ok((result.buffer.toString('latin1').match(/\/Type \/Page\b/g)||[]).length>=5);
  if(process.env.SEGMENT_GUIDE_PDF_FIXTURE) writeFileSync(process.env.SEGMENT_GUIDE_PDF_FIXTURE,result.buffer);
});

test('migration permits Carnicería in customers and leads, preserves existing categories and rejects unknown ones',async()=>{
  const {PGlite}=await import('@electric-sql/pglite');
  const db=new PGlite();
  try {
    await db.exec(`CREATE TABLE clients(id int,business_segment text,business_segment_suggested text);
      CREATE TABLE crm_leads(id int,business_segment text);
      INSERT INTO clients VALUES (1,'Restaurante',NULL);`);
    const sql=readFileSync(new URL('../../../supabase/migrations/20261127164458_add_carniceria_business_segment.sql',import.meta.url),'utf8');
    await db.exec(sql);
    await db.exec(sql);
    await db.exec(`INSERT INTO clients VALUES (2,'Carnicería','Carnicería'); INSERT INTO crm_leads VALUES (2,'Carnicería');`);
    assert.equal((await db.query('SELECT business_segment FROM clients WHERE id=1')).rows[0].business_segment,'Restaurante');
    await assert.rejects(db.exec(`INSERT INTO clients VALUES (3,'Inventado',NULL)`));
    const segments=load('customer-segments').CUSTOMER_BUSINESS_SEGMENTS;
    for(const segment of segments) await db.query('INSERT INTO crm_leads VALUES (4,$1)',[segment]);
  } finally {await db.close();}
});

test('PDF endpoint requires a staff session, scopes aggregates to the session company, and disables shared caching',async()=>{
  let authenticated=false; const companies=[];
  const renderer=load('pdf/renderer',{'../format':load('format')});
  const route=load('../app/api/bank/segment-guide/route',{
    '@/lib/route-auth':{requireApiSession:async()=>{if(!authenticated)throw Object.assign(new Error('No autenticado'),{status:401});return {companyId:73};}},
    '@/lib/segment-guide':{getSegmentGuide:async company=>{companies.push(company);return {company};}},
    '@/lib/pdf/segment-guide':{buildSegmentGuidePdf:async guide=>{assert.equal(guide.company,73);return {buffer:Buffer.from('%PDF-test'),filename:'guide.pdf'};}},
    '@/lib/pdf/renderer':renderer,
    '@/lib/api-response':{handleApiError:e=>new Response(e.message,{status:e.status||500})},
  });
  const request={nextUrl:new URL('https://starlim.vercel.app/api/bank/segment-guide?download=1')};
  assert.equal((await route.GET(request)).status,401);
  assert.deepEqual(companies,[]);
  authenticated=true;
  const response=await route.GET(request);
  assert.equal(response.status,200);
  assert.equal(response.headers.get('cache-control'),'private, no-store');
  assert.match(response.headers.get('content-disposition'),/^attachment/);
  assert.deepEqual(companies,[73]);
});

function renderQuoteFields({name='',price=123}={}) {
  const React=require('react');
  const {renderToStaticMarkup}=require('react-dom/server');
  const ui=new Proxy({}, {get:(_target,key)=>props=>{
    const {children,name,value,disabled,type,href,id}=props;
    if(key==='Button')return React.createElement('button',{disabled,type},children);
    if(key==='ButtonLink')return React.createElement('a',{href},children);
    if(key==='Input'||key==='SearchableSelect')return React.createElement('input',{name,value,disabled,type,id,readOnly:true,'aria-label':props['aria-label']});
    if(key==='Select')return React.createElement('select',{name,value,onChange:()=>{}},children);
    if(key==='Textarea')return React.createElement('textarea',{name,value,readOnly:true});
    return React.createElement('div',null,children);
  }});
  const {QuoteEntryFields}=load('../app/quotes/quote-entry-fields.tsx',{
    '@/components/ui':ui,'@/lib/format':load('format'),'@/lib/order-pricing':load('order-pricing'),
    '@/lib/receipt-types':load('receipt-types'),'@/lib/vat-calculation':load('vat-calculation'),
  });
  return renderToStaticMarkup(React.createElement(QuoteEntryFields,{
    clients:[],vendors:[],priceLists:[{name:'L2 - ANCLA'}],
    products:[{id:'p',name:'Detergente 5 L',code:'D',available:4,presentationUnits:1,cost:5,prices:{'L2 - ANCLA':price}}],
    initialValues:{customerId:'',customerName:name,assignedSellerId:'seller',validityDays:'15',priceListOverride:'L2 - ANCLA',lines:[{productId:'p',quantity:'3',discount:'0'}]},
  }));
}

test('base products are immediately visible and editable even before the prospect name is filled',()=>{
  const html=renderQuoteFields();
  assert.match(html,/aria-label="Cantidad Detergente 5 L"/);
  assert.match(html,/<button disabled="" type="submit">Crear presupuesto formal/);
  assert.match(html,/name="customerName"[^>]*value=""/);
});

test('a changed list with no price blocks submission and WhatsApp instead of silently quoting at zero',()=>{
  const html=renderQuoteFields({name:'Prospecto',price:0});
  assert.match(html,/Hay productos sin precio vigente/);
  assert.match(html,/<button disabled="" type="submit">Crear presupuesto formal/);
  assert.doesNotMatch(html,/href="https:\/\/wa.me/);
});
