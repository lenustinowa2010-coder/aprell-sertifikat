import { CounterError } from './counter-core.mjs';
export function parseNumbers(csv) {
  const rows=[]; let row=[], field='', quoted=false;
  for(let i=0;i<csv.length;i++) {
    const c=csv[i];
    if(c==='"') { if(quoted&&csv[i+1]==='"'){field+='"';i++;} else quoted=!quoted; }
    else if(c===','&&!quoted){row.push(field);field='';}
    else if(c==='\n'&&!quoted){row.push(field.replace(/\r$/,''));rows.push(row);row=[];field='';}
    else field+=c;
  }
  if(field||row.length){row.push(field.replace(/\r$/,''));rows.push(row);}
  const column=rows[0]?.findIndex(x=>x.trim()==='Порядковый номер');
  if(quoted||column===undefined||column<0) throw new CounterError('Не удалось прочитать номера из таблицы. Повторите позже.',503);
  return new Set(rows.slice(1).map(r=>(r[column]||'').trim()).filter(n=>/^\d{4}$/.test(n)));
}
export async function sheetNumbers() {
  try {
    const response=await fetch('https://docs.google.com/spreadsheets/d/1ow3MZKWhGvEvoIfcXzvwAs8GYHWBUOpsnsKY7DPUeUw/export?format=csv&gid=0', {cache:'no-store',signal:AbortSignal.timeout(10000)});
    if(!response.ok) throw new Error();
    return parseNumbers(await response.text());
  } catch(error) {
    if(error instanceof CounterError) throw error;
    throw new CounterError('Не удалось проверить таблицу. Скачивание не выполнено — повторите позже.',503);
  }
}
