// Isolated browser regression: real page components/CSS, mocked auth, APIs and Stripe.
// Never loads .env files or contacts payment/email/database services.
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { mkdir, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const out = path.resolve('output/vision-checkout-browser');
await mkdir(out, { recursive: true });
const mocks = {
  'next/navigation': `export const useRouter = () => ({replace: p => window.destination = p, push: p => window.destination = p}); export const useSearchParams = () => new URLSearchParams(location.search);`,
  'next/link': `import React from 'react'; export default function Link(p) { return <a {...p}/>; }`,
  '@stripe/stripe-js': `export const loadStripe = () => Promise.resolve({});`,
  '@stripe/react-stripe-js': `import React from 'react'; export const Elements = ({children}) => children; export const PaymentElement = ({options}) => <div data-testid="mock-stripe" data-methods={options.paymentMethodOrder.join(',')}><label>Card details (mock)<input placeholder="Card number" /></label></div>; export const useStripe = () => ({confirmPayment: async () => {window.calls.push('stripe.confirmPayment'); return window.scenario === 'decline' ? {error:{message:'Mock card declined'}} : {};}}); export const useElements = () => ({fetchUpdates:async()=>{}});`,
  '@/lib/supabase-client': `export const supabase = {auth:{getSession:async()=>({data:{session: location.search.includes('member=1') ? {access_token:'fixture-token'} : null}})}};`,
  '@/lib/posthog/client': `export const POSTHOG_EVENTS = {}; export const track=()=>{}; export const captureClientException=()=>{}; export const consumeStepDurationMs=()=>0; export const getStepDurationMs=()=>0; export const incrementRetryCount=()=>0; export const markStepStart=()=>{};`,
  '@/components/AbandonmentFeedbackExperiment': `export default function Feedback(){return null;}`,
};
await build({
  stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import Checkout from './src/app/checkout/page'; import Success from './src/app/checkout/success/SuccessClient'; import './src/styles/globals.css'; createRoot(document.getElementById('root')).render(location.pathname === '/success' ? <Success/> : <Checkout/>);`, resolveDir: process.cwd(), loader: 'tsx' },
  outfile: path.join(out, 'app.js'), bundle: true, jsx: 'automatic', external: ['/*.png'],
  define: { 'process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY': '"pk_test_mock"', 'process.env.NODE_ENV': '"development"' },
  plugins: [{name:'isolated-services', setup(b) {
    b.onResolve({filter:/.*/}, args => mocks[args.path] ? {path:args.path,namespace:'mock'} : undefined);
    b.onLoad({filter:/.*/,namespace:'mock'}, args => ({contents:mocks[args.path],loader:'jsx',resolveDir:process.cwd()}));
  }}],
});
const server = createServer(async (req,res) => {
  if (req.url === '/app.js' || req.url === '/app.css') {
    res.setHeader('Content-Type', req.url.endsWith('.css') ? 'text/css' : 'application/javascript');
    res.end(await readFile(path.join(out, req.url.slice(1))));
  } else res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({headless:true, channel:'msedge'});
try {
  for (const viewport of [{width:1440,height:900},{width:1280,height:800},{width:390,height:900}]) for (const member of [false,true]) {
    for (const scenario of ['success','decline','quote-change']) {
      const {width,height}=viewport;
      const page = await browser.newPage({viewport});
      await page.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
      await page.addInitScript(({scenario}) => {
        window.calls=[]; window.scenario=scenario;
        let quotes=0;
        window.fetch=async(url,options={})=>{
          window.calls.push({url,options});
          if (url.includes('vision-carrier')) throw Error('Carrier endpoint must never be called');
          const order={id:'fixture-order',status:'pending',total_amount_cents:12198,amount_due_cents:12198,shipping_cents:999,payment_intent_id:'pi_mock',rx_source:'upload'};
          let body;
          if (url==='/api/checkout/pay') { quotes++; body={...order,clientSecret:'secret_mock', total_amount_cents:scenario==='quote-change' && quotes>1 ? 12298:12198, amount_due_cents:scenario==='quote-change' && quotes>1 ? 12298:12198}; }
          else if (url==='/api/checkout/authorized') body={ok:true,orderId:order.id,next:'success',mode:'uploaded'};
          else body={order};
          return {ok:true,json:async()=>body};
        };
      }, {scenario});
      await page.goto(`${origin}/checkout?orderId=fixture-order${member?'&member=1':''}`);
      await page.getByRole('button',{name:'Place order securely'}).waitFor();
      assert.equal(await page.getByRole('combobox').count(),0);
      assert.equal(await page.getByText('Have vision insurance?').count(),0);
      const bodyText=await page.locator('body').innerText();
      assert.ok(bodyText.includes('$111.99'));
      assert.ok(bodyText.includes('$9.99'));
      assert.ok(bodyText.includes('$121.98'));
      assert.equal(await page.getByTestId('mock-stripe').getAttribute('data-methods'),'card,link,us_bank_account,affirm,cashapp');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      const layout=await page.evaluate(()=>{
        const summaryHeading=[...document.querySelectorAll('h2')].find(el=>el.textContent==='Order Summary');
        const paymentHeading=[...document.querySelectorAll('h2')].find(el=>el.textContent==='Payment');
        const summary=summaryHeading.parentElement.getBoundingClientRect();
        const payment=paymentHeading.closest('form').parentElement.getBoundingClientRect();
        return {summary:{top:summary.top,right:summary.right,bottom:summary.bottom},payment:{top:payment.top,left:payment.left},scrollHeight:document.documentElement.scrollHeight,viewportHeight:innerHeight};
      });
      if(width>800){
        assert.ok(Math.abs(layout.summary.top-layout.payment.top)<=2);
        assert.ok(layout.summary.right<=layout.payment.left);
        assert.ok(layout.scrollHeight<=layout.viewportHeight,`desktop checkout should fit ${width}x${height} without scrolling`);
      } else {
        assert.ok(layout.summary.bottom<layout.payment.top);
      }
      await page.getByRole('button',{name:'Place order securely'}).click();
      if (scenario==='success') await page.waitForFunction(()=>window.destination?.startsWith('/checkout/success'));
      else await page.getByText(scenario==='decline'?'Mock card declined':'Your order total was refreshed. Please review the updated total and submit again.').waitFor();
      const calls=await page.evaluate(()=>window.calls);
      assert.equal(calls.filter(c=>c==='stripe.confirmPayment').length,scenario==='quote-change'?0:1);
      assert.equal(calls.filter(c=>c.url==='/api/checkout/authorized').length,scenario==='success'?1:0);
      for (const call of calls.filter(c=>c.url==='/api/checkout/pay')) {
        assert.deepEqual(JSON.parse(call.options.body),{orderId:'fixture-order'});
        assert.equal(call.options.headers.Authorization,member?'Bearer fixture-token':undefined);
      }
      if(scenario==='success') await page.screenshot({path:path.join(out,`checkout-${width}-${member?'member':'guest'}.png`),fullPage:true});
      await page.close();
      console.log(`PASS checkout ${width}px ${member?'member':'guest'} ${scenario}`);
    }
  }
  for (const width of [1440,390]) for (const mode of ['uploaded','passive','unknown']) {
    const page=await browser.newPage({viewport:{width,height:900}});
    await page.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
    await page.addInitScript(()=>{window.fetch=async()=>({ok:true,json:async()=>({order:{id:'fixture-order',status:'authorized'}})});});
    await page.goto(`${origin}/success?orderId=fixture-order&mode=${mode}`);
    await page.getByRole('heading',{name:'Have vision insurance?'}).waitFor();
    assert.equal(await page.getByRole('combobox').count(),0);
    assert.match(await page.locator('body').innerText(),/out-of-network provider for all vision plans/);
    assert.match(await page.locator('body').innerText(),/after payment is captured/);
    await page.getByRole('button',{name:'View Your Order'}).click();
    assert.equal(await page.evaluate(()=>window.destination),'/order/fixture-order');
    if(mode==='uploaded') await page.screenshot({path:path.join(out,`success-${width}.png`),fullPage:true});
    await page.close();
    console.log(`PASS success ${width}px ${mode}`);
  }
} finally { await browser.close(); await new Promise(resolve=>server.close(resolve)); }
