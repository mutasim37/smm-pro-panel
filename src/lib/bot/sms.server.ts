import { respond } from "./handler.server";
import { grizzly, smsCatalog } from "./grizzly.server";
import { supabaseAdmin, getUser, setState, getState, clearState } from "./store.server";
import { getSettings, setSetting } from "./settings.server";
import { sendMessage, editMessage, tg, escapeHtml, ik, type InlineKeyboard } from "./telegram.server";
import { money, usd, DIVIDER, currencyScope } from "./views.server";
import { isCurrency } from "./config.server";
import { notifyAdmins, isAdmin } from "./admin.server";
import { rewardReferrer } from "./growth.server";
import { smsPrice, parseSmsStatus, canRefundSms, SMS_CANCEL_DELAY_MS, SMS_WINDOW_MS } from "./sms-rules";

export type SmsCtx = { chatId: number; messageId?: number; fromPhoto?: boolean };
type SmsOrder = { id: string; telegram_id: number; service_name: string; country_name: string; service: string; country: string; charge: number; provider_id: string | null; phone: string | null; otp: string | null; status: string; created_at: string; expires_at: string; notified_at: string | null; refunded: number };
const home: InlineKeyboard = [[{ text: "🏠 Home", callback_data: "home" }]];
export async function smsRespond(ctx: SmsCtx, text: string, keyboard: InlineKeyboard = home) {
  return respond(ctx,text,keyboard);
}
function pages(prefix: string, page: number, total: number): InlineKeyboard {
  const row: InlineKeyboard[number] = [];
  if (page > 0) row.push({ text: "◀", callback_data: `${prefix}:${page - 1}` });
  row.push({ text: `${page + 1}/${Math.max(1, Math.ceil(total / 10))}`, callback_data: "noop" });
  if ((page + 1) * 10 < total) row.push({ text: "▶", callback_data: `${prefix}:${page + 1}` });
  return [row, ...home];
}
const SMS_ICONS: Record<string, string> = { telegram: "✈️", whatsapp: "💬", google: "🔍", facebook: "📘", instagram: "📸", twitter: "🐦", discord: "🎮", microsoft: "🪟", tiktok: "🎵", viber: "📞", wechat: "💚", uber: "🚕", amazon: "📦", netflix: "🎬", openai: "🤖", snapchat: "👻", other: "🌐" };
const SMS_TOP = ["telegram", "whatsapp", "google", "facebook", "instagram", "tiktok", "twitter", "openai", "discord", "microsoft", "snapchat", "amazon"];
export async function showSmsServices(ctx: SmsCtx, page = 0, search = "") {
  try {
    if(search) await setState(ctx.chatId,"sms_search_results",{search});
    const cat = await smsCatalog();
    const markup = (await getSettings()).sms_multiplier;
    const minCost = new Map<string, number>(); const stock = new Map<string, number>();
    for (const p of Object.values(cat.prices)) for (const [k, v] of Object.entries(p)) {
      if (Number(v.count) <= 0) continue;
      stock.set(k, (stock.get(k) ?? 0) + Number(v.count));
      const c = Number(v.cost); if (Number.isFinite(c) && c > 0 && c < (minCost.get(k) ?? Infinity)) minCost.set(k, c);
    }
    const rank = (c: string) => { const i = SMS_TOP.indexOf(c); return i < 0 ? 99 : i; };
    const list = cat.services.filter(s => minCost.has(s.code) && (!search || s.name.toLowerCase().includes(search.toLowerCase()) || s.code===search.toLowerCase())).sort((a,b) => rank(a.code)-rank(b.code) || (stock.get(b.code) ?? 0)-(stock.get(a.code) ?? 0) || a.name.localeCompare(b.name));
    const label = (s: { code: string; name: string }) => `${SMS_ICONS[s.code] ?? "📱"} ${s.name.slice(0, 18)} · ${money(smsPrice(minCost.get(s.code)!, markup))}+`;
    const keyboard: InlineKeyboard = [];
    const chunk = list.slice(page*10,page*10+10);
    for (const s of chunk) keyboard.push([{ text: label(s), callback_data:`sms:c:${s.code}:0` }]);
    if (!search && page === 0) keyboard.unshift([{ text: "🌐 Open Mini App · Quick Select", web_app: { url: "https://smm-pro-panel.lovable.app/sms" } }]);
    keyboard.push([{ text: "🔎 Search Any Service", callback_data: "sms:search", style: "primary" } as InlineKeyboard[number][number]]);
    const head = search ? `<b>🔎 Results for “${escapeHtml(search)}”</b>` : page === 0 ? "<b>⭐ Top Services</b>" : "<b>📲 All Services</b>";
    const text = [head, DIVIDER, `🟢 Live stock · <b>${list.length}</b> services`, "💡 Price shown is the cheapest country.", list.length ? "" : "No service found — try another name."].join("\n");
    await smsRespond(ctx, text, [...keyboard,...pages(search?"sms:results":"sms:s",page,list.length)]);
  } catch (e) { await smsRespond(ctx, escapeHtml(e instanceof Error ? e.message : "Stock unavailable"), [[{text:"🔄 Retry",callback_data:"sms:s:0"}],...home]); }
}
export async function showSmsCountries(ctx: SmsCtx, service: string, page = 0) {
  const cat = await smsCatalog();
  const markup = (await getSettings()).sms_multiplier;
  const list = Object.entries(cat.prices).filter(([,p])=>Number(p[service]?.count)>0).sort((a,b)=>Number(a[1][service]?.cost)-Number(b[1][service]?.cost));
  const name = cat.services.find(s=>s.code===service)?.name ?? service;
  const stockTag = (n: number) => n >= 100 ? "🟢" : n >= 10 ? "🟡" : "🟠";
  await smsRespond(ctx, [`<b>${SMS_ICONS[service] ?? "📱"} ${escapeHtml(name)}</b>`, DIVIDER, `🌍 <b>${list.length}</b> countries in stock · cheapest first`, "🟢 high · 🟡 medium · 🟠 low stock", "Prices include our service fee."].join("\n"), [
    ...list.slice(page*10,page*10+10).map(([country,p])=>[{text:`${stockTag(Number(p[service]?.count))} ${(cat.countries[country]?.eng ?? country).slice(0,22)} · ${money(smsPrice(Number(p[service]?.cost),markup))}`,callback_data:`sms:q:${service}:${country}`}]),
    ...pages(`sms:c:${service}`,page,list.length), [{text:"⬅ Services",callback_data:"sms:s:0"}]
  ]);
}
export async function quote(ctx: SmsCtx, service: string, country: string) {
  const cat = await smsCatalog(); const item = cat.prices[country]?.[service];
  if (!item || Number(item.count)<=0) return smsRespond(ctx,"This number is currently out of stock.");
  const charge = smsPrice(Number(item.cost),(await getSettings()).sms_multiplier);
  await setState(ctx.chatId,"sms_confirm",{service,country,charge,key:crypto.randomUUID()});
  const user = await getUser(ctx.chatId);
  await smsRespond(ctx,["<b>🧾 Number Summary</b>",DIVIDER,`Service · <b>${escapeHtml(cat.services.find(s=>s.code===service)?.name ?? service)}</b>`,`Country · <b>${escapeHtml(cat.countries[country]?.eng ?? country)}</b>`,`Total · <b>${money(charge)}</b>`,`Wallet · <code>${money(Number(user?.balance ?? 0))}</code>`,"", "Activation window: 15 minutes. Cancellation is subject to supplier approval. No refunds after OTP delivery."].join("\n"),[[{text:"✅ Confirm & Get Number",callback_data:"sms:buy",style:"success"}],[{text:"💳 Top Up",callback_data:"dep",style:"primary"},{text:"✖ Cancel",callback_data:"cancel",style:"danger"}]]);
}
async function buy(ctx: SmsCtx) {
  const state = await getState(ctx.chatId); if(state.step!=="sms_confirm") return smsRespond(ctx,"This checkout has expired. Please choose a number again.");
  if(typeof state.data["service"]!=="string" || typeof state.data["country"]!=="string" || typeof state.data["key"]!=="string" || !Number.isFinite(Number(state.data["charge"]))) return smsRespond(ctx,"This checkout expired. Choose a number again.");
  const service=String(state.data["service"]), country=String(state.data["country"]);
  const cat=await smsCatalog(true); const item=cat.prices[country]?.[service];
  if(!item || Number(item.count)<=0) return smsRespond(ctx,"Out of stock. No balance was charged.");
  const charge=smsPrice(Number(item.cost),(await getSettings()).sms_multiplier);
  if(charge>Number(state.data["charge"])) return quote(ctx,service,country);
  const {data:id,error}=await supabaseAdmin.rpc("bot3_reserve_sms",{_user:ctx.chatId,_key:String(state.data["key"]),_service:service,_service_name:cat.services.find(s=>s.code===service)?.name ?? service,_country:country,_country_name:cat.countries[country]?.eng ?? country,_charge:charge,_cost:Number(item.cost)});
  if(error || !id) return smsRespond(ctx,"Wallet balance is insufficient, or this checkout was already submitted.",[[{text:"💳 Top Up",callback_data:"dep"}],...home]);
  await clearState(ctx.chatId);
  try {
    const response=(await grizzly("getNumber",{service,country,maxPrice:String(item.cost)})).trim();
    const match=/^ACCESS_NUMBER:(\d+):(\d+)$/.exec(response);
    if(!match?.[1] || !match[2]) {
      const {data:refunded}=await supabaseAdmin.rpc("bot3_finish_sms",{_id:id,_kind:"rejected",_value:response});
      if(!refunded) await supabaseAdmin.from("bot3_sms_orders").update({status:"purchase_review"}).eq("id",id);
      return smsRespond(ctx,refunded?"Supplier could not issue a number. Your wallet was fully refunded.":"Supplier result is uncertain. Your payment is reserved for admin review; we will not charge again.");
    }
    const {error:saveError}=await supabaseAdmin.from("bot3_sms_orders").update({provider_id:match[1],phone:match[2],status:"waiting",expires_at:new Date(Date.now()+SMS_WINDOW_MS).toISOString()}).eq("id",id);
    if(saveError) { await notifyAdmins(`⚠️ SMS purchase requires reconciliation · order <code>${id}</code> · activation <code>${match[1]}</code>`); return smsRespond(ctx,"Your number was issued, but delivery needs admin review. Do not buy again."); }
    await showSmsOrder(ctx,id);
    await notifyAdmins(`📲 <b>SMS NUMBER SOLD</b>\nUser <code>${ctx.chatId}</code> · ${usd(charge)}\nOrder <code>${id}</code>`);
  } catch {
    const {data:issued}=await supabaseAdmin.from("bot3_sms_orders").select("provider_id").eq("id",id).maybeSingle();
    if(!issued?.provider_id) await supabaseAdmin.from("bot3_sms_orders").update({status:"purchase_review"}).eq("id",id);
    await notifyAdmins(`⚠️ SMS purchase result uncertain · <code>${id}</code>. Reconcile with supplier before any refund.`);
    await smsRespond(ctx,"Supplier response was interrupted. Your payment is reserved for review—no repeat charge. Contact Support.");
  }
}
async function loadOrder(user: number,id: string) {
  const {data}=await supabaseAdmin.from("bot3_sms_orders").select("*").eq("id",id).eq("telegram_id",user).maybeSingle();
  return data as unknown as SmsOrder | null;
}
export async function syncSmsOrder(order: SmsOrder,cancel=false) {
  if(!order.provider_id || order.otp || ["refunded","failed","received"].includes(order.status)) return;
  const {data:claimed}=await supabaseAdmin.rpc("bot3_claim_sms_poll",{_id:order.id}); if(!claimed) return;
  try {
    const result=parseSmsStatus((await grizzly("getStatus",{id:order.provider_id})).trim());
    if(result.kind==="otp" && result.code) {
      const {data:saved,error}=await supabaseAdmin.rpc("bot3_finish_sms",{_id:order.id,_kind:"otp",_value:result.code});
      if(error || !saved) return;
      await rewardReferrer(order.telegram_id,Number(order.charge));
      return;
    }
    if(result.kind==="unknown") return;
    if(cancel || Date.parse(order.expires_at)<=Date.now() || result.kind==="canceled") {
      if(Date.now()-Date.parse(order.created_at)<SMS_CANCEL_DELAY_MS) return;
      const response=(await grizzly("setStatus",{id:order.provider_id,status:"8"})).trim();
      if(canRefundSms(response,order.otp)) await supabaseAdmin.rpc("bot3_finish_sms",{_id:order.id,_kind:"refund",_value:response});
      else {
        const review=result.kind==="canceled" || Date.now()>Date.parse(order.expires_at)+5*60000;
        await supabaseAdmin.from("bot3_sms_orders").update({status:review?"refund_review":"cancel_pending"}).eq("id",order.id);
        if(review) await notifyAdmins(`⚠️ SMS cancellation requires supplier review · <code>${order.id}</code>`);
      }
    }
  } finally { await supabaseAdmin.from("bot3_sms_orders").update({poll_locked_until:null,updated_at:new Date().toISOString()}).eq("id",order.id); }
}
export async function showSmsOrder(ctx: SmsCtx,id: string,cancel=false) {
  let order=await loadOrder(ctx.chatId,id); if(!order) return smsRespond(ctx,"Number not found.");
  const closed=(o: SmsOrder)=>Number(o.refunded)>0 || o.status==="refunded";
  if(closed(order)) return smsRespond(ctx,[`<b>📲 ${escapeHtml(order.service_name)} · ${escapeHtml(order.country_name)}</b>`,DIVIDER,`Status · <b>refunded</b>`,`Refunded · ${money(Number(order.refunded))}`,"This number is closed. Messages can no longer be checked."].join("\n"),[[{text:"📥 My Numbers",callback_data:"sms:my"}],...home]);
  await syncSmsOrder(order,cancel); order=await loadOrder(ctx.chatId,id); if(!order)return;
  if(closed(order)) return showSmsOrder(ctx,id);
  const mins=Math.max(0,Math.ceil((Date.parse(order.expires_at)-Date.now())/60000));
  const keyboard: InlineKeyboard=[[{text:"🔄 Check SMS / New Code",callback_data:`sms:o:${id}`,style:"primary"}]];
  if(!order.otp && order.provider_id) keyboard.push([{text:"✖ Cancel Number",callback_data:`sms:x:${id}`,style:"danger"}]);
  keyboard.push([{text:"📥 My Numbers",callback_data:"sms:my"}],...home);
  await smsRespond(ctx,[`<b>📲 ${escapeHtml(order.service_name)} · ${escapeHtml(order.country_name)}</b>`,DIVIDER,`Number · <code>${escapeHtml(order.phone ? "+"+order.phone : "Pending review")}</code>`,`Status · <b>${escapeHtml(order.status.replaceAll("_"," "))}</b>`,`OTP · <code>${escapeHtml(order.otp ?? "Waiting for SMS…")}</code>`,`Charged · ${money(Number(order.charge))}`,order.otp?"OTP delivered · non-refundable":`Window remaining · ${mins} minutes`,"Cancellation and refund are available after 5 minutes, subject to supplier approval."].join("\n"),keyboard);
}
export async function showSmsOrders(ctx: SmsCtx,page=0) {
  const {data,count}=await supabaseAdmin.from("bot3_sms_orders").select("*",{count:"exact"}).eq("telegram_id",ctx.chatId).order("created_at",{ascending:false}).range(page*10,page*10+9);
  await smsRespond(ctx,"<b>📥 My Numbers</b>\n"+DIVIDER,[...(data??[]).map(o=>[{text:`${o.otp?"✅":"📲"} ${o.service_name} · ${o.country_name} · ${o.status}`,callback_data:`sms:o:${o.id}`}]),...pages("sms:my",page,count??0)]);
}
export async function handleSmsCallback(ctx: SmsCtx,action: string,a?: string,b?: string) {
  if(action==="results") {const state=await getState(ctx.chatId);return showSmsServices(ctx,Number(a??0),String(state.data["search"]??""));}
  if(action==="s") return showSmsServices(ctx,Number(a??0));
  if(action==="c") return showSmsCountries(ctx,a??"",Number(b??0));
  if(action==="q") return quote(ctx,a??"",b??"");
  if(action==="buy") return buy(ctx);
  if(action==="my") return showSmsOrders(ctx,Number(a??0));
  if(action==="o" || action==="x") return showSmsOrder(ctx,a??"",action==="x");
  if(action==="search") {await setState(ctx.chatId,"sms_search",{});return smsRespond(ctx,"Send a service name or code, such as Telegram or tg.");}
}
export async function handleSmsStep(chatId: number,text: string,step: string|null) {
  if(step==="sms_search" || step==="sms_search_results") {await clearState(chatId);await showSmsServices({chatId},0,text);return true;}
  if(step==="await_admin_sms" && isAdmin(chatId)) {const n=Number(text);if(!Number.isFinite(n)||n<1||n>1000){await sendMessage(chatId,"Send a multiplier between 1 and 1000, e.g. 3 or 1.5.");return true;}await setSetting("sms_multiplier",n);await clearState(chatId);await sendMessage(chatId,`✅ SMS price multiplier saved: ${n}×`);return true;}
  return false;
}
export async function adminSmsView(action: string,page=0): Promise<{text:string;keyboard:InlineKeyboard}> {
  const keyboard: InlineKeyboard=[[{text:"✏ Edit SMS Multiplier",callback_data:"a:psms"}],[{text:"⬅ Admin Panel",callback_data:"a:panel"}]];
  if(action==="pricing") return {text:`<b>SMS Price Multiplier</b>\n${DIVIDER}\nSupplier price × <b>${(await getSettings()).sms_multiplier}</b>\nExample: $1.00 → $${(await getSettings()).sms_multiplier.toFixed(2)}`,keyboard};
  if(action==="provider") {const response=await grizzly("getBalance"); const n=Number(response.replace("ACCESS_BALANCE:",""));return {text:`<b>5SIM Balance</b>\n${DIVIDER}\n${Number.isFinite(n)?usd(n):"Unavailable"}`,keyboard};}
  if(action==="refresh") {const cat=await smsCatalog(true);return {text:`✅ Live catalog refreshed · ${cat.services.length} services`,keyboard};}
  const {data,count}=await supabaseAdmin.from("bot3_sms_orders").select("*",{count:"exact"}).order("created_at",{ascending:false}).range(page*10,page*10+9);
  return {text:["<b>SMS Orders</b>",DIVIDER,...(data??[]).map(o=>`${o.service_name} · ${o.country_name} · ${usd(Number(o.charge))}\n<code>${o.telegram_id}</code> · ${o.status}`)].join("\n\n"),keyboard:[...pages("a:orders",page,count??0),...keyboard]};
}
export async function syncActiveSms() {
  const {data}=await supabaseAdmin.from("bot3_sms_orders").select("*").in("status",["waiting","cancel_pending"]).order("updated_at",{ascending:true}).limit(50);
  for(const row of data??[]) {try{await syncSmsOrder(row as unknown as SmsOrder);}catch{ /* bounded next scheduled check */ }}
  const {data:notifications}=await supabaseAdmin.from("bot3_sms_orders").select("*").in("status",["received","refunded"]).is("notified_at",null).lt("notification_attempts",3).limit(50);
  for(const o of notifications??[]) {
    const user=await getUser(o.telegram_id);const code=isCurrency(user?.currency)?user.currency:"USD";
    const sent=await currencyScope.run({code},()=>sendMessage(o.telegram_id,o.otp?`<b>✅ SMS RECEIVED</b>\n${escapeHtml(o.service_name)} · <code>+${escapeHtml(o.phone??"")}</code>\n\nOTP: <code>${escapeHtml(o.otp)}</code>`:`<b>💰 REFUND CONFIRMED</b>\n${money(Number(o.refunded))} returned to your wallet.`,{reply_markup:ik([[{text:"📥 View Number",callback_data:`sms:o:${o.id}`}]] )}));
    await supabaseAdmin.from("bot3_sms_orders").update({notification_attempts:o.notification_attempts+1,...(sent?{notified_at:new Date().toISOString()}:{})}).eq("id",o.id);
  }
  return {checked:data?.length??0};
}