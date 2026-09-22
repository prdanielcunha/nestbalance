export function attentionDismissalExpiry(nowMs:number,snoozeDays:number){
  const days=Number.isFinite(snoozeDays)?Math.min(30,Math.max(1,Math.round(snoozeDays))):7;
  return nowMs+days*24*60*60*1000;
}

export function activeAttentionDismissals(
  items:Array<{attentionKey?:unknown;userUid?:unknown;expiresAtMs?:unknown}>,
  userUid:string,
  nowMs:number
){
  return items
    .filter(item=>item.userUid===userUid)
    .filter(item=>typeof item.attentionKey==='string'&&item.attentionKey.length>0)
    .filter(item=>Number(item.expiresAtMs||0)>nowMs)
    .map(item=>String(item.attentionKey));
}

export function isDismissibleAttentionKind(kind:string){
  return !['overdue','due_today','due_soon'].includes(kind);
}
