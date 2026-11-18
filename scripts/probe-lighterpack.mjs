const codes=['a9cua5','4pg9c9','gdl4a','0lr1s5'];
for (const code of codes) {
 const uri='https://lighterpack.com/r/'+code;
 try {
  const response=await fetch(uri,{redirect:'follow',headers:{'User-Agent':'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/122 Safari/537.36','Accept':'text/html,application/xhtml+xml'}});
  const body=await response.text();
  console.log('\n======',code,'======');
  console.log('http',response.status,'final',response.url,'len',body.length,'title',body.match(/<title[^>]*>([^<]*)/i)?.[1]);
  console.log('snippet',body.replace(/\s+/g,' ').slice(0,800));
  console.log('data-hints', [...body.matchAll(/<script([^>]*)(?:src="([^"]+)")?[^>]*>/ig)].slice(0,25).map(x=>[x[1],x[2]]).join(' || ').slice(0,1600));
  console.log('known-words', [...body.matchAll(/(backpack|itemName|item_name|category_name|categoryName|chartData|packinglist|packlist|gearlist)/gi)].slice(0,25).map(x=>x[0]).join(','));
 } catch(e) {console.log('ERROR',code,String(e));}
}
