const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const bundlePath = path.join(root, 'assets', 'index-BT5Zs9ye.js');
const cssPath = path.join(root, 'assets', 'index-VvnKvMSq.css');
const manifestPath = path.join(root, 'assets', 'question-banks.json');
const bundle = fs.readFileSync(bundlePath, 'utf8');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
let passed = 0;

function test(name, fn) {
  try { fn(); passed++; console.log(`PASS ${name}`); }
  catch (err) { console.error(`FAIL ${name}\n  ${err.message}`); process.exitCode = 1; }
}

function normalizeProgress(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const attempts = Number.isFinite(Number(source.attempts)) ? Math.max(0, Number(source.attempts)) : 0;
  const correct = Number.isFinite(Number(source.correct)) ? Math.max(0, Math.min(Number(source.correct), attempts)) : 0;
  return { attempts, correct, bySubject: source.bySubject && typeof source.bySubject === 'object' ? source.bySubject : {} };
}

function request(port, pathname) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: pathname }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body, headers: res.headers }));
    }).on('error', reject);
  });
}

test('required deploy files exist', () => {
  for (const file of ['index.html', 'app/index.html', '404.html', bundlePath, cssPath, manifestPath, 'manifest.webmanifest']) {
    assert.ok(fs.existsSync(path.isAbsolute(file) ? file : path.join(root, file)), `missing ${file}`);
  }
});

test('JavaScript bundle parses', () => {
  execFileSync(process.execPath, ['--check', bundlePath], { stdio: 'pipe' });
});

test('question-bank manifest is structurally complete', () => {
  assert.ok(manifest.grades.length >= 4);
  assert.ok(manifest.subjects.length >= 10);
  for (const rule of ['uniqueQuestionId', 'uniquePromptPerBank', 'uniqueChoiceSetPerBank', 'randomizedCorrectPosition', 'approvedOnly']) {
    assert.equal(manifest.rules[rule], true, `rule ${rule} is not enabled`);
  }
});

test('PIN is the default root state and unlock is required', () => {
  assert.ok(bundle.includes('T.useState("pin")'));
  assert.match(bundle, /onUnlock:.*firstEntry/);
  assert.match(bundle, /m!==localStorage\.getItem\(Jl\)/);
  assert.match(bundle, /m\.length!==6/);
});

test('app locks on resume/background and child exit returns to PIN', () => {
  assert.match(bundle, /addEventListener\("pageshow"/);
  assert.match(bundle, /addEventListener\("pagehide"/);
  assert.match(bundle, /addEventListener\("visibilitychange"/);
  assert.match(bundle, /y=\(\)=>\{m\(null\),r\("pin"\)\}/);
  assert.match(bundle, /onClick:u/);
});

test('progress storage rejects malformed values', () => {
  assert.deepEqual(normalizeProgress(null), { attempts: 0, correct: 0, bySubject: {} });
  assert.deepEqual(normalizeProgress({ attempts: 'bad', correct: 99 }), { attempts: 0, correct: 0, bySubject: {} });
  assert.deepEqual(normalizeProgress({ attempts: 2, correct: 99, bySubject: [] }), { attempts: 2, correct: 2, bySubject: [] });
  assert.deepEqual(normalizeProgress({ attempts: 5, correct: 3, bySubject: {} }), { attempts: 5, correct: 3, bySubject: {} });
  assert.match(bundle, /Number\.isFinite\(Number\(u\.attempts\)\)/);
  assert.match(bundle, /try\{const r=JSON\.parse\(localStorage\.getItem\(Wl\)/);
});

test('question IDs include subject, grade, language, and sequence', () => {
  assert.match(bundle, /id:`\$\{m\}-\$\{i\}-\$\{u\}-\$\{w\+1\}`/);
  assert.match(bundle, /source:"PaizoMath curriculum — separated grade\/subject bank"/);
});

test('question choices preserve the correct answer and randomize its position', () => {
  assert.ok(bundle.includes('W=(w*3+Math.floor(Math.random()*le.length))%le.length'));
  assert.ok(bundle.includes('R=le.map((q,k)=>q===ee?q'));
  assert.ok(bundle.includes('correct:ee'));
});

test('bilingual fallback records keep question, answer, and choices in one language', () => {
  assert.ok(bundle.includes('We respect the group\'s agreement'));
  assert.ok(bundle.includes('Ενότητα «${v}»') || bundle.includes('Κοινωνική και Πολιτική Αγωγή'));
  assert.ok(bundle.includes('ee=b?D[2]:E?.[0]??D[2]'));
  assert.ok(bundle.includes('Y=b?D[3]:E?.[1]??D[3]'));
  assert.ok(bundle.includes('Oo.find(([el,en])=>el===q||en===q)'));
});

test('all HTML entry points reference the deployed asset bundle', () => {
  for (const file of ['index.html', 'app/index.html', 'studio/index.html', 'terms/index.html', 'privacy/index.html', '404.html']) {
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    assert.match(html, /assets\/index-BT5Zs9ye\.js/);
    assert.match(html, /assets\/index-VvnKvMSq\.css/);
  }
});

(async () => {
  const server = spawn(process.execPath, ['-e', `const fs=require('node:fs'),path=require('node:path'),http=require('node:http');const root=${JSON.stringify(root)};http.createServer((q,r)=>{const file=path.join(root,q.url==='/'?'index.html':q.url.replace(/^\\//,''));fs.createReadStream(file).on('error',()=>{r.statusCode=404;r.end()}).pipe(r)}).listen(0,'127.0.0.1',function(){console.log('READY:'+this.address().port)})`], { stdio: ['ignore', 'pipe', 'inherit'] });
  let port = null;
  server.stdout.setEncoding('utf8');
  server.stdout.on('data', data => { const m = data.match(/READY:(\d+)/); if (m) port = Number(m[1]); });
  const deadline = Date.now() + 3000;
  while (!port && Date.now() < deadline) await new Promise(r => setTimeout(r, 20));
  if (!port) { console.error('FAIL local HTTP server did not start'); process.exitCode = 1; server.kill(); return; }
  for (const route of ['/', '/app/index.html', '/assets/index-BT5Zs9ye.js', '/assets/index-VvnKvMSq.css', '/assets/question-banks.json']) {
    const response = await request(port, route);
    if (response.status !== 200) { console.error(`FAIL HTTP ${route}: status ${response.status}`); process.exitCode = 1; }
    else { passed++; console.log(`PASS HTTP ${route}`); }
  }
  server.kill();
  if (process.exitCode) process.exit(process.exitCode);
  console.log(`\n${passed} tests passed.`);
})().catch(err => { console.error(`FAIL HTTP smoke tests\n  ${err.stack}`); process.exit(1); });
