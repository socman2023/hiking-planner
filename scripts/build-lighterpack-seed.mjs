import fs from 'node:fs/promises'
const codes=['a9cua5','4pg9c9','gdl4a','0lr1s5']
const decode=(text)=>String(text||'')
 .replace(/&#x([0-9a-f]+);/ig,(_,x)=>String.fromCodePoint(parseInt(x,16)))
 .replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n)))
 .replace(/&(?:amp|lt|gt|quot|apos|nbsp);/g,m=>({ '&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&nbsp;':' ' }[m]||m))
 .replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim()
const read=(html,pattern)=>decode(pattern.exec(html)?.[1]||'')
const attr=(html,regex)=>regex.exec(html)?.[1]||''
function parseList(html,code){
 const token=/<h2 class="lpCategoryName">([\s\S]*?)<\/h2>|<li class="lpItem[^"]*" id="(\d+)">/g
 const events=[...html.matchAll(token)]
 let category='',items=[]
 for(let i=0;i<events.length;i++){
  const event=events[i]
  if(event[1]!==undefined) {category=decode(event[1]);continue}
  const start=event.index, end=events[i+1]?.index ?? html.length
  const chunk=html.slice(start,end)
  const name=read(chunk,/<span class="lpName">([\s\S]*?)<\/span>/)
  const description=read(chunk,/<span class="lpDescription">([\s\S]*?)<\/span>/)
  const mg=attr(chunk,/<input[^>]+class="lpMG"[^>]+value="([^"]+)"/)
  const weightG=mg && /^\d+(?:\.\d+)?$/.test(mg)?Number(mg)/1000:null
  const qty=Number(attr(chunk,/<span class="lpQtyCellValue">\s*(\d+)\s*<\/span>/))||1
  const image=attr(chunk,/<img class="lpItemImage" src="(https:\/\/i\.imgur\.com\/[^"]+)"/)
  const productUrl=attr(chunk,/<span class="lpName">[\s\S]*?<a href="([^"]+)" class="lpHref"/)
  if(!name||name.length>500||description.length>500) continue
  items.push({itemId:event[2],name,description,category,weightG,quantity:qty,
    photoUrl:image,productUrl:decode(productUrl),worn:!!/lpWorn1\b/.test(chunk),
    consumable:!!/lpConsumable1\b/.test(chunk)})
 }
 return {code,url:'https://lighterpack.com/r/'+code,items}
}
const lists=[]
for(const code of codes){
 const response=await fetch('https://lighterpack.com/r/'+code,{headers:{
 'User-Agent':'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/122 Safari/537.36',
 'Accept':'text/html,application/xhtml+xml'}})
 if(!response.ok) throw new Error(code+' HTTP '+response.status)
 const html=await response.text()
 const list=parseList(html,code)
 if(list.items.length<10)throw new Error(code+' parsed too few: '+list.items.length)
 lists.push(list)
 console.log(code,'items',list.items.length,'photos',list.items.filter(x=>x.photoUrl).length,
   'categories',[...new Set(list.items.map(x=>x.category))].length,
   'first',JSON.stringify(list.items[0]).slice(0,360))
}
const output={format:'hiking-planner-lighterpack',version:1,fetchedAt:new Date().toISOString(),lists}
await fs.mkdir('public/seed',{recursive:true})
await fs.writeFile('public/seed/lighterpack.json',JSON.stringify(output))
console.log('TOTAL ITEMS',lists.reduce((t,l)=>t+l.items.length,0))
