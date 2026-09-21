(() => {
  const status=$('counter-status'), nextButton=$('next'), download=$('download');
  const endpoint=window.APRELL_COUNTER_URL;
  let busy=false, manual=false, reservation=null, pending=null, revision=0;
  let ready=false;
  const message=text=>{status.textContent=text;};
  function controls(){
    elNum.disabled=busy||!!pending;
    nextButton.disabled=busy||(!!pending&&pending.body.action!=='next');
    download.disabled=busy||!imgReady||!/^\d{4,9}$/.test(elNum.value.trim())||(!!pending&&pending.body.action!=='issue');
  }
  async function api(body){
    const response=await fetch(endpoint+'/counter',{
      method:body?'POST':'GET',cache:'no-store',headers:body?{'Content-Type':'application/json'}:{},
      body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000)
    });
    const data=await response.json();
    if(!response.ok){const error=new Error(data.error||'Не удалось проверить номер.');error.status=response.status;throw error;}
    if(!/^\d{4,9}$/.test(data.last||'')) throw new Error('Некорректный ответ хранилища.');
    return data;
  }
  function failure(error){
    message(error.name==='TimeoutError'||error instanceof TypeError
      ? 'Нет связи с хранилищем. Повторите нажатие той же кнопки — новый номер не будет создан повторно.'
      : error.message);
  }
  async function refresh(){
    if(busy||pending||document.hidden)return;
    const started=revision;
    try{
      const data=await api();
      if(started!==revision||busy||pending)return;
      lastNum=data.last; ready=true;
      if(!manual&&!reservation){elNum.value=data.next||'';draw();}
      message(manual
        ? 'Ручной номер не меняет общий счётчик. При скачивании он будет отмечен как выпущенный.'
        : 'Номер для новой карты: '+elNum.value+'. При скачивании проверим и отметим его как выпущенный.');
    }catch(error){failure(error);}
    controls();
  }
  async function run(action){
    if(busy)return;
    const number=elNum.value.trim();
    if(action==='issue'&&(!imgReady||!/^\d{4,9}$/.test(number)))return;
    // Prepare the exact card before marking it issued; rendering failures use no number.
    try{
      if(!pending){
        if(action==='issue')draw();
        pending={body:{action,requestId:crypto.randomUUID(),...(action==='issue'?{number,manual,reservationId:reservation?.number===number?reservation.id:null}:{})},
          jpg:action==='issue'?cv.toDataURL('image/jpeg',0.95):null};
      }
      if(pending.body.action!==action)return;
      busy=true;revision++;controls();
      message(action==='issue'?'Проверяем номер и отмечаем сертификат как выпущенный…':'Выбираем свободный номер…');
      const data=await api(pending.body);
      if(!/^\d{4,9}$/.test(data.number||'')||(action==='issue'&&data.issued!==true)) throw new Error('Хранилище не подтвердило выпуск. Повторите скачивание.');
      lastNum=data.last;
      if(action==='next'){
        elNum.value=data.number; manual=false;reservation={number:data.number,id:data.reservationId};pending=null;draw();
        message('Выбран свободный номер '+data.number+'. Он будет выпущен при скачивании JPG.');
      }else{
        const link=document.createElement('a');link.download='APRELL_сертификат_'+data.number+'.jpg';link.href=pending.jpg;
        document.body.appendChild(link);link.click();link.remove();
        pending=null;reservation=null;manual=false;elNum.value='';draw();
        message('Сертификат '+data.number+' выпущен. Для новой карты нажмите «Следующий номер».');
      }
    }catch(error){
      // Keep the same request and image if the response was lost, so retry is safe.
      if(error.status&&error.status<500)pending=null;
      failure(error);
    }finally{busy=false;revision++;controls();}
  }
  elNum.addEventListener('input',()=>{
    manual=true;revision++;controls();
    message(/^\d{4,9}$/.test(elNum.value.trim())
      ? 'Ручной номер не меняет общий счётчик. Перед скачиванием проверим, свободен ли он.'
      : 'Укажите от 4 до 9 цифр номера.');
  });
  nextButton.addEventListener('click',()=>run('next'));
  download.addEventListener('click',()=>run('issue'));
  img.addEventListener('load',controls);
  window.addEventListener('focus',refresh);
  document.addEventListener('visibilitychange',refresh);
  setInterval(refresh,15000);
  message('Проверяем свободный номер…');controls();refresh();
})();
