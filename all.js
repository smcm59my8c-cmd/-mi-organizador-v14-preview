

const $=id=>document.getElementById(id), dateNow=new Date(), todayISO=new Date(dateNow.getTime()-dateNow.getTimezoneOffset()*60000).toISOString().slice(0,10);
const fmtLong=new Intl.DateTimeFormat('es-ES',{weekday:'long',day:'numeric',month:'long',year:'numeric'}), fmtShort=new Intl.DateTimeFormat('es-ES',{day:'numeric',month:'short'});
$('todayText').textContent=fmtLong.format(dateNow);$('heroDate').textContent=fmtLong.format(dateNow).replace(/^./,c=>c.toUpperCase());
let tasks=[],modules=[],editingId=null,currentFilter='todas',calendarDate=new Date(dateNow.getFullYear(),dateNow.getMonth(),1),selectedDate=todayISO;
try{const rawTasks=JSON.parse(localStorage.getItem('organizador_v2_tasks')||'[]');const rawModules=JSON.parse(localStorage.getItem('organizador_v2_modules')||'[]');tasks=Array.isArray(rawTasks)?rawTasks:[];modules=Array.isArray(rawModules)?rawModules:[]}catch(e){tasks=[];modules=[]}
const defaultModules=['MP170 · Itinerario persoal para a empregabilidade II','MP169 · Itinerario persoal para a empregabilidade I','MP168 · Sostibilidade aplicada ao sistema produtivo','MP165 · Dixitalización aplicada aos sectores produtivos','M0004 · Afondamento nas competencias profesionais','M0002 · Habilidades comunicativas en lingua estranxeira','MP056 · Simulación empresarial','MP065 · Xestión loxística e comercial','MP064 · Contabilidade e fiscalidade','MP063 · Xestión Financeira','MP062 · Xestión de Recursos Humanos'];
// Conserva categorías personalizadas, corrige los módulos predeterminados y garantiza que aparezcan los once módulos.
const oldModuleNames=['MP171 · Itinerario persoal para a empregabilidade II','MP170 · Itinerario persoal para a empregabilidade I'];
modules=modules.filter(m=>!oldModuleNames.includes(m));
modules=[...defaultModules,...modules.filter(m=>!defaultModules.includes(m))];
const kindName={agenda:'Actividad',entrega:'Entrega',examen:'Examen',recordatorio:'Recordatorio'};
const categoryMeta={Estudios:{icon:'📚',color:'#8b79df',bg:'#f1edff',line:'#ded7fb',text:'#6553b5'},Trabajo:{icon:'💼',color:'#6e9bd2',bg:'#eef5fc',line:'#d8e7f6',text:'#4d76a7'},Personal:{icon:'👤',color:'#d58ab1',bg:'#fff0f6',line:'#f3d9e6',text:'#a15c80'},Casa:{icon:'🏠',color:'#d6a36d',bg:'#fff6e9',line:'#f0e0c8',text:'#9b6e3c'},Salud:{icon:'❤️',color:'#72b58d',bg:'#eef9f2',line:'#d6ebde',text:'#4d8b68'},Trámites:{icon:'🧾',color:'#c8a65f',bg:'#fff8e8',line:'#efe4c6',text:'#907638'},Ocio:{icon:'🎮',color:'#6fb7b0',bg:'#eef9f8',line:'#d6ecea',text:'#4e8f89'},Otros:{icon:'📦',color:'#9b98a8',bg:'#f5f4f8',line:'#e6e4eb',text:'#777383'}};
const categoryOrder=['Estudios','Trabajo','Salud','Casa','Trámites','Personal','Ocio','Otros'];
const rank={alta:0,media:1,baja:2}, prioName={alta:'Alta',media:'Media',baja:'Baja'}, statusName={pendiente:'Pendiente',proceso:'En proceso',completada:'Completada'}, colors={alta:'#e78a98',media:'#e8bd69',baja:'#83c39b'};
function normalizePriority(value){const v=String(value??'').trim().toLowerCase();if(['alta','high','urgent','urgente','1'].includes(v))return 'alta';if(['baja','low','3'].includes(v))return 'baja';return 'media'}
function getCategoryMeta(label){return categoryMeta[label]||categoryMeta.Otros}

// Supabase state is declared before any initial save/render call to avoid a temporal-dead-zone error.
let sbClient=null,sbUser=null,cloudSaveTimer=null,cloudRealtimeChannel=null;
let lastCloudTaskIds=new Set();
let cloudSyncBusy=false;
let cloudRestoreStarted=false;
let cloudSessionJob=null;
let cloudAuthListenerReady=false;
let cloudLastSessionKey='';
const sbConfigKey='sandra_organizer_supabase_config_v1';
const sbConfigCookie='sandra_organizer_sb_config_v1';

function save(){localStorage.setItem('organizador_v2_tasks',JSON.stringify(tasks));localStorage.setItem('organizador_v2_modules',JSON.stringify(modules));if(sbClient&&sbUser)queueCloudSave()}
function dateLabel(d){if(!d)return 'Sin fecha';return new Intl.DateTimeFormat('es-ES',{weekday:'short',day:'numeric',month:'short'}).format(new Date(d+'T12:00:00'))}
function populateModules(){const opts='<option value="">Ninguno</option>'+modules.map(m=>`<option value="${esc(m)}">${esc(m)}</option>`).join('');$('module').innerHTML=opts;$('moduleFilter').innerHTML='<option value="">Todos los módulos</option>'+modules.map(m=>`<option value="${esc(m)}">${esc(m)}</option>`).join('')}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function taskCard(t){const el=document.createElement('article');el.className='task';const bar=document.createElement('div');bar.className='taskbar';bar.style.background=colors[t.priority]||colors.media;const main=document.createElement('div');const title=document.createElement('div');title.className='tasktitle';title.textContent=t.title;const meta=document.createElement('div');meta.className='taskmeta';meta.textContent='▦ '+dateLabel(t.date)+(t.time?' · ◷ '+t.time:'')+(t.label?' · 🏷 '+t.label:'')+(t.module?' · ✿ '+t.module:'');main.append(title,meta);if(t.note){const n=document.createElement('div');n.className='tasknote';n.textContent=t.note;main.append(n)}if(t.reminder1_minutes!=null||t.reminder2_minutes!=null){const r=document.createElement('div');r.className='tasknote';const labels=[t.reminder1_minutes,t.reminder2_minutes].filter(v=>v!=null&&v!=='').map(v=>Number(v)>=10080?'1 semana antes':Number(v)>=1440?'1 día antes':Number(v)>=60?(Number(v)/60)+' h antes':v+' min antes');r.textContent='🔔 '+labels.join(' · ');main.append(r)}const badges=document.createElement('div');badges.className='badges';badges.innerHTML=`<span class="badge prio-${t.priority}">Importancia: ${prioName[t.priority]}</span><span class="badge status-${t.status}">${statusName[t.status]}</span><span class="badge kind-badge">${kindName[t.kind||'agenda']}</span>${t.label?`<span class="badge" style="background:#eeeaff;color:#6553b5">${esc(t.label)}</span>`:''}`;main.append(badges);
const actions=document.createElement('div');actions.className='taskactions';const sel=document.createElement('select');sel.setAttribute('aria-label','Cambiar estado');Object.entries(statusName).forEach(([v,n])=>{const o=document.createElement('option');o.value=v;o.textContent=n;o.selected=t.status===v;sel.append(o)});sel.onchange=()=>{t.status=sel.value;save();renderAll()};const edit=document.createElement('button');edit.className='iconbtn';edit.title='Editar tarea';edit.textContent='✎';edit.onclick=()=>startEdit(t.id);const del=document.createElement('button');del.className='iconbtn';del.title='Eliminar tarea';del.textContent='✕';del.onclick=()=>{if(confirm('¿Quieres eliminar esta tarea?')){tasks=tasks.filter(x=>x.id!==t.id);save();renderAll()}};actions.append(sel,edit,del);el.append(bar,main,actions);return el}
function sorted(list,mode='priority'){return [...list].sort((a,b)=>mode==='newest'?b.created-a.created:mode==='date'?(a.date||'9999').localeCompare(b.date||'9999')||(a.time||'').localeCompare(b.time||''):rank[a.priority]-rank[b.priority]||(a.date||'9999').localeCompare(b.date||'9999')||(a.time||'').localeCompare(b.time||''))}
function fillList(id,list){const box=$(id);box.innerHTML='';if(!list.length){box.innerHTML='<div class="empty">🌷<b>No hay tareas por aquí</b>Añade una tarea o prueba con otro filtro.</div>';return}list.forEach(t=>box.append(taskCard(t)))}
function renderStats(){$('total').textContent=tasks.length;$('pending').textContent=tasks.filter(t=>t.status==='pendiente').length;$('doing').textContent=tasks.filter(t=>t.status==='proceso').length;$('done').textContent=tasks.filter(t=>t.status==='completada').length}
function renderTasks(){const q=$('search').value.trim().toLowerCase(),mf=$('moduleFilter').value;const list=tasks.filter(t=>(currentFilter==='todas'||t.status===currentFilter)&&(!mf||t.module===mf)&&(`${t.title} ${t.note||''} ${t.module||''} ${t.label||''} ${kindName[t.kind||'agenda']}`).toLowerCase().includes(q));fillList('allList',sorted(list,$('sort').value));renderDashboard()}
function isoAfter(days){const d=new Date(dateNow.getFullYear(),dateNow.getMonth(),dateNow.getDate()+days);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10)}
function fillDashboardList(id,list,emptyText){const box=$(id);box.innerHTML='';if(!list.length){box.innerHTML=`<div class="empty">${emptyText}</div>`;return}list.forEach(t=>box.append(taskCard(t)))}
function renderTodayByCategory(list){
 const summary=$('todayCategorySummary');
 const box=$('todayList');
 summary.innerHTML=''; box.innerHTML='';
 const groups=new Map();
 list.forEach(t=>{const key=categoryOrder.includes(t.label)?t.label:(t.label||'Otros');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(t)});
 const ordered=[...groups.entries()].sort((a,b)=>categoryOrder.indexOf(a[0])-categoryOrder.indexOf(b[0]));
 ordered.forEach(([label,items])=>{
   const meta=getCategoryMeta(label);
   const chip=document.createElement('span'); chip.className='category-summary-chip'; chip.innerHTML=`<span class="category-summary-dot" style="background:${meta.color}"></span>${meta.icon} ${esc(label)} <b>${items.length}</b>`; summary.append(chip);
 });
 if(!ordered.length){box.innerHTML='<div class="empty">✨ Hoy está todo despejado. Disfruta del día o añade algo nuevo.</div>';return}
 ordered.forEach(([label,items])=>{
   const meta=getCategoryMeta(label);
   const group=document.createElement('section'); group.className='category-group'; group.style.setProperty('--cat',meta.color);group.style.setProperty('--cat-bg',meta.bg);group.style.setProperty('--cat-line',meta.line);group.style.setProperty('--cat-text',meta.text);
   const head=document.createElement('div');head.className='category-group-head';head.innerHTML=`<div class="category-group-title"><span class="category-group-dot"></span>${meta.icon} ${esc(label)}</div><span class="category-group-count">${items.length} ${items.length===1?'tarea':'tareas'}</span>`;group.append(head);
   const listBox=document.createElement('div');listBox.className='tasklist';sorted(items,'date').forEach(t=>listBox.append(taskCard(t)));group.append(listBox);box.append(group);
 });
}
function renderDashboard(){
 const tomorrow=isoAfter(1);
 const active=tasks.filter(t=>t.status!=='completada');
 const agendaTypes=['agenda','recordatorio'];
 const todayActivities=sorted(active.filter(t=>t.date===todayISO&&agendaTypes.includes(t.kind||'agenda')),'date');
 const tomorrowActivities=sorted(active.filter(t=>t.date===tomorrow&&agendaTypes.includes(t.kind||'agenda')),'date');
 const todayDeadlines=sorted(active.filter(t=>t.date===todayISO&&['entrega','examen'].includes(t.kind)),'date');
 $('dashTodayLabel').textContent=new Intl.DateTimeFormat('es-ES',{day:'numeric',month:'short'}).format(dateNow);
 $('dashTomorrowLabel').textContent=new Intl.DateTimeFormat('es-ES',{day:'numeric',month:'short'}).format(new Date(tomorrow+'T12:00:00'));
 $('dashTodayCount').textContent=`${todayActivities.length} ${todayActivities.length===1?'actividad':'actividades'}`;
 $('dashTomorrowCount').textContent=`${tomorrowActivities.length} ${tomorrowActivities.length===1?'actividad':'actividades'}`;
 const todayAll=tasks.filter(t=>t.date===todayISO);
 const todayDone=todayAll.filter(t=>t.status==='completada').length;
 const todayTotal=todayAll.length;
 const pct=todayTotal?Math.round(todayDone/todayTotal*100):0;
 $('dayProgressBar').style.width=pct+'%';
 $('dayProgressNumber').textContent=pct+'%';
 $('progressTitle').textContent=todayTotal===0?'Tu día está libre':`${todayDone} de ${todayTotal} ${todayTotal===1?'compromiso completado':'compromisos completados'}`;
 $('progressSub').textContent=todayTotal===0?'No tienes tareas, entregas ni exámenes programados para hoy.':(todayDone===todayTotal?'✨ Has terminado todo lo previsto.':`Te quedan ${todayTotal-todayDone} por completar hoy.`);
 const overdue=active.filter(t=>t.date&&t.date<todayISO).sort((a,b)=>(a.date||'').localeCompare(b.date||'')||(a.time||'').localeCompare(b.time||''));
 $('overdueBox').classList.toggle('hidden',!overdue.length);
 fillDashboardList('overdueList',overdue.slice(0,4),'');
 renderTodayByCategory(todayActivities);
 fillDashboardList('tomorrowList',tomorrowActivities,'🌿 Mañana está despejado por ahora.');
 const due=sorted(active.filter(t=>['entrega','examen'].includes(t.kind)&&t.date>=todayISO&&t.date<=isoAfter(45)),'date');
 fillDashboardList('deadlineList',due.slice(0,7),'🎉 No tienes entregas ni exámenes próximos en los siguientes 45 días.');
 const important=sorted(active.filter(t=>t.priority==='alta'&&t.date>tomorrow&&t.date<=isoAfter(30)&&agendaTypes.includes(t.kind||'agenda')),'date').slice(0,4);
 const importantIds=new Set(important.map(t=>String(t.id)));
 const ibox=$('importantList');ibox.innerHTML='';
 if(!important.length){ibox.innerHTML='<div class="empty" style="padding:15px 5px">🌷 No tienes prioridades altas próximas.</div>'}
 important.forEach(t=>{const row=document.createElement('div');row.className='important-item';row.innerHTML=`<div class="important-icon">⭐</div><div class="important-main"><b>${esc(t.title)}</b><span>${dateLabel(t.date)}${t.time?' · '+t.time:''} · ${kindName[t.kind||'agenda']}</span></div>`;ibox.append(row)});
 const next=sorted(active.filter(t=>t.date>tomorrow&&agendaTypes.includes(t.kind||'agenda')&&!importantIds.has(String(t.id))),'date').slice(0,5);
 fillDashboardList('nextList',next,'No hay más actividades programadas.');
}
function renderCalendar(){const y=calendarDate.getFullYear(),m=calendarDate.getMonth();$('monthTitle').textContent=new Intl.DateTimeFormat('es-ES',{month:'long',year:'numeric'}).format(calendarDate).replace(/^./,c=>c.toUpperCase());const box=$('calendar');box.innerHTML='';['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'].forEach(d=>{const w=document.createElement('div');w.className='weekday';w.textContent=d;box.append(w)});const first=new Date(y,m,1),offset=(first.getDay()+6)%7,days=new Date(y,m+1,0).getDate(),prevDays=new Date(y,m,0).getDate();for(let i=0;i<42;i++){let dnum,dt,muted=false;if(i<offset){dnum=prevDays-offset+i+1;dt=new Date(y,m-1,dnum);muted=true}else if(i>=offset+days){dnum=i-offset-days+1;dt=new Date(y,m+1,dnum);muted=true}else{dnum=i-offset+1;dt=new Date(y,m,dnum)}const iso=new Date(dt.getTime()-dt.getTimezoneOffset()*60000).toISOString().slice(0,10);const cell=document.createElement('div');cell.className='day'+(muted?' muted':'')+(iso===todayISO?' today':'')+(iso===selectedDate?' selected':'');cell.innerHTML=`<div class="daynum">${dnum}</div>`;tasks.filter(t=>t.date===iso).slice(0,3).forEach(t=>{const dot=document.createElement('span');dot.className='eventdot '+t.priority;dot.textContent=(t.time?t.time+' ':'')+t.title;cell.append(dot)});const count=tasks.filter(t=>t.date===iso).length;if(count>3){const more=document.createElement('span');more.className='eventdot';more.textContent=`+${count-3} más`;cell.append(more)}cell.onclick=()=>{selectedDate=iso;renderCalendar()};box.append(cell)}$('selectedTitle').textContent='Tareas · '+dateLabel(selectedDate);const list=$('selectedList');list.innerHTML='';const selected=sorted(tasks.filter(t=>t.date===selectedDate),'date');if(!selected.length)list.innerHTML='<div class="empty">🌼 No tienes tareas programadas para este día.</div>';selected.forEach(t=>{const d=document.createElement('div');d.className='dayitem';d.innerHTML=`<div><b>${esc(t.title)}</b><div style="margin-top:5px"><span class="badge status-${t.status}">${statusName[t.status]}</span> <span class="badge prio-${t.priority}">${prioName[t.priority]}</span></div></div><span>${t.time||'Sin hora'}</span>`;list.append(d)})}
function renderAgenda(){const box=$('agendaList');box.innerHTML='';for(let i=0;i<7;i++){const d=new Date(dateNow.getFullYear(),dateNow.getMonth(),dateNow.getDate()+i);const iso=new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10);const group=sorted(tasks.filter(t=>t.date===iso&&['agenda','recordatorio'].includes(t.kind||'agenda')),'date');const row=document.createElement('div');row.className='agendaday';const label=document.createElement('div');label.className='agenda-date';label.textContent=i===0?'Hoy':i===1?'Mañana':new Intl.DateTimeFormat('es-ES',{weekday:'short',day:'numeric',month:'short'}).format(d);const items=document.createElement('div');items.className='agenda-items';if(!group.length){const none=document.createElement('div');none.className='agenda-card';none.innerHTML='<div class="ag-sub">Día libre · No hay tareas programadas</div>';items.append(none)}group.forEach(t=>{const c=document.createElement('div');c.className='agenda-card';c.innerHTML=`<div class="ag-time">${t.time||'—:—'}</div><div><div class="ag-title">${esc(t.title)}</div><div class="ag-sub">${esc(t.module||'Sin categoría')} · ${statusName[t.status]} · Prioridad ${prioName[t.priority]}</div></div>`;items.append(c)});row.append(label,items);box.append(row)}}
function renderModules(){const box=$('moduleGrid');box.innerHTML='';if(!modules.length){box.innerHTML='<div class="empty">Aún no has creado módulos.</div>';return}modules.forEach(m=>{const ts=tasks.filter(t=>t.module===m),done=ts.filter(t=>t.status==='completada').length,pct=ts.length?Math.round(done/ts.length*100):0;const card=document.createElement('div');card.className='modulecard';card.innerHTML=`<h4>${esc(m)}</h4><p>${ts.length} ${ts.length===1?'tarea':'tareas'} · ${done} completadas</p><div class="progress"><span style="width:${pct}%"></span></div><div class="modulecount">${pct}% completado</div><button class="smallbtn" style="margin-top:12px" data-mod="${esc(m)}">Ver tareas →</button> <button class="smallbtn" style="margin-top:12px;background:#fff0f2;color:#b74f62" data-delmod="${esc(m)}">Eliminar categoría</button>`;box.append(card)});box.querySelectorAll('[data-mod]').forEach(b=>b.onclick=()=>{switchView('tareas');$('moduleFilter').value=b.dataset.mod;renderTasks()});box.querySelectorAll('[data-delmod]').forEach(b=>b.onclick=()=>{const m=b.dataset.delmod;if(confirm(`¿Eliminar la categoría «${m}»? Las tareas se conservarán sin categoría.`)){modules=modules.filter(x=>x!==m);tasks.forEach(t=>{if(t.module===m)t.module=''});save();populateModules();renderAll()}})}
function updateWelcome(){
 const h=new Date().getHours();
 const greeting=h<12?'Buenos días':h<19?'Buenas tardes':'Buenas noches';
 const icon=h<19?'☀️':'🌙';
 const active=tasks.filter(t=>t.status!=='completada');
 const agendaTypes=['agenda','recordatorio'];
 const todayActivities=active.filter(t=>t.date===todayISO&&agendaTypes.includes(t.kind||'agenda'));
 const todayDeadlines=active.filter(t=>t.date===todayISO&&['entrega','examen'].includes(t.kind));
 const overdue=active.filter(t=>t.date&&t.date<todayISO);
 let sub;
 if(!todayActivities.length&&!todayDeadlines.length){sub='Hoy no tienes nada pendiente en tu agenda. Disfruta de un día tranquilo. ✨'}
 else if(todayActivities.length===1){sub='Tienes 1 actividad en tu agenda para hoy.'}
 else if(todayActivities.length>1){sub=`Tienes ${todayActivities.length} actividades en tu agenda para hoy.`}
 else{sub='Hoy no tienes actividades de agenda.'}
 if(todayDeadlines.length)sub+=` Además, ${todayDeadlines.length} ${todayDeadlines.length===1?'entrega o examen':'entregas o exámenes'} hoy.`;
 if(overdue.length)sub+=` Y ${overdue.length} ${overdue.length===1?'pendiente atrasada':'pendientes atrasadas'}.`;
 $('hello').textContent=`${greeting}, Sandra ${icon}`;
 $('heroTitle').textContent=`${greeting}, Sandra ${icon}`;
 $('heroSub').textContent=sub;
}
function renderAll(){renderStats();updateWelcome();populateModules();renderTasks();renderCalendar();renderAgenda();renderModules()}
function switchView(view){if(!['inicio','tareas','calendario','agenda','modulos','ajustes'].includes(view))return;document.querySelectorAll('.nav [data-view]').forEach(b=>{b.classList.toggle('active',b.dataset.view===view);b.setAttribute('aria-selected',b.dataset.view===view?'true':'false')});['inicio','tareas','calendario','agenda','modulos','ajustes'].forEach(v=>{const el=$('view-'+v);if(el){el.classList.toggle('hidden',v!==view);el.style.display=v===view?'':'none'}});$('stats').classList.toggle('hidden',view==='calendario'||view==='ajustes');document.querySelector('.hero').classList.toggle('hidden',view==='ajustes');const titles={inicio:'',tareas:'Todas tus tareas, bajo control ✨',calendario:'Mira tu mes de un vistazo 🗓️',agenda:'Tu semana, paso a paso 🌷',modulos:'Mis módulos del ciclo ✿',ajustes:'Ajustes y preferencias ⚙️'};const subs={inicio:'',tareas:'Filtra, busca y ordena lo que tienes pendiente.',calendario:'Selecciona un día para consultar las tareas programadas.',agenda:'Consulta tus tareas de hoy y de los próximos días.',modulos:'Aquí tienes tus módulos y el progreso de cada uno.',ajustes:'La parte técnica, solo cuando la necesites.'};if(view!=='ajustes'){$('heroTitle').textContent=titles[view];$('heroSub').textContent=subs[view];if(view==='inicio')updateWelcome();}if(view==='calendario')renderCalendar();if(view==='agenda')renderAgenda();if(view==='modulos')renderModules();}function openTaskForm(){document.body.classList.add('modal-open');$('formBackdrop').classList.remove('hidden');$('formPanel').classList.add('task-modal');setTimeout(()=>$('title').focus(),120)}
function closeTaskForm(){document.body.classList.remove('modal-open');$('formBackdrop').classList.add('hidden');$('formPanel').classList.remove('task-modal');resetForm()}
function startEdit(id){const t=tasks.find(x=>x.id===id);if(!t)return;editingId=id;$('title').value=t.title;$('kind').value=t.kind||'agenda';$('date').value=t.date||todayISO;$('time').value=t.time||'';$('priority').value=t.priority;$('status').value=t.status;$('module').value=t.module||'';$('label').value=t.label||'Estudios';$('note').value=t.note||'';$('reminder1').value=t.reminder1_minutes==null?'':String(t.reminder1_minutes);$('reminder2').value=t.reminder2_minutes==null?'':String(t.reminder2_minutes);$('formHeading').textContent='✎ Editar tarea';$('saveBtn').textContent='Guardar cambios';$('cancelEdit').classList.remove('hidden');openTaskForm()}
function resetForm(){editingId=null;$('taskForm').reset();$('date').value=todayISO;$('priority').value='media';$('status').value='pendiente';$('formHeading').textContent='＋ Añadir una tarea';$('saveBtn').textContent='＋ Guardar tarea';$('cancelEdit').classList.add('hidden')}
$('taskForm').onsubmit=e=>{e.preventDefault();const data={title:$('title').value.trim(),kind:$('kind').value,date:$('date').value,time:$('time').value,priority:$('priority').value,status:$('status').value,label:$('label').value,module:$('module').value,note:$('note').value.trim(),reminder1_minutes:$('reminder1').value===''?null:Number($('reminder1').value),reminder2_minutes:$('reminder2').value===''?null:Number($('reminder2').value)};if(editingId){const t=tasks.find(x=>x.id===editingId);Object.assign(t,data)}else tasks.push({...data,id:crypto.randomUUID?crypto.randomUUID():String(Date.now()),created:Date.now()});save();closeTaskForm();renderAll()};
$('cancelEdit').onclick=closeTaskForm;$('closeForm').onclick=closeTaskForm;$('formBackdrop').onclick=closeTaskForm;
document.getElementById('nav').addEventListener('click',e=>{const b=e.target.closest('[data-view]');if(!b)return;e.preventDefault();switchView(b.dataset.view)});
$('filters').onclick=e=>{const b=e.target.closest('[data-filter]');if(!b)return;currentFilter=b.dataset.filter;document.querySelectorAll('.chip').forEach(x=>x.classList.toggle('active',x===b));renderTasks()};
$('search').oninput=renderTasks;$('sort').onchange=renderTasks;$('moduleFilter').onchange=renderTasks;
$('seeAll').onclick=()=>switchView('tareas');
$('prevMonth').onclick=()=>{calendarDate=new Date(calendarDate.getFullYear(),calendarDate.getMonth()-1,1);renderCalendar()};
$('nextMonth').onclick=()=>{calendarDate=new Date(calendarDate.getFullYear(),calendarDate.getMonth()+1,1);renderCalendar()};
$('thisMonth').onclick=()=>{calendarDate=new Date(dateNow.getFullYear(),dateNow.getMonth(),1);selectedDate=todayISO;renderCalendar()};
$('agendaToday').onclick=()=>renderAgenda();
$('settingsQuick').onclick=()=>switchView('ajustes');
$('addToday').onclick=()=>{resetForm();$('kind').value='agenda';$('date').value=todayISO;openTaskForm()};$('heroAdd').onclick=()=>{resetForm();$('kind').value='agenda';$('date').value=todayISO;openTaskForm()};
$('openAgenda').onclick=()=>switchView('agenda');
$('moduleForm').onsubmit=e=>{e.preventDefault();const m=$('moduleName').value.trim();if(m&&!modules.some(x=>x.toLowerCase()===m.toLowerCase())){modules.push(m);save();populateModules();renderModules()}$('moduleName').value=''};
const validId=id=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(id||''));const seenIds=new Set();tasks=tasks.map(t=>{let id=validId(t.id)?String(t.id):crypto.randomUUID();if(seenIds.has(id))return null;seenIds.add(id);return {...t,id,kind:['agenda','entrega','examen','recordatorio'].includes(t.kind)?t.kind:'agenda',label:t.label||'Otros',status:['pendiente','proceso','completada'].includes(t.status)?t.status:'pendiente',priority:normalizePriority(t.priority),created:Number(t.created)||Date.now()}}).filter(Boolean);$('date').value=todayISO;save();populateModules();renderAll();switchView('inicio');

// --- Supabase: sincronización automática entre dispositivos ---
function readStoredConfig(){
 try{const raw=localStorage.getItem(sbConfigKey);if(raw){const c=JSON.parse(raw);if(c?.url&&c?.key)return c}}catch(_){ }
 try{const m=document.cookie.match(/(?:^|; )sandra_organizer_sb_config_v1=([^;]+)/);if(m){const c=JSON.parse(decodeURIComponent(m[1]));if(c?.url&&c?.key)return c}}catch(_){ }
 return null;
}
function persistStoredConfig(cfg){
 const clean={url:String(cfg.url||'').trim(),key:String(cfg.key||'').trim()};
 try{localStorage.setItem(sbConfigKey,JSON.stringify(clean))}catch(_){ }
 try{document.cookie=sbConfigCookie+'='+encodeURIComponent(JSON.stringify(clean))+'; Max-Age=31536000; Path=/; SameSite=Lax'}catch(_){ }
 return clean;
}
function cloudMsg(msg,isError=false){
 const color=isError?'#b74f62':'var(--muted)';
 const a=$('cloudMessage');if(a){a.textContent=msg;a.style.color=color}
 const b=$('cloudMessageTop');if(b){b.textContent=msg;b.style.color=color}
}
function cloudBadge(text,ok=false){$('cloudStatus').textContent=text;$('cloudStatus').style.background=ok?'#e3f5eb':'#fff2d9';$('cloudStatus').style.color=ok?'#36835b':'#9a6a13';const f=$('syncFooterStatus');if(f)f.textContent=ok?'☁️ Sincronización activa':'☁️ Sincronización no iniciada'}
function setCloudAuthUI(){
 const logged=!!sbUser;
 $('pullSb').disabled=!logged;$('pushSb').disabled=!logged;$('logoutSb').disabled=!logged;$('loginSb').disabled=logged;$('signupSb').disabled=logged;
 if(logged)cloudBadge('Conectada ✓',true);else cloudBadge(sbClient?'Lista · inicia sesión':'Sin conectar',false);
}
function initSupabase(){
 const url=$('sbUrl').value.trim(),key=$('sbKey').value.trim();
 if(!url||!key){cloudMsg('Introduce la URL y la clave publishable/anon de tu proyecto.',true);return false}
 if(!window.supabase?.createClient){cloudMsg('No se ha podido cargar la librería de conexión. Comprueba la conexión a internet.',true);return false}
 try{
  if(sbClient){
   setCloudAuthUI();
   cloudMsg('La conexión ya está configurada. Puedes iniciar sesión.');
   return true;
  }
  sbClient=window.supabase.createClient(url,key);
  persistStoredConfig({url,key});
  attachAuthListener();
  setCloudAuthUI();
  cloudMsg('Conexión configurada. Ahora inicia sesión.');
  return true;
 }catch(e){cloudMsg('No se pudo configurar Supabase: '+e.message,true);return false}
}
function toDbTask(t){const idOk=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(t.id||'');if(!idOk)t.id=crypto.randomUUID();const localDateTime=t.date?(t.date+'T'+(t.time||'00:00')+':00'):null;const stamp=localDateTime?new Date(localDateTime).toISOString():null;return {id:t.id,user_id:sbUser.id,title:t.title||'Sin título',description:t.note||null,category:t.label||null,task_type:t.kind||'agenda',module:t.module||null,status:t.status||'pendiente',priority:normalizePriority(t.priority),start_at:stamp,due_at:['entrega','examen'].includes(t.kind)?stamp:null,end_at:null,reminder1_minutes:Number.isFinite(t.reminder1_minutes)?t.reminder1_minutes:null,reminder2_minutes:Number.isFinite(t.reminder2_minutes)?t.reminder2_minutes:null,updated_at:new Date().toISOString()}}
function fromDbTask(r){const d=r.start_at?new Date(r.start_at):r.due_at?new Date(r.due_at):null;const date=d?new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10):'';const time=d?new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(11,16):'';return {id:r.id,title:r.title||'',note:r.description||'',label:r.category||'Estudios',kind:r.task_type||'agenda',module:r.module||'',status:r.status||'pendiente',priority:r.priority||'media',date,time,created:r.created_at?new Date(r.created_at).getTime():Date.now(),reminder1_minutes:r.reminder1_minutes,reminder2_minutes:r.reminder2_minutes}}
async function loadCloudTasks(showMessage=true){if(!sbClient||!sbUser)return false;if(showMessage)cloudMsg('Sincronizando…');const {data,error}=await sbClient.from('tasks').select('*').eq('user_id',sbUser.id).order('start_at',{ascending:true});if(error){cloudMsg('No se pudieron sincronizar las tareas: '+error.message,true);return false}const remoteTasks=(data||[]).map(fromDbTask);tasks=remoteTasks;lastCloudTaskIds=new Set(remoteTasks.map(t=>String(t.id)));localStorage.setItem('organizador_v2_tasks',JSON.stringify(tasks));renderAll();if(showMessage)cloudMsg(`Sincronizado · ${remoteTasks.length} tareas`);return true}
async function syncTasksToCloud(){if(!sbClient||!sbUser||cloudSyncBusy)return false;cloudSyncBusy=true;try{const rows=tasks.map(toDbTask);const currentIds=new Set(rows.map(r=>String(r.id)));const missing=[...lastCloudTaskIds].filter(id=>!currentIds.has(id));if(rows.length){const {error}=await sbClient.from('tasks').upsert(rows,{onConflict:'id'});if(error)throw error}if(missing.length){const {error}=await sbClient.from('tasks').delete().eq('user_id',sbUser.id).in('id',missing);if(error)throw error}lastCloudTaskIds=currentIds;cloudMsg('Sincronizado automáticamente ✓');return true}catch(e){cloudMsg('Guardado local correcto; se reintentará la sincronización.',true);console.warn('Sincronización:',e);return false}finally{cloudSyncBusy=false}}
function queueCloudSave(){clearTimeout(cloudSaveTimer);cloudSaveTimer=setTimeout(()=>syncTasksToCloud(),500)}
async function subscribeCloudRealtime(){if(!sbClient||!sbUser)return;if(cloudRealtimeChannel){try{await sbClient.removeChannel(cloudRealtimeChannel)}catch(_){}}const userId=sbUser.id;cloudRealtimeChannel=sbClient.channel('tasks-realtime-'+userId).on('postgres_changes',{event:'*',schema:'public',table:'tasks',filter:'user_id=eq.'+userId},payload=>{if(!sbUser)return;const type=payload.eventType;if(type==='DELETE'){const id=String(payload.old?.id||'');if(id){tasks=tasks.filter(t=>String(t.id)!==id);lastCloudTaskIds.delete(id)}}else{const row=payload.new;if(!row||String(row.user_id)!==String(sbUser.id))return;const mapped=fromDbTask(row);const i=tasks.findIndex(t=>String(t.id)===String(mapped.id));if(i>=0)tasks[i]=mapped;else tasks.push(mapped);lastCloudTaskIds.add(String(mapped.id))}localStorage.setItem('organizador_v2_tasks',JSON.stringify(tasks));renderAll()}).subscribe((status,err)=>{if(status==='SUBSCRIBED')cloudMsg('Sincronización en tiempo real activa ✓');else if(status==='CHANNEL_ERROR'||status==='TIMED_OUT'){cloudMsg('La conexión en tiempo real se ha interrumpido; reintentando…',true);setTimeout(()=>{if(sbUser)subscribeCloudRealtime()},2500)}if(err)console.warn('Supabase Realtime:',err)})}
async function pushCloudTasks(){if(!sbClient||!sbUser)return;cloudMsg('Revisando y sincronizando todas las tareas…');lastCloudTaskIds=new Set((await sbClient.from('tasks').select('id').eq('user_id',sbUser.id)).data?.map(r=>String(r.id))||[]);await syncTasksToCloud()}
$('importLocalJson').onclick=()=> $('importJsonFile').click();
$('importJsonFile').addEventListener('change',async ev=>{
 const file=ev.target.files?.[0];if(!file)return;
 try{
  const raw=JSON.parse(await file.text());
  const imported=Array.isArray(raw)?raw:raw.tasks;
  if(!Array.isArray(imported))throw new Error('El archivo no contiene una lista de tareas reconocible.');
  const normalized=imported.map((t,i)=>({id:t.id??('migrated-'+Date.now()+'-'+i),title:t.title||'Sin título',note:t.note??t.description??'',label:t.label??t.category??'Personal',kind:t.kind??t.task_type??'agenda',module:t.module||'',status:t.status||'pendiente',priority:normalizePriority(t.priority),date:t.date||(t.start_at?String(t.start_at).slice(0,10):''),time:t.time||(t.start_at?String(t.start_at).slice(11,16):''),created:Number(t.created)||Date.now(),reminder1_minutes:Number.isFinite(t.reminder1_minutes)?t.reminder1_minutes:null,reminder2_minutes:Number.isFinite(t.reminder2_minutes)?t.reminder2_minutes:null}));
  const ids=new Set(tasks.map(t=>String(t.id)));const fresh=normalized.filter(t=>!ids.has(String(t.id)));
  if(!fresh.length){cloudMsg('No se han añadido tareas: todas parecen estar ya en esta versión.',true);return}
  if(!confirm(`Se van a importar ${fresh.length} tareas. No se borrará ninguna tarea existente. ¿Continuar?`))return;
  tasks=[...tasks,...fresh];
  if(Array.isArray(raw.modules)){modules=[...new Set([...modules,...raw.modules])];localStorage.setItem('organizador_v2_modules',JSON.stringify(modules));populateModules()}
  localStorage.setItem('organizador_v2_tasks',JSON.stringify(tasks));renderAll();
  cloudMsg(`Importadas ${fresh.length} tareas en este dispositivo. Revisa el listado y, cuando estés segura, pulsa «Subir tareas de este dispositivo» para copiarlas a Supabase.`);
 }catch(e){cloudMsg('No se pudo importar el archivo: '+e.message,true)}finally{ev.target.value=''}
});
$('connectSb').onclick=initSupabase;
$('loginSb').onclick=async()=>{
 try{
  if(!sbClient&&!initSupabase())return;
  const email=$('sbEmail').value.trim(),password=$('sbPassword').value;
  if(!email||!password){cloudMsg('Escribe tu correo y contraseña.',true);return}
  cloudMsg('Iniciando sesión…');
  const {error}=await sbClient.auth.signInWithPassword({email,password});
  if(error){cloudMsg('No se pudo iniciar sesión: '+error.message,true);return}
  cloudMsg('Inicio de sesión correcto. Cargando tus tareas…');
 }catch(e){cloudMsg('No se pudo iniciar sesión: '+(e?.message||e),true);console.error(e)}
};
$('signupSb').onclick=async()=>{try{if(!sbClient&&!initSupabase())return;const email=$('sbEmail').value.trim(),password=$('sbPassword').value;if(!email||!password){cloudMsg('Escribe tu correo y una contraseña.',true);return}if(password.length<6){cloudMsg('La contraseña debe tener al menos 6 caracteres.',true);return}cloudMsg('Creando cuenta…');const {error}=await sbClient.auth.signUp({email,password});if(error){cloudMsg('No se pudo crear la cuenta: '+error.message,true);return}cloudMsg('Cuenta creada. Si te pide confirmar el correo, hazlo y después inicia sesión.')}catch(e){cloudMsg('No se pudo crear la cuenta: '+(e?.message||e),true)}};
$('pullSb').onclick=()=>loadCloudTasks(true);$('pushSb').onclick=pushCloudTasks;
$('logoutSb').onclick=async()=>{try{if(cloudRealtimeChannel&&sbClient)await sbClient.removeChannel(cloudRealtimeChannel)}catch(_){}cloudRealtimeChannel=null;if(sbClient)await sbClient.auth.signOut();sbUser=null;cloudLastSessionKey='';lastCloudTaskIds=new Set();setCloudAuthUI();cloudMsg('Has cerrado sesión. Tus tareas locales siguen en este dispositivo.')};
async function applyCloudSession(session){
 const user=session?.user||null;
 const key=session?.access_token||'';
 if(!user){
  sbUser=null;cloudLastSessionKey='';lastCloudTaskIds=new Set();
  if(cloudRealtimeChannel&&sbClient){try{await sbClient.removeChannel(cloudRealtimeChannel)}catch(_){}cloudRealtimeChannel=null}
  setCloudAuthUI();
  return false;
 }
 if(key&&key===cloudLastSessionKey&&sbUser?.id===user.id&&cloudRealtimeChannel)return true;
 cloudLastSessionKey=key;sbUser=user;setCloudAuthUI();cloudMsg('Sincronizando tu día…');
 const ok=await loadCloudTasks(false);
 if(!ok){setCloudAuthUI();return false}
 await subscribeCloudRealtime();
 updateWelcome();
 cloudMsg('Sincronización automática activa ✓');
 return true;
}
function scheduleApplySession(session){
 if(cloudSessionJob)return;
 cloudSessionJob=setTimeout(async()=>{cloudSessionJob=null;try{await applyCloudSession(session)}catch(e){console.error('Sesión Supabase:',e);cloudMsg('No se pudo completar la sincronización: '+(e?.message||e),true)}},0);
}
function attachAuthListener(){
 if(!sbClient||cloudAuthListenerReady)return;
 cloudAuthListenerReady=true;
 sbClient.auth.onAuthStateChange((_event,session)=>scheduleApplySession(session));
}
async function restoreCloudSession(){
 if(cloudRestoreStarted)return false;
 cloudRestoreStarted=true;
 try{
  const cfg=readStoredConfig();
  if(!cfg?.url||!cfg?.key){setCloudAuthUI();return false}
  $('sbUrl').value=cfg.url;$('sbKey').value=cfg.key;
  if(!window.supabase?.createClient){cloudMsg('No se ha podido cargar la librería de conexión. Comprueba la conexión a internet.',true);return false}
  sbClient=window.supabase.createClient(cfg.url,cfg.key);
  attachAuthListener();
  setCloudAuthUI();
  const {data,error}=await sbClient.auth.getSession();
  if(error)throw error;
  await applyCloudSession(data?.session||null);
  return !!data?.session;
 }catch(e){console.warn('No se pudo recuperar la sesión de Supabase',e);cloudMsg('No se pudo recuperar la sesión automáticamente: '+(e?.message||e),true);setCloudAuthUI();return false}
}
if(window.supabase?.createClient){restoreCloudSession()}
setCloudAuthUI();
try{cloudMsg('V10 cargada correctamente · '+(readStoredConfig()?'configuración recuperada':'sin configuración guardada'));}catch(_){}

// Avisos: Web Push para la PWA instalada en iPad/iPhone/Mac + respaldo local mientras la página está abierta.
const VAPID_PUBLIC_KEY='BLzrgUNindoUErqH4B47QUrVzXY32Hn0qwNY50nzN38EKwTQWPy3rxSqYAcO-L-cSg_DzrW04K1InNKIvYg2x60';
const sentReminderKey='sandra_organizer_sent_reminders_v2';
function readSent(){try{return JSON.parse(localStorage.getItem(sentReminderKey)||'{}')}catch(e){return {}}}
function sendNotice(title,body,tag){if('Notification' in window&&Notification.permission==='granted'){try{if(navigator.serviceWorker?.controller){navigator.serviceWorker.controller.postMessage({type:'SHOW_LOCAL_NOTIFICATION',title,body,tag})}else new Notification(title,{body,tag})}catch(e){try{new Notification(title,{body,tag})}catch(_){}}}}
function urlBase64ToUint8Array(base64String){const padding='='.repeat((4-base64String.length%4)%4),base64=(base64String+padding).replace(/-/g,'+').replace(/_/g,'/');const rawData=atob(base64);return Uint8Array.from([...rawData].map(c=>c.charCodeAt(0)))}
async function registerPushServiceWorker(){if(!('serviceWorker' in navigator))throw new Error('Este navegador no admite Service Worker.');return await navigator.serviceWorker.register('/sw.js',{scope:'/'});}
async function savePushSubscription(sub){if(!sbClient||!sbUser)throw new Error('Inicia sesión antes de activar los avisos.');const json=sub.toJSON();const {error}=await sbClient.from('push_subscriptions').upsert({user_id:sbUser.id,endpoint:json.endpoint,p256dh:json.keys?.p256dh||null,auth:json.keys?.auth||null,expiration_time:json.expirationTime||null,user_agent:navigator.userAgent,updated_at:new Date().toISOString()},{onConflict:'endpoint'});if(error)throw error;}
async function enableWebPush(){
 if(!window.isSecureContext)throw new Error('Los avisos necesitan una conexión segura HTTPS.');
 if(!('serviceWorker' in navigator)||!('PushManager' in window)||!('Notification' in window))throw new Error('Este navegador no ofrece Web Push en este modo. Abre el organizador desde su icono de la pantalla de inicio.');
 if(!sbUser)throw new Error('Inicia sesión primero para asociar los avisos a tu cuenta.');
 const reg=await registerPushServiceWorker();
 const permission=Notification.permission==='granted'?'granted':await Notification.requestPermission();
 if(permission!=='granted')throw new Error('No se ha concedido permiso para las notificaciones. Puedes activarlo después desde Ajustes > Notificaciones.');
 await navigator.serviceWorker.ready;
 let sub=await reg.pushManager.getSubscription();
 if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:urlBase64ToUint8Array(VAPID_PUBLIC_KEY)});
 await savePushSubscription(sub);
 localStorage.setItem('sandra_push_enabled_v1','1');
 sendNotice('Avisos activados ✨','Tu organizador ya puede enviarte recordatorios aunque esté cerrado.','organizer-enabled');
 cloudMsg('¡Avisos activados! Este dispositivo ya está registrado para recibir recordatorios.',false);
}
$('enableNotifs').onclick=async()=>{try{await enableWebPush()}catch(e){cloudMsg(e?.message||'No se pudieron activar los avisos.',true)}};
// Los recordatorios y el resumen diario se gestionan en Supabase Edge Functions.
registerPushServiceWorker().catch(()=>{});
