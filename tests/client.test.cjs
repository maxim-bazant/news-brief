const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
// Fixed data keeps interaction tests independent of news availability and date.
const topics = ['Czechia','World','Politics','Business','Economics','Science','Climate','Sports'];
const stories = topics.map((category, index) => ({
  id:'https://example.com/' + category, url:'https://example.com/' + category,
  category, title:category + ' headline', summary:'Publisher summary.', detail:'Longer publisher excerpt.',
  source:index === 0 ? 'iROZHLAS' : 'BBC News', published:'2026-11-01T07:00:00+00:00',
  language:index === 0 ? 'cs' : 'en', image:'',
}));
const snapshot = {stories, briefing:{items:stories, minutes:1}, updated:'2026-11-01T08:00:00Z',
  feeds:['iROZHLAS','ČT24','Seznam Zprávy','BBC News'].map(source=>({source,ok:true}))};

function app({initialize = false} = {}) {
  const nodes = new Map(), events = {}, windowEvents = {}, memory = new Map();
  const html = fs.readFileSync('public/index.html', 'utf8');
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]));
  function node() {
    const listeners = {}, attributes = {}, classes = new Set();
    return {
      value:'', innerHTML:'', textContent:'', hidden:false, open:false, style:{}, dataset:{}, offsetTop:100, isConnected:true,
      classList:{add:c=>classes.add(c),remove:c=>classes.delete(c),toggle(c,active){if(active)classes.add(c);else classes.delete(c)},contains:c=>classes.has(c)},
      setAttribute(k,v){attributes[k]=v},getAttribute:k=>attributes[k],removeAttribute(k){delete attributes[k]},
      addEventListener(k,fn){listeners[k]=fn},focus(){this.focused=true},scrollIntoView(){},remove(){},
      showModal(){this.open=true},close(){this.open=false;listeners.close?.()},
    };
  }
  const get = selector => {
    if (selector === '#readerbody img') return null;
    if (selector.startsWith('#') && !ids.has(selector.slice(1))) return null;
    if (!nodes.has(selector)) nodes.set(selector, node());
    return nodes.get(selector);
  };
  const topics = ['All','Czechia','World','Business','Economics','Politics','Science','Climate','Sports'].map(category=>Object.assign(node(),{dataset:{category}}));
  const views = ['news','czech','saved'].map(view=>Object.assign(node(),{dataset:{view}}));
  const document = {querySelector:get,querySelectorAll:selector=>selector==='.topics [data-category]'?topics:selector==='.bottom-nav [data-view]'?views:[],body:node(),addEventListener(k,f){events[k]=f}};
  const history = {state:null,stack:[null],pushState(state){this.state=state;this.stack.push(state)},replaceState(state){this.state=state;this.stack[this.stack.length-1]=state},back(){this.stack.pop();this.state=this.stack.at(-1);windowEvents.popstate?.()}};
  const window = {scrollY:0,scrollTo(){},addEventListener(k,f){windowEvents[k]=f}};
  const context = vm.createContext({document,history,window,localStorage:{getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)},console,AbortSignal,fetch:async()=>({ok:true,json:async()=>snapshot}),setInterval(){}});
  const script = fs.readFileSync('public/assets/app.js','utf8').replace(/init\(\);\s*$/, '');
  vm.runInContext(script,context);
  const run = source => vm.runInContext(source,context);
  if(initialize) run('init()');
  else {
    run('wireUI()');
    run('data='+JSON.stringify(snapshot)+';render();sources()');
  }
  return {get, run, context, views, topics, history, events, memory, document};
}

test('Czech coverage leads the news and all eight topics remain in the feed',()=>{
  const {get,run}=app();
  const categories=JSON.parse(run('JSON.stringify(allStories().slice(0,8).map(a=>a.category))'));
  assert.equal(categories[0],'Czechia');
  assert.equal(new Set(categories).size,8);
  assert.equal(run('allStories().length'),snapshot.stories.length);
  assert.equal(get('#overview'),null);
  for(const source of ['iROZHLAS','ČT24','Seznam Zprávy'])assert.ok(get('#sources').innerHTML.includes(source));
});

test('bottom navigation switches news, Czech news and saved stories',()=>{
  const {get,run,views}=app();
  views[0].onclick();assert.equal(get('#sectiontitle').textContent,'News');
  views[1].onclick();assert.equal(get('#sectiontitle').textContent,'Czechia');assert.ok(!get('#stories').innerHTML.includes('class="category">World'));
  views[2].onclick();assert.equal(get('#sectiontitle').textContent,'Saved');assert.ok(get('#stories').innerHTML.includes('No saved stories.'));
  views[0].onclick();assert.equal(run('category'),'All');
});

test('search handles Czech accents and restores the full news feed on clear',()=>{
  const {get,run}=app();
  assert.equal(run("fold('Česká věda')"),'ceska veda');
  run("data.stories.unshift({id:'https://example.cz/test',url:'https://example.cz/test',title:'Česká věda',summary:'Výzkum',detail:'Vědci',source:'Test',category:'Czechia',language:'cs'})");
  get('#search').value='ceska veda';get('#search').oninput();
  assert.equal(get('#clear-search').hidden,false);
  assert.equal(get('#storycount').textContent,'1 story');assert.ok(get('#stories').innerHTML.includes('lang="cs"'));
  get('#clear-search').onclick();assert.equal(get('#search').value,'');assert.equal(get('#storycount').textContent,'9 stories');
});

test('reader save, device back and explicit back retain the feed',()=>{
  const {get,run,history,document}=app();
  const id=snapshot.stories[0].id;
  run('openStory('+JSON.stringify(id)+')');assert.equal(get('#reader').open,true);assert.equal(history.state.briefReader,true);
  get('#reader-save').onclick();assert.equal(run('saved.size'),1);assert.equal(get('#reader-save').textContent,'Saved ✓');
  history.back();assert.equal(get('#reader').open,false);assert.equal(document.body.classList.contains('reader-open'),false);
  run('openStory('+JSON.stringify(id)+')');get('#close-reader').onclick();assert.equal(get('#reader').open,false);assert.equal(history.state,null);
  run("navigate('saved')");assert.ok(get('#stories').innerHTML.includes(id.replace(/&/g,'&amp;')));
});

test('archived article can be unsaved and re-saved while the reader stays open',()=>{
  const {get,run}=app();
  const article={...snapshot.stories[0],id:'https://example.cz/archived',url:'https://example.cz/archived'};
  run('archives['+JSON.stringify(article.id)+']='+JSON.stringify(article)+';saved.add('+JSON.stringify(article.id)+');openStory('+JSON.stringify(article.id)+')');
  get('#reader-save').onclick();assert.equal(run('saved.size'),0);
  get('#reader-save').onclick();assert.equal(run('saved.size'),1);
});

test('offline error keeps the dated snapshot and saved news available',async()=>{
  const {get,run,context}=app();
  context.fetch=async()=>{throw Error('offline')};
  await run('load()');
  assert.ok(get('#notice').textContent.startsWith('Offline'));
  assert.equal(run('data.stories.length'),snapshot.stories.length);
  assert.equal(get('#refresh').disabled,false);
});

test('current page initializes and loads news without summary elements',async()=>{
  const {get,run}=app({initialize:true});
  await new Promise(setImmediate);
  assert.equal(get('#overview'),null);
  assert.equal(get('#browse-news'),null);
  assert.equal(run('data.stories.length'),snapshot.stories.length);
  assert.ok(get('#stories').innerHTML.includes('Czechia headline'));
  assert.ok(get('#updated').textContent.startsWith('Updated '));
  assert.equal(get('#notice').textContent,'');
});
