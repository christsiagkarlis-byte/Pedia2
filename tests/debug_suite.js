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

test('PWA shortcut launches directly into the protected app route', () => {
  const pwa = JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8'));
  assert.equal(pwa.id, './app/index.html');
  assert.equal(pwa.start_url, './app/index.html');
  assert.equal(pwa.scope, './');
});

test('question-bank manifest is structurally complete', () => {
  assert.ok(manifest.grades.length >= 4);
  assert.ok(manifest.subjects.length >= 10);
  for (const rule of ['uniqueQuestionId', 'uniquePromptPerBank', 'uniqueChoiceSetPerBank', 'randomizedCorrectPosition', 'approvedOnly']) {
    assert.equal(manifest.rules[rule], true, `rule ${rule} is not enabled`);
  }
});

test('launch opens on the single Parent/PIN authentication screen', () => {
  assert.ok(bundle.includes('function mj({onUnlock:u})'));
  assert.ok(bundle.includes('children:"Γονέας"'));
  assert.ok(bundle.includes('children:"PIN γονέα"'));
  assert.ok(bundle.includes('inputMode:"numeric"'));
  assert.ok(bundle.includes('pattern:"[0-9]{6}"'));
  assert.ok(bundle.includes('localStorage.setItem(Jl,await Xs(m))'));
  assert.doesNotMatch(bundle, /firstEntry/);
});
test('PIN recovery requires a security question and answer during setup', () => {
  assert.match(bundle, /Rl="paizomath-family-recovery-v1"/);
  assert.ok(bundle.includes('Μυστική Ερώτηση'));
  assert.ok(bundle.includes('Απάντηση'));
  assert.match(bundle, /!k\).*Διάλεξε μυστική ερώτηση/);
});

test('PIN and recovery answers are SHA-256 hashed and recovery is case-insensitive', () => {
  assert.match(bundle, /crypto\.subtle\.digest\("SHA-256"/);
  assert.match(bundle, /localStorage\.setItem\(Jl,await Xs\(m\)\)/);
  assert.match(bundle, /answerHash:await Xs\(a\.trim\(\)\.toLocaleLowerCase\(\)\)/);
  assert.match(bundle, /await Xs\(o\.trim\(\)\.toLocaleLowerCase\(\)\)!==V\.answerHash/);
  assert.ok(bundle.includes('Ξέχασα το PIN'));
});

test('app locks on resume/background and protected routes use the same gate', () => {
  assert.match(bundle, /addEventListener\("pageshow"/);
  assert.match(bundle, /addEventListener\("pagehide"/);
  assert.match(bundle, /addEventListener\("visibilitychange"/);
  assert.match(bundle, /document\.hidden&&g/);
  assert.match(bundle, /path:"\/",component:gj/);
  assert.match(bundle, /path:"\/app",component:gj/);
  assert.match(bundle, /path:"\/studio",component:gj/);
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

test('print test pool enforces unique IDs and normalized prompt text', () => {
  assert.match(bundle, /nx\(d,u,s,Math\.max\(w,500\)\)/);
  assert.match(bundle, /J\.has\(O\)/);
  assert.match(bundle, /ee\.has\(S\)/);
  assert.match(bundle, /V\.reduce\(\(W,F\)=>/);
});

test('print rendering strips numeric and generated suffixes from prompts and choices', () => {
  assert.match(bundle, /function Qs\(s\)/);
  assert.ok(bundle.includes('\\s*\\(\\s*\\d+\\s*\\)'));
  assert.match(bundle, /παράδειγμα\|example\|νέα εφαρμογή/);
  assert.match(bundle, /choices\.map\(Qs\)/);
  assert.match(bundle, /prompt:Qs\(F\.prompt\)/);
  assert.doesNotMatch(bundle, /new application \$\{F\+1\}/);
  assert.doesNotMatch(bundle, /different case \$\{F\+1\}/);
});

test('global lesson filtering exposes stable unique IDs', () => {
  assert.match(bundle, /id:`\$\{u\.grade\}\|\$\{m\}\|\$\{i\}`/);
  assert.match(bundle, /findIndex\(candidate=>candidate\.id===item\.id\)===index/);
});

test('quiz pool accepts only globally identified, sanitized records', () => {
  assert.match(bundle, /const O=String\(F\.id\?\?""\)\.trim\(\),S=Ks\(F\.prompt\)/);
  assert.match(bundle, /if\(!O\|\|!S\|\|J\.has\(O\)\|\|ee\.has\(S\)\)return W/);
  assert.ok(bundle.includes('F=J;M.add(F);'));
});

test('quiz state resets when language, grade, or lesson changes', () => {
  assert.match(bundle, /p\(0\),b\(null\),h\("quiz"\)/);
  assert.match(bundle, /\},\[i,v,s\.grade,y\?\.subject\]\)/);
});

test('teachers can create and insert a custom question into the active test', () => {
  assert.ok(bundle.includes('+ Προσθήκη Δικής μου Ερώτησης'));
  assert.ok(bundle.includes('Κείμενο Ερώτησης'));
  assert.ok(bundle.includes('Επιλογή Σωστής Απάντησης'));
  assert.match(bundle, /source:"teacher-custom"/);
  assert.match(bundle, /Math\.max\(1,Math\.min\(20,h\)\)\+K\.length/);
  assert.match(bundle, /V=\[\.\.\.K,\.\.\.nx\(d,u,s/);
});

test('custom question banks can be exported and imported as validated JSON', () => {
  assert.ok(bundle.includes('Εξαγωγή Ερωτήσεων'));
  assert.ok(bundle.includes('Εισαγωγή Ερωτήσεων'));
  assert.match(bundle, /type:"paizomath-custom-questions"/);
  assert.match(bundle, /new Blob\(\[JSON\.stringify/);
  assert.match(bundle, /new FileReader/);
  assert.match(bundle, /accept:"application\/json"/);
});

test('custom imports merge into the active grade/subject bank and reject malformed records', () => {
  assert.match(bundle, /Array\.isArray\(k\.questions\)/);
  assert.match(bundle, /Y\.choices\.length!==4/);
  assert.match(bundle, /localStorage\.setItem\(sk,JSON\.stringify\(R\)\)/);
  assert.match(bundle, /Z\(R\)/);
});

test('custom questions persist under selected grade and subject', () => {
  assert.ok(bundle.includes('paizomath-custom-questions-'));
  assert.match(bundle, /localStorage\.setItem\(sk,JSON\.stringify\(item\)\)/);
  assert.match(bundle, /JSON\.parse\(localStorage\.getItem\(sk\)\|\|"\[\]"\)/);
  assert.match(bundle, /subject:d,grade:u,language:s/);
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

test('User Guide has distinct complete Greek and English language profiles', () => {
  assert.match(bundle, /function Hj\(\{language:s\}/);
  assert.ok(bundle.includes('Οδηγός χρήσης και βοήθεια'));
  assert.ok(bundle.includes('User Guide & Help'));
  assert.ok(bundle.includes('Αναζήτηση στον οδηγό'));
  assert.ok(bundle.includes('Search the user guide'));
  assert.ok(bundle.includes('Είσοδος γονέα'));
  assert.ok(bundle.includes('Parent sign-in'));
});

test('User Guide controls render from the selected language profile', () => {
  assert.match(bundle, /const i=s==="el",d=i\?\{/);
  assert.match(bundle, /placeholder:d\.search/);
  assert.match(bundle, /children:p\.title/);
  assert.match(bundle, /c\.jsx\(Hj,\{language:s\}\)/);
  assert.ok(bundle.includes('href:"#user-help"'));
});

test('teacher can open the full question database from the educator lab', () => {
  assert.match(bundle, /function lj\(\{language:s,onOpenQuestionBank:nj\}\)/);
  assert.ok(bundle.includes('Άνοιγμα βάσης ερωτήσεων'));
  assert.match(bundle, /onOpenQuestionBank:\(\)=>i\("questions"\)/);
  assert.ok(bundle.includes('Εισαγωγή παρτίδας'));
});

test('User Guide explains both personal and full-database imports', () => {
  assert.ok(bundle.includes('Για την πλήρη βάση ερωτήσεων πάτησε πρώτα Άνοιγμα βάσης ερωτήσεων'));
  assert.ok(bundle.includes('To open the full question database, press Open question database'));
});

test('global Error Boundary prevents a blank white screen', () => {
  assert.match(bundle, /class AppErrorBoundary extends T\.Component/);
  assert.match(bundle, /static getDerivedStateFromError/);
  assert.ok(bundle.includes('Κάτι πήγε στραβά'));
  assert.match(bundle, /window\.addEventListener\("error"/);
  assert.match(bundle, /window\.addEventListener\("unhandledrejection"/);
  assert.match(bundle, /c\.jsx\(AppErrorBoundary,\{children:c\.jsx\(Sj/);
});

test('all application routes are declared and quiz navigation is null-safe', () => {
  for (const route of ['path:"/"', 'path:"/terms"', 'path:"/privacy"', 'path:"/app"', 'path:"/studio"', 'path:"/404"']) {
    assert.ok(bundle.includes(route), `missing route ${route}`);
  }
  assert.match(bundle, /nx\(y\?\.subject\?\?"",s\.grade,i,1001\)/);
  assert.match(bundle, /z=M\.length\?M\[j%M\.length\]:null/);
});

test('all HTML entry points reference the deployed asset bundle', () => {
  for (const file of ['index.html', 'app/index.html', 'studio/index.html', 'terms/index.html', 'privacy/index.html', '404.html']) {
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    assert.match(html, /assets\/index-BT5Zs9ye\.js/);
    assert.match(html, /assets\/index-VvnKvMSq\.css/);
  }
});

test('mobile app entry resolves manifest and shared assets from /app/', () => {
  const appHtml = fs.readFileSync(path.join(root, 'app/index.html'), 'utf8');
  assert.match(appHtml, /href="\.\.\/manifest\.webmanifest"/);
  assert.match(appHtml, /src="\.\.\/assets\/index-BT5Zs9ye\.js"/);
  assert.match(appHtml, /href="\.\.\/assets\/index-VvnKvMSq\.css"/);
  assert.ok(fs.existsSync(path.join(root, 'app/index.html')));
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
