export const INITIAL_NUMBER = 585;
export const formatNumber = number => String(number).padStart(4, '0');
export class CounterError extends Error {
  constructor(message,status){super(message);this.status=status;}
}
async function candidate(tx,sheet,last) {
  let n=last+1;
  while(n<=999999999) {
    const number=formatNumber(n);
    if(!sheet.has(number)&&!await tx.get('issued:'+number)&&!await tx.get('reserved:'+number)) return number;
    n++;
  }
  throw new CounterError('Достигнут предел номеров.',409);
}
export async function readCounter(storage,sheet=new Set()) {
  return storage.transaction(async tx=>{
    const last=(await tx.get('last'))??INITIAL_NUMBER;
    return {last:formatNumber(last),next:await candidate(tx,sheet,last)};
  });
}
export async function reserveNumber(storage,request,sheet=new Set()) {
  if(!request||!/^[0-9a-f-]{36}$/i.test(request.requestId||'')) throw new CounterError('Некорректный идентификатор запроса.',400);
  if(!['next','issue'].includes(request.action)) throw new CounterError('Обновите страницу сайта.',400);
  if(request.action==='issue'&&!/^\d{4,9}$/.test(request.number||'')) throw new CounterError('Укажите от 4 до 9 цифр номера.',400);
  const fingerprint=JSON.stringify([request.action,request.number??null,request.manual===true,request.reservationId??null]);
  return storage.transaction(async tx=>{
    const key='request:'+request.requestId;
    const existing=await tx.get(key);
    if(existing){
      if(existing.fingerprint!==fingerprint) throw new CounterError('Запрос уже использован для другого номера.',409);
      return existing.result;
    }
    let last=(await tx.get('last'))??INITIAL_NUMBER;
    let result;
    if(request.action==='next') {
      const number=await candidate(tx,sheet,last);
      last=Number(number);
      await tx.put('last',last);
      await tx.put('reserved:'+number,request.requestId);
      result={number,last:formatNumber(last),reservationId:request.requestId};
    } else {
      const number=request.number;
      if(sheet.has(number)) throw new CounterError('Номер '+number+' уже есть в таблице. Выберите другой номер.',409);
      if(await tx.get('issued:'+number)) throw new CounterError('Сертификат '+number+' уже выпущен. Выберите другой номер.',409);
      const owner=await tx.get('reserved:'+number);
      if(owner&&owner!==request.reservationId) throw new CounterError('Номер '+number+' уже выбран другим пользователем. Выберите другой номер.',409);
      await tx.put('issued:'+number,{requestId:request.requestId,issuedAt:new Date().toISOString()});
      if(request.manual!==true){last=Math.max(last,Number(number));await tx.put('last',last);}
      result={number,last:formatNumber(last),issued:true};
    }
    await tx.put(key,{fingerprint,result});
    return result;
  });
}
