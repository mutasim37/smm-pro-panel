import { respond } from "./handler.server";
import { grizzly as fivesim, smsCatalog as fivesimCatalog, type SmsCatalog } from "./grizzly.server";
import { gz, gzCatalog } from "./grizzlysms.server";
import { supabaseAdmin, getUser, setState, getState, clearState } from "./store.server";
import { getSettings, setSetting } from "./settings.server";
import { sendMessage, editMessage, tg, escapeHtml, ik, type InlineKeyboard } from "./telegram.server";
import { money, usd, DIVIDER, currencyScope } from "./views.server";
import { isCurrency, supportUsername } from "./config.server";
import { notifyAdmins, isAdmin } from "./admin.server";
import { rewardReferrer } from "./growth.server";
import { smsPrice, parseSmsStatus, canRefundSms, shouldCancelSms, SMS_RETRY_STATUSES, SMS_CANCEL_DELAY_MS, SMS_WINDOW_MS } from "./sms-rules";

export type SmsCtx = { chatId: number; messageId?: number; fromPhoto?: boolean };
type SmsOrder = { id: string; telegram_id: number; service_name: string; country_name: string; service: string; country: string; charge: number; provider_id: string | null; phone: string | null; otp: string | null; status: string; created_at: string; expires_at: string; notified_at: string | null; refunded: number };
const home: InlineKeyboard = [[{ text: "🏠 Home", callback_data: "home" }]];
/** Server 1 = Grizzly SMS, Server 2 = 5SIM. Grizzly orders store provider_id as "g:<id>". */
export type Srv = "1" | "2";
const FIND_MS = 50_000;
const SRV_NAME: Record<Srv, string> = { "1": "Server 1", "2": "Server 2" };
// Per-isolate memory cache: instant repeat clicks; stale copies are served while one refresh runs.
const mem = new Map<Srv, { v: SmsCatalog; at: number }>(); const inflight = new Map<Srv, Promise<SmsCatalog>>();
function loadCatalog(s: Srv, force: boolean) {
  const run = inflight.get(s) ?? (s === "1" ? gzCatalog(force) : fivesimCatalog(force)).then(v => { mem.set(s, { v, at: Date.now() }); return v; }).finally(() => inflight.delete(s));
  inflight.set(s, run); return run;
}
export const catalogFor = async (s: Srv, force = false): Promise<SmsCatalog> => {
  const m = mem.get(s);
  if (!force && m) { if (Date.now() - m.at > 180000) void loadCatalog(s, false).catch(() => null); return m.v; }
  return loadCatalog(s, force);
};
const catalogReady = (s: Srv) => mem.has(s);
async function loadingScreen(ctx: SmsCtx, srv: Srv) {
  await smsRespond(ctx, [`<b>⏳ ${SRV_NAME[srv]} · Loading products…</b>`, DIVIDER, "<code>[██████░░░░] 60%</code>", "📡 Connecting to server…", "Please wait a moment."].join("\n"), []).catch(() => null);
  if (!ctx.messageId || ctx.fromPhoto) { delete ctx.messageId; ctx.fromPhoto = false; }
}
const apiFor = (s: Srv) => s === "1" ? gz : fivesim;
export async function multFor(s: Srv) { const st = await getSettings(); return s === "1" ? st.sms_g_multiplier : st.sms_multiplier; }
const srvOf = (providerId: string | null): Srv => providerId?.startsWith("g:") ? "1" : "2";
const rawId = (providerId: string) => providerId.replace(/^g:/, "");
function split(action: string): { base: string; srv: Srv } {
  const m = /^(.*?)([12])$/.exec(action);
  return m && m[1] ? { base: m[1], srv: m[2] as Srv } : { base: action, srv: "2" };
}
export async function showSmsServers(ctx: SmsCtx) {
  await smsRespond(ctx, ["<b>📲 Buy Number</b>", DIVIDER, "Choose a server:", "", "⚡ <b>Server 1</b> · fast delivery", "🌍 <b>Server 2</b> · huge stock, all countries"].join("\n"), [
    [{ text: "⚡ Server 1", callback_data: "sms:s1:0", style: "primary" } as InlineKeyboard[number][number], { text: "🌍 Server 2", callback_data: "sms:s2:0", style: "success" } as InlineKeyboard[number][number]],
    [{ text: "💼 Premium Numbers · Subscription", callback_data: "sms:pm" }],
    ...home,
  ]);
}
type Premium = { id: number; name: string; description: string; price_month: number; price_year: number | null; active: boolean };
async function showPremium(ctx: SmsCtx) {
  const {data}=await supabaseAdmin.from("bot3_premium_products").select("*").eq("active",true).order("id");
  const list=(data??[]) as unknown as Premium[];
  if(!list.length) return smsRespond(ctx,"<b>💼 Premium Numbers</b>\n"+DIVIDER+"\nNo premium products right now.",[[{text:"⬅ Back",callback_data:"sms:srv"}],...home]);
  await smsRespond(ctx,["<b>💼 Premium Numbers</b>",DIVIDER,"Personal, dedicated subscription numbers.",...list.map(p=>`• <b>${escapeHtml(p.name)}</b> · ${money(Number(p.price_month))}/month`)].join("\n"),[...list.map(p=>[{text:`💼 ${p.name}`,callback_data:`sms:pp:${p.id}`}]),[{text:"⬅ Back",callback_data:"sms:srv"}],...home]);
}
async function showPremiumProduct(ctx: SmsCtx,id: number) {
  const {data}=await supabaseAdmin.from("bot3_premium_products").select("*").eq("id",id).eq("active",true).maybeSingle();
  const p=data as unknown as Premium|null; if(!p) return showPremium(ctx);
  const kb: InlineKeyboard=[[{text:`🗓 1 Month · ${money(Number(p.price_month))}`,callback_data:`sms:pb:${p.id}:month`}]];
  if(p.price_year) kb.push([{text:`📅 1 Year · ${money(Number(p.price_year))}`,callback_data:`sms:pb:${p.id}:year`}]);
  await smsRespond(ctx,[`<b>💼 ${escapeHtml(p.name)}</b>`,DIVIDER,escapeHtml(p.description),"",`🗓 1 Month · <b>${money(Number(p.price_month))}</b>`,...(p.price_year?[`📅 1 Year · <b>${money(Number(p.price_year))}</b>`]:[]),"","Paid from your wallet. After ordering, contact Support with your Order ID."].join("\n"),[...kb,[{text:"⬅ Back",callback_data:"sms:pm"}],...home]);
}
async function buyPremium(ctx: SmsCtx,id: number,plan: "month"|"year") {
  const {data:oid}=await supabaseAdmin.rpc("bot3_buy_premium" as never,{_user:ctx.chatId,_product:id,_plan:plan} as never);
  if(!oid) return smsRespond(ctx,"Wallet balance is insufficient, or this product is unavailable.",[[{text:"💳 Top Up",callback_data:"dep"}],[{text:"⬅ Back",callback_data:`sms:pp:${id}`}],...home]);
  const {data:o}=await supabaseAdmin.from("bot3_premium_orders").select("*").eq("id",String(oid)).maybeSingle();
  const sup=supportUsername();
  await smsRespond(ctx,["<b>✅ Order Placed</b>",DIVIDER,`💼 ${escapeHtml(String(o?.product_name??""))} · ${plan==="year"?"1 Year":"1 Month"}`,`💰 ${money(Number(o?.charge??0))}`,`🆔 Order ID: <code>${oid}</code>`,"",`📩 Contact admin @${sup} with your Order ID to receive your number.`].join("\n"),[[{text:"💬 Contact Admin",url:`https://t.me/${sup}`}],...home]);
  await notifyAdmins(`💼 <b>PREMIUM ORDER</b>\n${escapeHtml(String(o?.product_name??""))} · ${plan}\nUser <code>${ctx.chatId}</code> · ${usd(Number(o?.charge??0))}\nOrder <code>${oid}</code>`);
}
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
const iconFor = (name: string) => { const n = name.toLowerCase(); for (const [k, v] of Object.entries(SMS_ICONS)) if (n.includes(k)) return v; return "📱"; };
const SMS_TOP = ["telegram", "whatsapp", "google", "facebook", "instagram", "tiktok", "twitter", "openai", "discord", "microsoft", "snapchat", "amazon"];
export async function showSmsServices(ctx: SmsCtx, page = 0, search = "", srv: Srv = "2") {
  try {
    if(search) await setState(ctx.chatId,"sms_search_results",{search,srv});
    if(!catalogReady(srv)) await loadingScreen(ctx,srv);
    const cat = await catalogFor(srv);
    const markup = await multFor(srv);
    const minCost = new Map<string, number>(); const stock = new Map<string, number>();
    for (const p of Object.values(cat.prices)) for (const [k, v] of Object.entries(p)) {
      if (Number(v.count) <= 0) continue;
      stock.set(k, (stock.get(k) ?? 0) + Number(v.count));
      const c = Number(v.cost); if (Number.isFinite(c) && c > 0 && c < (minCost.get(k) ?? Infinity)) minCost.set(k, c);
    }
    const nameOf = (c: string) => (cat.services.find(s=>s.code===c)?.name ?? c).toLowerCase();
    const rank = (c: string) => { const n = nameOf(c); const i = SMS_TOP.findIndex(t => n === t || n.startsWith(t)); return i < 0 ? 99 : i; };
    const list = cat.services.filter(s => minCost.has(s.code) && (!search || s.name.toLowerCase().includes(search.toLowerCase()) || s.code===search.toLowerCase())).sort((a,b) => rank(a.code)-rank(b.code) || (stock.get(b.code) ?? 0)-(stock.get(a.code) ?? 0) || a.name.localeCompare(b.name));
    const label = (s: { code: string; name: string }) => `${iconFor(s.name)} ${s.name.slice(0, 18)} · ${money(smsPrice(minCost.get(s.code) ?? 0, markup))}+`;
    const keyboard: InlineKeyboard = [];
    const chunk = list.slice(page*10,page*10+10);
    for (const s of chunk) keyboard.push([{ text: label(s), callback_data:`sms:c${srv}:${s.code}:0` }]);
    if (!search && page === 0) keyboard.unshift([{ text: `🌐 Open Mini App · ${SRV_NAME[srv]}`, web_app: { url: `https://smm-pro-panel.lovable.app/sms?s=${srv}` } }]);
    keyboard.push([{ text: "🔎 Search Any Service", callback_data: `sms:search${srv}`, style: "primary" } as InlineKeyboard[number][number]]);
    const head = (search ? `<b>🔎 Results for “${escapeHtml(search)}”</b>` : page === 0 ? "<b>⭐ Top Services</b>" : "<b>📲 All Services</b>") + ` · ${SRV_NAME[srv]}`;
    const text = [head, DIVIDER, `🟢 Live stock · <b>${list.length}</b> services`, "💡 Price shown is the cheapest country.", list.length ? "" : "No service found — try another name."].join("\n");
    await smsRespond(ctx, text, [...keyboard,...pages(search?`sms:results${srv}`:`sms:s${srv}`,page,list.length),[{text:"🔀 Switch Server",callback_data:"sms:srv"}]]);
  } catch (e) { await smsRespond(ctx, escapeHtml(e instanceof Error ? e.message : "Stock unavailable"), [[{text:"🔄 Retry",callback_data:`sms:s${srv}:0`}],[{text:"🔀 Switch Server",callback_data:"sms:srv"}],...home]); }
}
export async function showSmsCountries(ctx: SmsCtx, service: string, page = 0, srv: Srv = "2") {
  if(!catalogReady(srv)) await loadingScreen(ctx,srv);
  let cat: SmsCatalog; try { cat = await catalogFor(srv); } catch (e) { return smsRespond(ctx, escapeHtml(e instanceof Error ? e.message : "Stock unavailable"), [[{text:"🔄 Retry",callback_data:`sms:c${srv}:${service}:0`}],...home]); }
  const markup = await multFor(srv);
  const list = Object.entries(cat.prices).filter(([,p])=>Number(p[service]?.count)>0).sort((a,b)=>Number(a[1][service]?.cost)-Number(b[1][service]?.cost));
  const name = cat.services.find(s=>s.code===service)?.name ?? service;
  const stockTag = (n: number) => n >= 100 ? "🟢" : n >= 10 ? "🟡" : "🟠";
  await smsRespond(ctx, [`<b>${iconFor(name)} ${escapeHtml(name)}</b> · ${SRV_NAME[srv]}`, DIVIDER, `🌍 <b>${list.length}</b> countries in stock · cheapest first`, "🟢 high · 🟡 medium · 🟠 low stock", "Prices include our service fee."].join("\n"), [
    ...list.slice(page*10,page*10+10).map(([country,p])=>[{text:`${stockTag(Number(p[service]?.count))} ${(cat.countries[country]?.eng ?? country).slice(0,22)} · ${money(smsPrice(Number(p[service]?.cost),markup))}`,callback_data:`sms:q${srv}:${service}:${country}`}]),
    ...pages(`sms:c${srv}:${service}`,page,list.length), [{text:"⬅ Services",callback_data:`sms:s${srv}:0`}]
  ]);
}
export async function quote(ctx: SmsCtx, service: string, country: string, srv: Srv = "2") {
  const cat = await catalogFor(srv); const item = cat.prices[country]?.[service];
  if (!item || Number(item.count)<=0) return smsRespond(ctx,"This number is currently out of stock.");
  const charge = smsPrice(Number(item.cost),await multFor(srv));
  await setState(ctx.chatId,"sms_confirm",{service,country,charge,srv,key:crypto.randomUUID()});
  const user = await getUser(ctx.chatId);
  await smsRespond(ctx,["<b>🧾 Number Summary</b>",DIVIDER,`Server · <b>${SRV_NAME[srv]}</b>`,`Service · <b>${escapeHtml(cat.services.find(s=>s.code===service)?.name ?? service)}</b>`,`Country · <b>${escapeHtml(cat.countries[country]?.eng ?? country)}</b>`,`Total · <b>${money(charge)}</b>`,`Wallet · <code>${money(Number(user?.balance ?? 0))}</code>`,"", "Activation window: 15 minutes. Cancellation available after 5 minutes if no SMS arrives. No refunds after OTP delivery."].join("\n"),[[{text:"✅ Confirm & Get Number",callback_data:"sms:buy",style:"success"}],[{text:"💳 Top Up",callback_data:"dep",style:"primary"},{text:"✖ Cancel",callback_data:"cancel",style:"danger"}]]);
}
async function buy(ctx: SmsCtx) {
  const state = await getState(ctx.chatId); if(state.step!=="sms_confirm") return smsRespond(ctx,"This checkout has expired. Please choose a number again.");
  if(typeof state.data["service"]!=="string" || typeof state.data["country"]!=="string" || typeof state.data["key"]!=="string" || !Number.isFinite(Number(state.data["charge"]))) return smsRespond(ctx,"This checkout expired. Choose a number again.");
  const service=String(state.data["service"]), country=String(state.data["country"]);
  const srv: Srv = state.data["srv"]==="1" ? "1" : "2";
  const cat=await catalogFor(srv,true); const item=cat.prices[country]?.[service];
  if(!item || Number(item.count)<=0) return smsRespond(ctx,"Out of stock. No balance was charged.");
  const charge=smsPrice(Number(item.cost),await multFor(srv));
  if(charge>Number(state.data["charge"])) return quote(ctx,service,country,srv);
  const {data:id,error}=await supabaseAdmin.rpc("bot3_reserve_sms",{_user:ctx.chatId,_key:String(state.data["key"]),_service:service,_service_name:cat.services.find(s=>s.code===service)?.name ?? service,_country:country,_country_name:cat.countries[country]?.eng ?? country,_charge:charge,_cost:Number(item.cost)});
  if(error || !id) return smsRespond(ctx,"Wallet balance is insufficient, or this checkout was already submitted.",[[{text:"💳 Top Up",callback_data:"dep"}],...home]);
  await searchStep(id,"track");
  await clearState(ctx.chatId);
  const label=`${escapeHtml(cat.services.find(s=>s.code===service)?.name ?? service)} · ${escapeHtml(cat.countries[country]?.eng ?? country)}`;
  const progress=(pct: number,line: string)=>{const f=Math.round(pct/10);return ["<b>📲 Allocating Your Number</b>",DIVIDER,`<code>[${"█".repeat(f)}${"░".repeat(10-f)}] ${pct}%</code>`,line,`🔍 ${label}`,"⏳ Please hold on a moment…"].join("\n");};
  const stopKb: InlineKeyboard=[[{text:"✖ Stop Searching",callback_data:`sms:stop:${id}`,style:"danger"}]];
  await smsRespond(ctx,progress(20,"📡 Connecting to secure server…"),stopKb).catch(()=>null);
  try {
    // Keep searching while lines are busy (up to FIND_MS); the customer may stop the search.
    // Stopping only prevents further requests — a number already issued is delivered, never lost.
    const started=Date.now(); let attempt=0; let response="";
    for(;;) {
      attempt++;
      const next=await searchStep(id,"begin");
      if(next!=="request") { response="NO_NUMBERS"; break; }
      response=(await apiFor(srv)("getNumber",{service,country,maxPrice:String(item.cost)})).trim();
      if(response==="NO_NUMBERS") await searchStep(id,"empty");
      if(/^ACCESS_NUMBER:/.test(response) || response!=="NO_NUMBERS") break;
      if(await stopped(id) || Date.now()-started>FIND_MS) break;
      const pct=Math.min(95,30+Math.round((Date.now()-started)/FIND_MS*65));
      await smsRespond(ctx,progress(pct,`🔎 Finding number${".".repeat(1+attempt%3)} · attempt ${attempt}`),stopKb).catch(()=>null);
      for(let w=0;w<4 && !(await stopped(id));w++) await new Promise(r=>setTimeout(r,1000));
    }
    const match=/^ACCESS_NUMBER:(\d+):(\d+)$/.exec(response);
    if(!match?.[1] || !match[2]) {
      const {data:refunded}=await supabaseAdmin.rpc("bot3_finish_sms",{_id:id,_kind:"rejected",_value:response});
      const current=await loadOrder(ctx.chatId,id);
      const returned=refunded || Number(current?.refunded)>0;
      if(!returned) { await supabaseAdmin.from("bot3_sms_orders").update({status:"purchase_review"}).eq("id",id).eq("status","purchasing").is("provider_id",null); await notifyAdmins(`⚠️ SMS purchase needs review · <code>${id}</code> · ${escapeHtml(response.slice(0,80))}`); }
      return smsRespond(ctx,returned?`<b>💰 Payment Returned</b>\n${DIVIDER}\n${label}\nNo number was allocated.\n\nRefund · <b>${money(charge)}</b>\nThe amount is back in your wallet.`:"⏳ Your request is being verified. Your payment is safe and will not be charged twice.",[[{text:"🌍 Choose Another Country",callback_data:`sms:c${srv}:${service}:0`}],[{text:"🔀 Try Other Server",callback_data:"sms:srv"}],...home]);
    }
    const stopRequested=await stopped(id);
    const {error:saveError}=await supabaseAdmin.from("bot3_sms_orders").update({provider_id:srv==="1"?`g:${match[1]}`:match[1],phone:match[2],status:stopRequested?"cancel_pending":"waiting",purchase_in_flight:false,expires_at:new Date(Date.now()+SMS_WINDOW_MS).toISOString()}).eq("id",id).eq("status","purchasing").eq("refunded",0);
    if(saveError) { await notifyAdmins(`⚠️ SMS purchase requires reconciliation · order <code>${id}</code> · activation <code>${match[1]}</code>`); return smsRespond(ctx,"Your number was issued and is being finalized. Please do not buy again — Support will assist."); }
    // Re-read STOP after saving too: the stop callback may race the save.
    await showSmsOrder(ctx,id,stopRequested || await stopped(id));
    await notifyAdmins(`📲 <b>SMS NUMBER SOLD</b>\nUser <code>${ctx.chatId}</code> · ${usd(charge)}\nOrder <code>${id}</code> · ${srv==="1"?"Grizzly":"5SIM"}`);
  } catch {
    const {data:issued}=await supabaseAdmin.from("bot3_sms_orders").select("provider_id").eq("id",id).maybeSingle();
    if(!issued?.provider_id) await supabaseAdmin.from("bot3_sms_orders").update({status:"purchase_review"}).eq("id",id).eq("status","purchasing").eq("refunded",0);
    await notifyAdmins(`⚠️ SMS purchase result uncertain · <code>${id}</code>. Reconcile with supplier before any refund.`);
    await smsRespond(ctx,"⏳ Connection interrupted. Your payment is safe and will not be charged twice — Support will confirm shortly.");
  }
}
async function searchStep(id: string,action: string) {
  const {data,error}=await supabaseAdmin.rpc("bot3_sms_search_step",{_id:id,_action:action});
  if(error) throw new Error("Search state unavailable");
  return data;
}
async function stopped(id: string) {
  const {data:o}=await supabaseAdmin.from("bot3_sms_orders").select("provider_response").eq("id",id).maybeSingle();
  return o?.provider_response==="STOP";
}
async function loadOrder(user: number,id: string) {
  const {data}=await supabaseAdmin.from("bot3_sms_orders").select("*").eq("id",id).eq("telegram_id",user).maybeSingle();
  return data as unknown as SmsOrder | null;
}
export async function syncSmsOrder(order: SmsOrder,cancel=false) {
  if(!order.provider_id || order.otp || Number(order.refunded)>0 || ["refunded","failed","received"].includes(order.status)) return;
  // Record intent before claiming the poll lock, so a concurrent check cannot lose it.
  if(cancel) {
    const {error}=await supabaseAdmin.from("bot3_sms_orders").update({status:"cancel_pending",updated_at:new Date().toISOString()}).eq("id",order.id).is("otp",null).eq("refunded",0).in("status",SMS_RETRY_STATUSES);
    if(error) throw new Error("Cancellation could not be saved");
  }
  const {data:claimed}=await supabaseAdmin.rpc("bot3_claim_sms_poll",{_id:order.id}); if(!claimed) return;
  try {
    const latest=await loadOrder(order.telegram_id,order.id);
    if(!latest || latest.otp || Number(latest.refunded)>0) return;
    const api=apiFor(srvOf(order.provider_id)), pid=rawId(order.provider_id);
    const result=parseSmsStatus((await api("getStatus",{id:pid})).trim());
    if(result.kind==="otp" && result.code) {
      const {data:saved,error}=await supabaseAdmin.rpc("bot3_finish_sms",{_id:order.id,_kind:"otp",_value:result.code});
      if(error || !saved) return;
      await rewardReferrer(order.telegram_id,Number(order.charge));
      return;
    }
    if(shouldCancelSms(latest.status,cancel,latest.expires_at) || result.kind==="canceled") {
      if(Date.now()-Date.parse(order.created_at)<SMS_CANCEL_DELAY_MS) return;
      const response=(await api("setStatus",{id:pid,status:"8"})).trim();
      const lateSms=parseSmsStatus(response);
      if(lateSms.kind==="otp" && lateSms.code) {
        const {data:saved}=await supabaseAdmin.rpc("bot3_finish_sms",{_id:order.id,_kind:"otp",_value:lateSms.code});
        if(saved) await rewardReferrer(order.telegram_id,Number(order.charge));
      } else if(canRefundSms(response,latest.otp)) {
        const {error}=await supabaseAdmin.rpc("bot3_finish_sms",{_id:order.id,_kind:"refund",_value:response});
        if(error) throw new Error("Refund will retry");
      }
      else {
        const review=result.kind==="canceled" || Date.now()>Date.parse(order.expires_at)+5*60000;
        await supabaseAdmin.from("bot3_sms_orders").update({status:review?"refund_review":"cancel_pending"}).eq("id",order.id).is("otp",null).eq("refunded",0);
        if(review && latest.status!=="refund_review") await notifyAdmins(`⚠️ SMS cancellation requires supplier review · <code>${order.id}</code>`);
      }
    }
  } finally { await supabaseAdmin.from("bot3_sms_orders").update({poll_locked_until:null,updated_at:new Date().toISOString()}).eq("id",order.id); }
}
export async function showSmsOrder(ctx: SmsCtx,id: string,cancel=false) {
  let order=await loadOrder(ctx.chatId,id); if(!order) return smsRespond(ctx,"Number not found.");
  const closed=(o: SmsOrder)=>Number(o.refunded)>0 || o.status==="refunded";
  if(closed(order)) return smsRespond(ctx,[`<b>📲 ${escapeHtml(order.service_name)} · ${escapeHtml(order.country_name)}</b>`,DIVIDER,`Status · <b>refunded</b>`,`Refunded · ${money(Number(order.refunded))}`,"This number is closed. Messages can no longer be checked."].join("\n"),[[{text:"📥 My Numbers",callback_data:"sms:my"}],...home]);
  await syncSmsOrder(order,cancel).catch(()=>null); order=await loadOrder(ctx.chatId,id); if(!order)return;
  if(closed(order)) return showSmsOrder(ctx,id);
  const mins=Math.max(0,Math.ceil((Date.parse(order.expires_at)-Date.now())/60000));
  const keyboard: InlineKeyboard=[[{text:"🔄 Check SMS / New Code",callback_data:`sms:o:${id}`,style:"primary"}]];
  if(!order.otp && order.provider_id) keyboard.push([{text:"✖ Cancel Number",callback_data:`sms:x:${id}`,style:"danger"}]);
  keyboard.push([{text:"📥 My Numbers",callback_data:"sms:my"}],...home);
  await smsRespond(ctx,order.otp?otpMessage(order):[`<b>📲 Your Virtual Number</b>`,DIVIDER,`Service · <b>${escapeHtml(order.service_name)}</b>`,`Country · ${escapeHtml(order.country_name)}`,`Number · <code>${escapeHtml(order.phone ? "+"+order.phone : "Allocating…")}</code>`,"",`Status · <b>${escapeHtml(order.status.replaceAll("_"," "))}</b>`,`Charged · ${money(Number(order.charge))}`,`Window remaining · ${mins} minutes`,"",["cancel_pending","refund_review"].includes(order.status)?"⏳ Cancellation requested. We will keep checking and refund once cancellation is confirmed.":"Cancellation available after 5 minutes, before any SMS arrives."].join("\n"),keyboard);
}
export async function showSmsOrders(ctx: SmsCtx,page=0) {
  const {data,count}=await supabaseAdmin.from("bot3_sms_orders").select("*",{count:"exact"}).eq("telegram_id",ctx.chatId).order("created_at",{ascending:false}).range(page*10,page*10+9);
  await smsRespond(ctx,"<b>📥 My Numbers</b>\n"+DIVIDER,[...(data??[]).map(o=>[{text:`${o.otp?"✅":"📲"} ${o.service_name} · ${o.country_name} · ${o.status}`,callback_data:`sms:o:${o.id}`}]),...pages("sms:my",page,count??0)]);
}
export async function handleSmsCallback(ctx: SmsCtx,action: string,a?: string,b?: string) {
  if(action==="srv" || (action==="s" && a===undefined)) return showSmsServers(ctx);
  const {base,srv}=split(action);
  if(base==="results") {const state=await getState(ctx.chatId);return showSmsServices(ctx,Number(a??0),String(state.data["search"]??""),state.data["srv"]==="1"?"1":srv);}
  if(base==="s") return showSmsServices(ctx,Number(a??0),"",srv);
  if(base==="c") return showSmsCountries(ctx,a??"",Number(b??0),srv);
  if(base==="q") return quote(ctx,a??"",b??"",srv);
  if(action==="buy") return buy(ctx);
  if(action==="stop") {
    const o=await loadOrder(ctx.chatId,a??""); if(!o) return;
    if(o.provider_id || Number(o.refunded)>0) return showSmsOrder(ctx,o.id,true);
    const status=await searchStep(o.id,"stop");
    return smsRespond(ctx,status==="refunded"?`<b>💰 Search Stopped</b>\n${DIVIDER}\n${money(Number(o.charge))} returned to your wallet.`:`<b>✖ Stopping Search</b>\n${DIVIDER}\nNo more search attempts will start.\nIf a request is already in progress, we must confirm its result before refunding.`,[[{text:"📥 View Order",callback_data:`sms:o:${o.id}`}],...home]);
  }
  if(action==="pm") return showPremium(ctx);
  if(action==="pp") return showPremiumProduct(ctx,Number(a));
  if(action==="pb") return buyPremium(ctx,Number(a),b==="year"?"year":"month");
  if(action==="my") return showSmsOrders(ctx,Number(a??0));
  if(action==="o" || action==="x") return showSmsOrder(ctx,a??"",action==="x");
  if(base==="search") {await setState(ctx.chatId,"sms_search",{srv});return smsRespond(ctx,"Send a service name or code, such as Telegram or tg.");}
}
export async function handleSmsStep(chatId: number,text: string,step: string|null) {
  if(step==="sms_search" || step==="sms_search_results") {const st=await getState(chatId);const srv: Srv=st.data["srv"]==="1"?"1":"2";await clearState(chatId);await showSmsServices({chatId},0,text,srv);return true;}
  if(step==="await_admin_prem" && isAdmin(chatId)) {const [name,m,y,...d]=text.split("|").map(x=>x.trim());const pm=Number(m),py=y?Number(y):null;
    if(!name||!Number.isFinite(pm)||pm<=0||(py!==null&&(!Number.isFinite(py)||py<=0))){await sendMessage(chatId,"Format: Name | monthly USD | yearly USD (optional) | description\nExample: imo Number | 5 | 50 | Personal spam-free number");return true;}
    await supabaseAdmin.from("bot3_premium_products").insert({name,price_month:pm,price_year:py,description:d.join(" | ")});await clearState(chatId);await sendMessage(chatId,`✅ Added: ${escapeHtml(name)}`);return true;}
  if(step==="await_admin_smsg" && isAdmin(chatId)) {const n=Number(text);if(!Number.isFinite(n)||n<1||n>1000){await sendMessage(chatId,"Send a multiplier between 1 and 1000, e.g. 2.1.");return true;}await setSetting("sms_g_multiplier",n);await clearState(chatId);await sendMessage(chatId,`✅ Grizzly (Server 1) multiplier saved: ${n}×`);return true;}
  if(step==="await_admin_sms" && isAdmin(chatId)) {const n=Number(text);if(!Number.isFinite(n)||n<1||n>1000){await sendMessage(chatId,"Send a multiplier between 1 and 1000, e.g. 3 or 1.5.");return true;}await setSetting("sms_multiplier",n);await clearState(chatId);await sendMessage(chatId,`✅ 5SIM (Server 2) multiplier saved: ${n}×`);return true;}
  return false;
}
export async function adminSmsView(action: string,page=0): Promise<{text:string;keyboard:InlineKeyboard}> {
  const keyboard: InlineKeyboard=[[{text:"✏ Grizzly ×",callback_data:"a:psmsg"},{text:"✏ 5SIM ×",callback_data:"a:psms"}],[{text:"💼 Premium Products",callback_data:"a:prem"}],[{text:"⬅ Admin Panel",callback_data:"a:panel"}]];
  const bal=async (api: typeof gz)=>{try{const n=Number((await api("getBalance")).replace("ACCESS_BALANCE:",""));return Number.isFinite(n)?usd(n):"Unavailable";}catch{return "Unavailable";}};
  if(action==="prem") {const {data}=await supabaseAdmin.from("bot3_premium_products").select("*").order("id");const list=(data??[]) as unknown as Premium[];
    return {text:["<b>💼 Premium Products</b>",DIVIDER,...list.map(p=>`${p.active?"🟢":"⚪"} #${p.id} ${escapeHtml(p.name)} · ${usd(Number(p.price_month))}/mo${p.price_year?` · ${usd(Number(p.price_year))}/yr`:""}`),"","Tap a product to show/hide it."].join("\n"),keyboard:[...list.map(p=>[{text:`${p.active?"Hide":"Show"} · ${p.name}`,callback_data:`a:premt${p.id}`},{text:"🗑",callback_data:`a:premd${p.id}`}]),[{text:"➕ Add Product",callback_data:"a:premadd"}],[{text:"⬅ Admin Panel",callback_data:"a:panel"}]]};}
  if(action.startsWith("premt")) {const id=Number(action.slice(5));const {data}=await supabaseAdmin.from("bot3_premium_products").select("active").eq("id",id).maybeSingle();if(data) await supabaseAdmin.from("bot3_premium_products").update({active:!data.active}).eq("id",id);return adminSmsView("prem");}
  if(action.startsWith("premd")) {await supabaseAdmin.from("bot3_premium_products").delete().eq("id",Number(action.slice(5)));return adminSmsView("prem");}
  if(action==="pricing") {const st=await getSettings();return {text:`<b>SMS Price Multipliers</b>\n${DIVIDER}\n⚡ Server 1 · Grizzly SMS · <b>${st.sms_g_multiplier}×</b>\n🌍 Server 2 · 5SIM · <b>${st.sms_multiplier}×</b>\nExample Grizzly: $1.00 → $${st.sms_g_multiplier.toFixed(2)}`,keyboard};}
  if(action==="provider") {const [g,f]=await Promise.all([bal(gz),bal(fivesim)]);return {text:`<b>Server Balances</b>\n${DIVIDER}\n⚡ Server 1 · Grizzly SMS · <b>${g}</b>\n🌍 Server 2 · 5SIM · <b>${f}</b>`,keyboard};}
  if(action==="refresh") {const [g,f]=await Promise.allSettled([gzCatalog(true),fivesimCatalog(true)]);const n=(r: PromiseSettledResult<SmsCatalog>)=>r.status==="fulfilled"?`${r.value.services.length} services`:"failed";return {text:`✅ Catalog refreshed\n⚡ Grizzly · ${n(g)}\n🌍 5SIM · ${n(f)}`,keyboard};}
  const {data,count}=await supabaseAdmin.from("bot3_sms_orders").select("*",{count:"exact"}).order("created_at",{ascending:false}).range(page*10,page*10+9);
  return {text:["<b>SMS Orders</b>",DIVIDER,...(data??[]).map(o=>`${o.provider_id?.startsWith("g:")?"⚡ Grizzly":o.provider_id?"🌍 5SIM":"—"} · ${o.service_name} · ${o.country_name} · ${usd(Number(o.charge))}\n<code>${o.telegram_id}</code> · ${o.status}`)].join("\n\n"),keyboard:[...pages("a:orders",page,count??0),...keyboard]};
}
export async function syncActiveSms() {
  const {data:stops}=await supabaseAdmin.from("bot3_sms_orders").select("id").eq("status","purchasing").eq("search_tracked",true).eq("purchase_in_flight",false).eq("provider_response","STOP").limit(50);
  for(const o of stops??[]) await searchStep(o.id,"stop").catch(()=>null);
  const {data}=await supabaseAdmin.from("bot3_sms_orders").select("*").in("status",SMS_RETRY_STATUSES).order("updated_at",{ascending:true}).limit(50);
  for(const row of data??[]) {try{await syncSmsOrder(row as unknown as SmsOrder);}catch{ /* bounded next scheduled check */ }}
  const {data:notifications}=await supabaseAdmin.from("bot3_sms_orders").select("*").in("status",["received","refunded","failed"]).or("refunded.gt.0,otp.not.is.null").is("notified_at",null).lt("notification_attempts",3).limit(50);
  for(const o of notifications??[]) {
    const user=await getUser(o.telegram_id);const code=isCurrency(user?.currency)?user.currency:"USD";
    const sent=await currencyScope.run({code},()=>sendMessage(o.telegram_id,o.otp?otpMessage(o as unknown as SmsOrder):`<b>💰 Refund Confirmed</b>\n${DIVIDER}\nService · <b>${escapeHtml(o.service_name)}</b>\nCountry · ${escapeHtml(o.country_name)}\n\nReturned · <b>${money(Number(o.refunded))}</b>\nThe amount is back in your wallet.\n\nOrder ID · <code>${o.id}</code>`,{reply_markup:ik([[{text:"📥 View Number",callback_data:`sms:o:${o.id}`}]] )}));
    await supabaseAdmin.from("bot3_sms_orders").update({notification_attempts:o.notification_attempts+1,...(sent?{notified_at:new Date().toISOString()}:{})}).eq("id",o.id);
  }
  return {checked:data?.length??0};
}
function otpMessage(o: SmsOrder) {
  return ["<b>✅ Your SMS Has Arrived</b>",DIVIDER,`Service · <b>${escapeHtml(o.service_name)}</b>`,`Country · ${escapeHtml(o.country_name)}`,`Number · <code>+${escapeHtml(o.phone??"")}</code>`,"","<b>🔐 Verification Code</b>",`<code>${escapeHtml(o.otp??"")}</code>`,"",`Order ID · <code>${o.id}</code>`,DIVIDER,"OTP delivered · this order is non-refundable."].join("\n");
}