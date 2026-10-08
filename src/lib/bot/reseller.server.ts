import { z } from 'zod';
import { runAsBot, currentBot, type BotId } from './scope.server';
import { supabaseAdmin, getUser } from './store.server';
import { handleApi } from './api.server';
import { apiAccessAllowed, validRequestId } from './api-rules';
import { smsCatalog, grizzly } from './grizzly.server';
import { smsPrice } from './sms-rules';
import { getSettings, tgMultiplier } from './settings.server';
import { getAccount, fastBuy, searchAccounts, loginCode, resetSessions, PhoenixError } from './phoenix.server';
import { getCatalog, needsComments, isQuantityFree, priceFor } from './catalog.server';
import { placeOrder } from './smmgen.server';
import { syncSmsOrder } from './sms.server';
const schema=z.record(z.string().max(40),z.string().max(16000));
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type,X-API-Key','Access-Control-Allow-Methods':'POST,OPTIONS','Cache-Control':'no-store'};
export const apiOptions=()=>new Response(null,{status:204,headers});
export async function resellerRequest(request: Request,bot: BotId) {
 try {
  if(Number(request.headers.get('content-length')??0)>32000)return Response.json({error:'Request too large'},{status:413,headers});
  const text=await request.text();if(text.length>32000)return Response.json({error:'Request too large'},{status:413,headers});
  const body=request.headers.get('content-type')?.includes('application/json')?JSON.parse(text):Object.fromEntries(new URLSearchParams(text));
  const normalized=Object.fromEntries(Object.entries(body).map(([k,v])=>[k,Array.isArray(v)?v.join(','):String(v)]));
  const parsed=schema.safeParse(normalized);if(!parsed.success)return Response.json({error:'Invalid parameters'},{status:400,headers});
  const p=parsed.data;p['key']=request.headers.get('X-API-Key')??p['key']??'';p['action']=(p['action']??'').toLowerCase();
  return await runAsBot(bot,async()=>{
   if(!/^[A-Za-z0-9]{16}$/.test(p['key']??''))return Response.json({error:'Invalid API key'},{status:401,headers});
   const {data:key}=await supabaseAdmin.from('bot_api_keys').select('telegram_id').eq('api_key',p['key']??'').maybeSingle();
   if(!key)return Response.json({error:'Invalid API key for this bot'},{status:401,headers});
   const uid=Number(key.telegram_id),user=await getUser(uid),action=p['action']??'';
   if(!user||user.is_banned)return Response.json({error:'Account unavailable'},{status:403,headers});
   if(action==='balance')return Response.json({balance:Number(user.balance).toFixed(4),currency:'USD',bot},{headers});
   if(!apiAccessAllowed(Number(user.balance),user.is_banned)&&!['status','multi_status','orders','otp','cancel','add','reset'].includes(action))return Response.json({error:'Not enough funds on balance'},{status:402,headers});
   if(action==='multi_status')p['action']='status';
   let result: unknown;
   if(bot==='smm' && action!=='add')result=await handleApi(p);
   else if(action==='add')result=await purchase(uid,p);
   else if(bot==='tg')result=await tgAction(uid,p);
   else result=await smsAction(uid,p);
   return Response.json(result,{headers});
  });
 }catch{return Response.json({error:'Service temporarily unavailable; do not repeat a purchase with a new request_id'},{status:503,headers});}
}
async function purchase(uid:number,p:Record<string,string>) {
 const requestKey=p['request_id']??'';if(!validRequestId(requestKey))return {error:'request_id must be a UUID; reuse it when checking an uncertain purchase'};
 const bot=currentBot();
 if(bot==='sms')return buySms(uid,p,requestKey);
 const {data:old}=await supabaseAdmin.from('bot_api_requests').select('id,status,result').eq('bot',bot).eq('telegram_id',uid).eq('request_key',requestKey).maybeSingle();
 if(old)return old.result??{order:old.id,status:old.status};
 let charge:number,product:string,service: Awaited<ReturnType<typeof getCatalog>>['services'] extends Map<number,infer S>?S|undefined:never;
 let quantity=Number(p['quantity']),comments:string|undefined;
 const item=bot==='tg'?await getAccount(Number(p['item_id'])):null;
 if(bot==='tg') {if(!item||!Number.isFinite(item.price)||item.price<=0)return {error:'Account unavailable'};charge=Math.round(item.price*(await tgMultiplier())*10000)/10000;product=String(item.item_id);}
 else {service=(await getCatalog()).services.get(Number(p['service']));if(!service)return {error:'Incorrect service ID'};
 if(!p['link']||p['link'].length>500)return {error:'Link is required (maximum 500 characters)'};
 if(needsComments(service)){comments=p['comments']?.trim();if(!comments)return {error:'Comments required'};quantity=comments.split('\n').filter(l=>l.trim()).length;}
 if(isQuantityFree(service)&&!quantity)quantity=service.min;
 if(!Number.isInteger(quantity)||quantity<service.min||quantity>service.max)return {error:`Quantity must be between ${service.min} and ${service.max}`};
 charge=priceFor(service,quantity);product=String(service.id);}
 const {data:id,error}=await supabaseAdmin.rpc('bot_api_reserve',{_bot:bot,_user:uid,_key:requestKey,_product:product,_charge:charge});
 if(error||!id)return {error:'Insufficient balance or request already submitted'};
 try {
  let result:Record<string,unknown>;
  if(bot==='tg'&&item){const bought=await fastBuy(item.item_id);if(!bought.phone)throw new Error('Uncertain delivery');
   const {data:account,error:save}=await supabaseAdmin.from('bot_tg_accounts').insert({telegram_id:uid,item_id:item.item_id,phone:bought.phone,country:bought.country||item.telegram_country,charge,cost:bought.cost,order_ref:bought.orderRef}).select('id').single();if(save||!account)throw new Error('Delivery requires review');
   result={order:account.id,item_id:item.item_id,phone:bought.phone,status:'Delivered',charge,currency:'USD'};
  }else if(service){const placed=await placeOrder({service:service.id,link:p['link']??'',quantity:comments?undefined:quantity,comments});
   if(!placed.order){await supabaseAdmin.rpc('bot_api_reject',{_id:id});return {error:'Supplier rejected order; charge refunded'};}
   const {data:order,error:save}=await supabaseAdmin.from('bot_orders').insert({telegram_id:uid,service_id:service.id,service_name:service.name,category:service.category,link:p['link']??'',quantity,comments:comments??null,charge,status:'in progress',source:'api',provider_order_id:String(placed.order)}).select('id').single();if(save||!order)throw new Error('Delivery requires review');
   result={order:order.id,status:'In Progress',charge,currency:'USD'};
  }else throw new Error('Invalid product');
  await supabaseAdmin.from('bot_api_requests').update({status:'completed',result:result as never}).eq('id',id);
  const {rewardReferrer}=await import('./growth.server');await rewardReferrer(uid,charge).catch(()=>null);
   const {sendMessage}=await import('./telegram.server');
   await sendMessage(uid,`✅ API order completed\nOrder: ${String(result['order'])}\nCharge: $${charge.toFixed(4)}`).catch(()=>null);
  return result;
 }catch(error){if(error instanceof PhoenixError&&[400,404,409].includes(error.status)){await supabaseAdmin.rpc('bot_api_reject',{_id:id});return {error:'Account rejected; charge refunded'};}
  await supabaseAdmin.from('bot_api_requests').update({status:'review'}).eq('id',id);return {order:id,status:'Review',message:'Payment reserved. Do not submit another purchase. Contact Support.'};}
}
async function tgAction(uid:number,p:Record<string,string>){
 const action=p['action'];
 if(action==='services'){const page=Math.max(1,Math.min(1000,Number(p['page'])||1));const country=p['country']??'ALL';if(!/^(ALL|[A-Z]{2})$/.test(country))return {error:'Invalid country'};const list=await searchAccounts(country,page),mult=await tgMultiplier();return {items:list.items.map(i=>({item_id:i.item_id,country:i.telegram_country,price:Math.round(i.price*mult*10000)/10000,currency:'USD',premium:Boolean(i.telegram_premium)})),page,has_next:list.hasNext};}
 let query=supabaseAdmin.from('bot_tg_accounts').select('id,item_id,phone,country,charge,created_at').eq('telegram_id',uid);
 if(action==='orders'){const page=Math.max(0,Number(p['page'])||0);return (await query.order('created_at',{ascending:false}).range(page*20,page*20+19)).data??[];}
 const {data:o}=await query.eq('item_id',Number(p['item_id'])).maybeSingle();if(!o)return {error:'Account not found in your purchases'};
 if(action==='otp')return {item_id:o.item_id,code:await loginCode(o.item_id)};
 if(action==='reset'){await resetSessions(o.item_id);return {success:true};}
 if(action==='status')return {...o,status:'Delivered',currency:'USD'};
 return {error:'Incorrect action'};
}
async function buySms(uid:number,p:Record<string,string>,key:string){
 const {data:old}=await supabaseAdmin.from('bot3_sms_orders').select('id,status,phone,otp').eq('telegram_id',uid).eq('request_key',key).maybeSingle();if(old)return {order:old.id,...old};
 const service=p['service']??'',country=p['country']??'',cat=await smsCatalog(true),item=cat.prices[country]?.[service];if(!item||Number(item.count)<=0)return {error:'Number out of stock'};
 const cost=Number(item.cost),charge=smsPrice(cost,(await getSettings()).sms_markup_pct);
 const {data:id,error}=await supabaseAdmin.rpc('bot3_reserve_sms',{_user:uid,_key:key,_service:service,_service_name:cat.services.find(s=>s.code===service)?.name??service,_country:country,_country_name:cat.countries[country]?.eng??country,_charge:charge,_cost:cost});if(error||!id)return {error:'Insufficient balance or checkout already submitted'};
 try{const response=(await grizzly('getNumber',{service,country,maxPrice:String(cost)})).trim(),m=/^ACCESS_NUMBER:(\d+):(\d+)$/.exec(response);
 if(!m?.[1]||!m[2]){const {data:refund}=await supabaseAdmin.rpc('bot3_finish_sms',{_id:id,_kind:'rejected',_value:response});if(!refund)await supabaseAdmin.from('bot3_sms_orders').update({status:'purchase_review'}).eq('id',id);return {order:id,status:refund?'Refunded':'Review'};}
 const {error:save}=await supabaseAdmin.from('bot3_sms_orders').update({provider_id:m[1],phone:m[2],status:'waiting',expires_at:new Date(Date.now()+1200000).toISOString()}).eq('id',id);if(save)throw new Error('Review');return {order:id,phone:m[2],status:'Waiting',charge,currency:'USD'};
 }catch{await supabaseAdmin.from('bot3_sms_orders').update({status:'purchase_review'}).eq('id',id);return {order:id,status:'Review',message:'Do not repurchase. Contact Support.'};}
}
async function smsAction(uid:number,p:Record<string,string>){
 if(p['action']==='services'){const cat=await smsCatalog(),markup=(await getSettings()).sms_markup_pct;return Object.entries(cat.prices).flatMap(([country,items])=>Object.entries(items).filter(([service,i])=>Number(i.count)>0&&(!p['service']||p['service']===service)&&(!p['country']||p['country']===country)).map(([service,i])=>({service,name:cat.services.find(s=>s.code===service)?.name??service,country,country_name:cat.countries[country]?.eng??country,price:smsPrice(Number(i.cost),markup),stock:Number(i.count),currency:'USD'})));}
 if(p['action']==='orders')return (await supabaseAdmin.from('bot3_sms_orders').select('id,phone,status,otp,charge,expires_at').eq('telegram_id',uid).order('created_at',{ascending:false}).limit(50)).data??[];
 if(!validRequestId(p['order']??''))return {error:'Valid order UUID required'};
 const {data:o}=await supabaseAdmin.from('bot3_sms_orders').select('*').eq('telegram_id',uid).eq('id',p['order']??'').maybeSingle();if(!o)return {error:'Order not found'};
 if(['status','otp','cancel'].includes(p['action']??'')){await syncSmsOrder(o,p['action']==='cancel');const {data:latest}=await supabaseAdmin.from('bot3_sms_orders').select('id,phone,status,otp,charge,refunded,expires_at').eq('id',o.id).eq('telegram_id',uid).single();return latest;}
 return {error:'Incorrect action'};
}
