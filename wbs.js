const STORE = 'teamflow-wbs-v1';
const LEGACY_STORE = 'workload-mgmt-evo-v6-final';
const DAY = 86400000;
const DAY_WIDTH = 42;
const ROW_HEIGHT = 58;
const STATUS = {
  todo: ['未着手','status-todo'], doing: ['進行中','status-doing'], review: ['レビュー','status-review'],
  done: ['完了','status-done'], blocked: ['保留','status-blocked']
};
const MILESTONE_COLORS = ['#ff4fb8','#7158e8','#00b9c2','#ff8a3d','#ef4b67'];
let rangeOffset = 0;
let activeOwner = 'all';
let dragState = null;
let pointerDrag = null;
let dependencyDrag = null;
let state = loadState();

function localDate(date = new Date()) {
  const d = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return d.toISOString().slice(0,10);
}
function addDays(date, count) { const d = new Date(`${date}T00:00:00`); d.setDate(d.getDate()+count); return localDate(d); }
function daysBetween(a,b) { return Math.round((new Date(`${b}T00:00:00`) - new Date(`${a}T00:00:00`))/DAY); }
function jpDate(s) { if(!s) return '—'; const d = new Date(`${s}T00:00:00`); return `${d.getMonth()+1}/${String(d.getDate()).padStart(2,'0')}`; }
function esc(value='') { const e=document.createElement('div'); e.textContent=String(value); return e.innerHTML; }
function uid() { return `${Date.now()}-${Math.random().toString(16).slice(2)}`; }

function sampleState() {
  const today = localDate();
  const members = [
    {id:'m1',name:'佐藤',color:'#7158e8'}, {id:'m2',name:'鈴木',color:'#00b9c2'}, {id:'m3',name:'田中',color:'#ff4fb8'}
  ];
  return {
    members,
    tasks:[
      {id:'t1',title:'企画・要件定義',level:0,owner:'m1',start:addDays(today,-5),end:addDays(today,4),effort:7,progress:65,status:'doing',dependency:'',memo:'利用部門とのレビューを今週中に完了する。'},
      {id:'t2',title:'利用部門ヒアリング',level:1,owner:'m1',start:addDays(today,-5),end:addDays(today,-2),effort:2,progress:100,status:'done',dependency:'',memo:'議事録は共有フォルダに保存済み。'},
      {id:'t3',title:'業務フロー整理',level:2,owner:'m2',start:addDays(today,-1),end:addDays(today,2),effort:3,progress:50,status:'doing',dependency:'t2',memo:'例外フローの確認が残っている。'},
      {id:'t4',title:'要件レビュー・承認',level:1,owner:'m1',start:addDays(today,2),end:addDays(today,4),effort:2,progress:10,status:'review',dependency:'t3',memo:''},
      {id:'t5',title:'設計・制作',level:0,owner:'m2',start:addDays(today,5),end:addDays(today,17),effort:13,progress:15,status:'doing',dependency:'t4',memo:''},
      {id:'t6',title:'UIデザイン',level:1,owner:'m3',start:addDays(today,5),end:addDays(today,10),effort:5,progress:20,status:'doing',dependency:'t4',memo:'蛍光色は情報の優先度表現に限定する。'},
      {id:'t7',title:'画面プロトタイプ',level:2,owner:'m3',start:addDays(today,7),end:addDays(today,10),effort:3,progress:10,status:'doing',dependency:'t6',memo:''},
      {id:'t8',title:'実装・テスト',level:1,owner:'m2',start:addDays(today,11),end:addDays(today,17),effort:8,progress:0,status:'todo',dependency:'t7',memo:''}
    ],
    milestones:[
      {id:'ms1',name:'要件確定',date:addDays(today,4),color:'#ff4fb8'},
      {id:'ms2',name:'デザイン承認',date:addDays(today,10),color:'#7158e8'},
      {id:'ms3',name:'リリース判定',date:addDays(today,17),color:'#00b9c2'}
    ]
  };
}

function migrateLegacy(old) {
  const names = [...new Set(old.map(t=>t.owner).filter(Boolean))];
  const colors = ['#7158e8','#00b9c2','#ff4fb8','#ff8a3d','#3fbf77'];
  const members = names.map((name,i)=>({id:`legacy-m${i}`,name,color:colors[i%colors.length]}));
  let groupSeen = false;
  const tasks = old.map((t,i)=>{
    if(t.isGroup) groupSeen=true;
    const actualHours = Object.values(t.hours||{}).reduce((a,b)=>a+(Number(b)||0),0);
    const progress = Math.max(0,Math.min(100,Number(t.progress)||0));
    return {id:String(t.id||uid()),title:t.title||'名称未設定',level:t.isGroup?0:(groupSeen?1:0),owner:(members.find(m=>m.name===t.owner)||{}).id||'',start:t.start||localDate(),end:t.end||t.start||localDate(),effort:Number(t.est?Number(t.est)/8:actualHours/8)||0,progress,status:progress>=100?'done':progress>0?'doing':'todo',dependency:'',memo:t.memo||''};
  });
  return {members,tasks,milestones:[]};
}

function prepareState(data) {
  delete data.goal;delete data.projectName;delete data.id;
  data.members=Array.isArray(data.members)?data.members:[];data.tasks=Array.isArray(data.tasks)?data.tasks:[];data.milestones=Array.isArray(data.milestones)?data.milestones:[];
  data.layout=data.layout||{sidebarCollapsed:false,compactMode:false,hideCompletedParents:true};
  if(typeof data.layout.hideCompletedParents!=='boolean')data.layout.hideCompletedParents=true;
  return data;
}
function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE));
    if(Array.isArray(saved?.projects)&&saved.projects.length){const active=saved.projects.find(project=>String(project.id)===String(saved.activeProjectId))||saved.projects[0];return prepareState(active)}
    if(saved?.tasks)return prepareState(saved);
    const legacy = JSON.parse(localStorage.getItem(LEGACY_STORE));
    if(Array.isArray(legacy) && legacy.length)return prepareState(migrateLegacy(legacy));
  } catch(e) { console.warn('保存データを読み込めませんでした',e); }
  return prepareState(sampleState());
}
function save(show=false) { localStorage.setItem(STORE,JSON.stringify(state)); if(show)toast('保存しました'); }
function member(id) { return state.members.find(m=>m.id===id) || {name:'未割当',color:'#9aa2b1'}; }
function taskById(id) { return state.tasks.find(t=>String(t.id)===String(id)); }

function normalizedLevels() {
  let last0=false,last1=false;
  state.tasks.forEach(t=>{
    t.level=Math.max(0,Math.min(2,Number(t.level)||0));
    if(t.level===1 && !last0) t.level=0;
    if(t.level===2 && (!last0 || !last1)) t.level=last0?1:0;
    if(t.level===0){last0=true;last1=false} else if(t.level===1){last1=true}
  });
}
function descendants(index) {
  const parent=state.tasks[index], result=[];
  for(let i=index+1;i<state.tasks.length;i++){ if(state.tasks[i].level<=parent.level) break; result.push(state.tasks[i]); }
  return result;
}
function displayTask(t,index) {
  const children=descendants(index).filter(x=>x.level>t.level);
  if(!children.length) return t;
  const leaves=children.filter((x,i,a)=>!a.slice(i+1).some(y=>y.level>x.level));
  const sources=leaves.length?leaves:children;
  const effort=sources.reduce((n,x)=>n+(Number(x.effort)||0),0);
  const weighted=sources.reduce((n,x)=>n+(Number(x.progress)||0)*(Number(x.effort)||1),0);
  const weights=sources.reduce((n,x)=>n+(Number(x.effort)||1),0);
  const progress=weights?Math.round(weighted/weights):0;
  const status=progress>=100?'done':sources.some(x=>x.status==='blocked')?'blocked':progress>0?'doing':'todo';
  return {...t,start:sources.map(x=>x.start).filter(Boolean).sort()[0]||t.start,end:sources.map(x=>x.end).filter(Boolean).sort().at(-1)||t.end,effort,progress,status};
}
function dueClass(t) {
  if(t.status==='done'||Number(t.progress)>=100) return 'complete';
  const diff=daysBetween(localDate(),t.end);
  if(diff<0) return 'danger';
  if(diff<=3) return 'warning';
  return 'planned';
}
function numberTasks() {
  let a=0,b=0,c=0;
  return state.tasks.map(t=>{ if(t.level===0){a++;b=0;c=0;return `${a}`} if(t.level===1){b++;c=0;return `${a}.${b}`} c++;return `${a}.${b}.${c}`; });
}
function visibleIndexes() {
  const query=(document.getElementById('searchInput')?.value||'').trim().toLowerCase();
  const direct=new Set(),hiddenByCompletedParent=new Set();
  if(state.layout.hideCompletedParents){
    state.tasks.forEach((t,i)=>{
      if(t.level!==0||hiddenByCompletedParent.has(i))return;
      const summary=displayTask(t,i);
      if(Number(summary.progress)>=100){for(let j=i;j<subtreeEndIndex(i);j++)hiddenByCompletedParent.add(j)}
    });
  }
  state.tasks.forEach((t,i)=>{
    if(hiddenByCompletedParent.has(i))return;
    const ownerOK=activeOwner==='all'||t.owner===activeOwner;
    const textOK=!query||`${t.title} ${t.memo||''}`.toLowerCase().includes(query);
    if(ownerOK&&textOK) direct.add(i);
  });
  [...direct].forEach(i=>{ let level=state.tasks[i].level; for(let j=i-1;j>=0&&level>0;j--){ if(state.tasks[j].level<level){direct.add(j);level=state.tasks[j].level;} } });
  return [...direct].filter(i=>!hiddenByCompletedParent.has(i)).sort((a,b)=>a-b);
}

function subtreeEndIndex(index){
  const level=state.tasks[index].level;let end=index+1;
  while(end<state.tasks.length&&state.tasks[end].level>level)end++;
  return end;
}
function clearDropIndicators(){document.querySelectorAll('.task-row.drop-before,.task-row.drop-after').forEach(row=>row.classList.remove('drop-before','drop-after'))}
function startTaskDrag(event,index){
  const end=subtreeEndIndex(index);dragState={start:index,end,placement:'before'};
  const row=event.currentTarget.closest('.task-row');
  event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',String(state.tasks[index].id));
  requestAnimationFrame(()=>row?.classList.add('dragging'));
}
function dragOverTask(event,targetIndex){
  if(!dragState||targetIndex>=dragState.start&&targetIndex<dragState.end)return;
  event.preventDefault();event.dataTransfer.dropEffect='move';clearDropIndicators();
  const row=event.currentTarget,placement=event.clientY<row.getBoundingClientRect().top+row.offsetHeight/2?'before':'after';
  dragState.placement=placement;row.classList.add(`drop-${placement}`);
}
function dragLeaveTask(event){if(!event.currentTarget.contains(event.relatedTarget))event.currentTarget.classList.remove('drop-before','drop-after')}
function dropTask(event,targetIndex){
  event.preventDefault();if(!dragState)return;moveTaskBlock(targetIndex,dragState.placement,dragState.start,dragState.end);
}
function moveTaskBlock(targetIndex,placement,start,end){
  if(targetIndex>=start&&targetIndex<end){endTaskDrag();return}
  let insertAt=placement==='before'?targetIndex:subtreeEndIndex(targetIndex);
  const block=state.tasks.splice(start,end-start);if(insertAt>start)insertAt-=block.length;
  insertAt=Math.max(0,Math.min(state.tasks.length,insertAt));state.tasks.splice(insertAt,0,...block);
  normalizedLevels();endTaskDrag();render();toast(block.length>1?`${block[0].title} と配下タスクを移動しました`:`${block[0].title} を移動しました`);
}
function endTaskDrag(){dragState=null;clearDropIndicators();document.querySelectorAll('.task-row.dragging').forEach(row=>row.classList.remove('dragging'))}
function startPointerReorder(event,index){
  if(event.button!==0)return;event.preventDefault();
  pointerDrag={start:index,end:subtreeEndIndex(index),startY:event.clientY,target:null,placement:null,active:false};
  event.currentTarget.closest('.task-row')?.classList.add('dragging');
}
function movePointerReorder(event){
  if(!pointerDrag)return;if(!pointerDrag.active&&Math.abs(event.clientY-pointerDrag.startY)<4)return;pointerDrag.active=true;
  const row=document.elementFromPoint(event.clientX,event.clientY)?.closest('.task-row');clearDropIndicators();if(!row)return;
  const target=state.tasks.findIndex(t=>String(t.id)===String(row.dataset.taskId));if(target<0||target>=pointerDrag.start&&target<pointerDrag.end)return;
  pointerDrag.target=target;pointerDrag.placement=event.clientY<row.getBoundingClientRect().top+row.offsetHeight/2?'before':'after';row.classList.add(`drop-${pointerDrag.placement}`);
}
function finishPointerReorder(){
  if(!pointerDrag)return;const move=pointerDrag;pointerDrag=null;
  if(move.active&&move.target!==null)moveTaskBlock(move.target,move.placement,move.start,move.end);else endTaskDrag();
}

function renderSummary() {
  const leaves=state.tasks.filter((t,i)=>descendants(i).length===0);
  const delayed=leaves.filter(t=>dueClass(t)==='danger').length;
  const soon=leaves.filter(t=>dueClass(t)==='warning').length;
  const done=leaves.filter(t=>t.status==='done'||t.progress>=100).length;
  const effort=leaves.reduce((n,t)=>n+(Number(t.effort)||0),0);
  document.getElementById('summaryCards').innerHTML=[
    ['violet','▦','全タスク',leaves.length,'件'],['orange','◷','期限間近',soon,'件'],['red','!','遅延',delayed,'件'],['green','✓','完了',done,`/ ${leaves.length}件`]
  ].map(x=>`<article class="metric-card"><span class="metric-icon ${x[0]}">${x[1]}</span><div><small>${x[2]}</small><strong>${x[3]}</strong><em>${x[4]}</em></div></article>`).join('');
  document.querySelectorAll('.metric-card')[0].title=`予定工数 合計 ${effort.toFixed(1)}人日`;
}
function renderOwnerTabs() {
  const tabs=[{id:'all',name:'全員',color:'#172033'},...state.members];
  document.getElementById('ownerTabs').innerHTML=tabs.map(m=>{
    const count=m.id==='all'?state.tasks.length:state.tasks.filter(t=>t.owner===m.id).length;
    const avatar=m.id==='all'?'ALL':esc(m.name.slice(0,1));
    return `<button class="owner-tab ${activeOwner===m.id?'active':''}" onclick="setOwner('${m.id}')"><span class="avatar" style="background:${m.color}">${avatar}</span>${esc(m.name)}<b>${count}</b></button>`;
  }).join('');
}
function renderHead(start,totalDays) {
  let html='';
  for(let i=0;i<totalDays;i++){
    const date=addDays(start,i), d=new Date(`${date}T00:00:00`), weekend=d.getDay()===0||d.getDay()===6;
    html+=`<div class="day-head ${weekend?'weekend':''} ${date===localDate()?'today':''}"><span>${['日','月','火','水','木','金','土'][d.getDay()]}</span><strong>${d.getDate()}</strong></div>`;
  }
  document.getElementById('ganttHead').innerHTML=html;
}
function taskRow(t,index,no) {
  const dt=displayTask(t,index), m=member(t.owner), status=STATUS[dt.status]||STATUS.todo, due=dueClass(dt);
  const levelName=['親','子','孫'][t.level];
  const endClass=due==='danger'?'overdue':due==='warning'?'due-soon':'';
  return `<div class="task-row level-${t.level}" data-task-id="${t.id}" ondragover="dragOverTask(event,${index})" ondragleave="dragLeaveTask(event)" ondrop="dropTask(event,${index})">
    <div class="cell task-name" style="--level:${t.level};--task-color:${m.color}"><span class="drag-handle" onpointerdown="startPointerReorder(event,${index})" title="ドラッグして並べ替え">⠿</span><span class="tree-line"></span><div class="task-text"><strong>${esc(t.title)}</strong><small title="${esc(t.overview||'')}">${no} · ${levelName}${t.overview?` · ${esc(t.overview)}`:t.memo?' · メモあり':''}</small></div><span class="level-chip">L${t.level+1}</span></div>
    <div class="cell avatar-cell"><span class="avatar-small" style="background:${m.color}">${esc(m.name.slice(0,1))}</span><span>${esc(m.name)}</span></div>
    <div class="cell"><span class="status-pill ${status[1]}">${status[0]}</span></div>
    <div class="cell date-cell">${jpDate(dt.start)}</div><div class="cell date-cell ${endClass}">${due==='danger'?'! ':due==='warning'?'△ ':''}${jpDate(dt.end)}</div>
    <div class="cell effort">${Number(dt.effort||0).toFixed(1)}日</div>
    <div class="cell"><div class="progress-wrap"><div class="progress-label"><span>${dt.progress}%</span></div><div class="progress-track"><div class="progress-fill" style="width:${dt.progress}%;--task-color:${m.color}"></div></div></div></div>
    <div class="cell"><button class="row-action" onclick="openTask('${t.id}')" title="編集">···</button></div></div>`;
}
function ganttRow(t,index,start,totalDays) {
  const dt=displayTask(t,index), left=daysBetween(start,dt.start)*DAY_WIDTH+4;
  const width=Math.max(12,(daysBetween(dt.start,dt.end)+1)*DAY_WIDTH-8), m=member(t.owner), due=dueClass(dt);
  const visible=left+width>0&&left<totalDays*DAY_WIDTH;
  return `<div class="gantt-row week-pattern" data-task-id="${t.id}">${visible?`<div class="gantt-bar ${due}" data-bar-id="${t.id}" onclick="openTask('${t.id}')" style="left:${left}px;width:${width}px;--bar:${m.color};--progress:${Math.max(0,Math.min(100,dt.progress))}%"><span>${esc(t.title)}</span><button class="dependency-handle" title="ここから後続タスクへドラッグして接続" aria-label="${esc(t.title)}から後続タスクへ接続" onpointerdown="startDependencyDrag(event,'${t.id}')" onclick="event.stopPropagation()"></button></div>`:''}</div>`;
}
function renderMilestoneMarkers(start,totalDays,height) {
  return state.milestones.map((m,i)=>{
    const left=daysBetween(start,m.date)*DAY_WIDTH+DAY_WIDTH/2;
    if(left<0||left>totalDays*DAY_WIDTH)return '';
    const color=m.color||MILESTONE_COLORS[i%MILESTONE_COLORS.length];
    return `<div class="milestone-marker" style="left:${left}px;height:${height}px;--milestone-color:${color}"><span class="milestone-diamond" onclick="openMilestoneModal()"></span><label>${esc(m.name)}</label></div>`;
  }).join('');
}
function drawDependencies(visible,start) {
  const svg=document.getElementById('dependencySvg'), pos=new Map();
  visible.forEach((index,row)=>{
    const t=state.tasks[index],dt=displayTask(t,index), left=daysBetween(start,dt.start)*DAY_WIDTH+4, width=Math.max(12,(daysBetween(dt.start,dt.end)+1)*DAY_WIDTH-8);
    pos.set(String(t.id),{x1:left,x2:left+width,y:row*ROW_HEIGHT+ROW_HEIGHT/2});
  });
  let paths=`<defs><marker id="arrowhead" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 Z" fill="#6654d9"/></marker><marker id="arrowhead-conflict" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 Z" fill="#f08b2f"/></marker></defs>`;
  visible.forEach(index=>{
    const t=state.tasks[index],from=pos.get(String(t.dependency)),to=pos.get(String(t.id)); if(!from||!to)return;
    const direction=to.y>from.y?1:-1,turnY=from.y+direction*ROW_HEIGHT/2,exitX=from.x2+11,entryX=to.x1-12;
    const path=`M ${from.x2} ${from.y} H ${exitX} V ${turnY} H ${entryX} V ${to.y} H ${to.x1-3}`;
    const conflict=to.x1<from.x2,sourceId=esc(String(t.dependency)),targetId=esc(String(t.id));
    const help=conflict?'日程が重複しています。クリックして接続を解除':'クリックして接続を解除';
    paths+=`<path class="dependency-hit" d="${path}" data-source-id="${sourceId}" data-target-id="${targetId}" onpointerenter="highlightDependency(this.dataset.sourceId,this.dataset.targetId,true)" onpointerleave="highlightDependency(this.dataset.sourceId,this.dataset.targetId,false)" onclick="removeDependency(this.dataset.targetId)"><title>${help}</title></path><path class="dependency-line ${conflict?'dependency-conflict':''}" d="${path}"/><circle class="dependency-node ${conflict?'dependency-conflict-node':''}" cx="${from.x2}" cy="${from.y}" r="3.5"/><circle class="dependency-node dependency-target-node ${conflict?'dependency-conflict-node':''}" cx="${to.x1-3}" cy="${to.y}" r="3.5"/>`;
  });
  svg.innerHTML=paths;
}
function highlightDependency(sourceId,targetId,active){
  const source=document.querySelector(`.gantt-bar[data-bar-id="${CSS.escape(String(sourceId))}"]`),target=document.querySelector(`.gantt-bar[data-bar-id="${CSS.escape(String(targetId))}"]`);
  source?.classList.toggle('dependency-related-source',active);target?.classList.toggle('dependency-related-target',active);
}
function removeDependency(targetId){
  const target=taskById(targetId);if(!target||!target.dependency)return;
  const source=taskById(target.dependency),sourceName=source?.title||'先行タスク';
  if(!confirm(`「${sourceName}」→「${target.title}」の接続を解除しますか？`))return;
  target.dependency='';render();toast('タスクの接続を解除しました');
}
function dependencyCreatesCycle(sourceId,targetId){
  let current=taskById(sourceId),guard=0;
  while(current&&current.dependency&&guard++<state.tasks.length){
    if(String(current.dependency)===String(targetId))return true;
    current=taskById(current.dependency);
  }
  return false;
}
function dependencyTargetAt(clientX,clientY,sourceId){
  const bar=document.elementFromPoint(clientX,clientY)?.closest('.gantt-bar');
  if(!bar)return null;
  const targetId=bar.dataset.barId;
  if(String(targetId)===String(sourceId)||dependencyCreatesCycle(sourceId,targetId))return null;
  return bar;
}
function drawDependencyDraft(event,targetBar){
  const svg=document.getElementById('dependencySvg'),pane=document.getElementById('ganttPane'),sourceBar=document.querySelector(`.gantt-bar[data-bar-id="${CSS.escape(String(dependencyDrag.sourceId))}"]`);
  if(!svg||!pane||!sourceBar)return;
  svg.querySelector('.dependency-draft')?.remove();
  const paneRect=pane.getBoundingClientRect(),sourceRect=sourceBar.getBoundingClientRect();
  const x1=sourceRect.right-paneRect.left,y1=sourceRect.top-paneRect.top+sourceRect.height/2;
  let x2=event.clientX-paneRect.left,y2=event.clientY-paneRect.top;
  if(targetBar){const rect=targetBar.getBoundingClientRect();x2=rect.left-paneRect.left-3;y2=rect.top-paneRect.top+rect.height/2}
  const bend=Math.max(x1+12,Math.min(x2-12,(x1+x2)/2));
  const path=document.createElementNS('http://www.w3.org/2000/svg','path');
  path.setAttribute('class','dependency-line dependency-draft');path.setAttribute('d',`M ${x1} ${y1} L ${bend} ${y1} L ${bend} ${y2} L ${x2} ${y2}`);svg.appendChild(path);
}
function moveDependencyDrag(event){
  if(!dependencyDrag||event.pointerId!==dependencyDrag.pointerId)return;
  event.preventDefault();document.querySelectorAll('.gantt-bar.dependency-target').forEach(x=>x.classList.remove('dependency-target'));
  const targetBar=dependencyTargetAt(event.clientX,event.clientY,dependencyDrag.sourceId);
  dependencyDrag.targetId=targetBar?.dataset.barId||null;targetBar?.classList.add('dependency-target');drawDependencyDraft(event,targetBar);
}
function finishDependencyDrag(event,cancelled=false){
  if(!dependencyDrag||event.pointerId!==dependencyDrag.pointerId)return;
  const {sourceId,targetId}=dependencyDrag;dependencyDrag=null;document.body.classList.remove('dependency-linking');
  document.querySelectorAll('.gantt-bar.dependency-source,.gantt-bar.dependency-target').forEach(x=>x.classList.remove('dependency-source','dependency-target'));
  document.querySelector('.dependency-draft')?.remove();
  if(cancelled||!targetId)return;
  const target=taskById(targetId);if(!target)return;
  target.dependency=sourceId;render();toast(`「${taskById(sourceId)?.title||'先行タスク'}」→「${target.title}」を接続しました`);
}
function startDependencyDrag(event,sourceId){
  if(event.button!==0)return;
  event.preventDefault();event.stopPropagation();
  dependencyDrag={sourceId,pointerId:event.pointerId,targetId:null};document.body.classList.add('dependency-linking');
  event.currentTarget.setPointerCapture(event.pointerId);event.currentTarget.closest('.gantt-bar')?.classList.add('dependency-source');
  event.currentTarget.addEventListener('pointermove',moveDependencyDrag);
  event.currentTarget.addEventListener('pointerup',finishDependencyDrag,{once:true});
  event.currentTarget.addEventListener('pointercancel',event=>finishDependencyDrag(event,true),{once:true});
  drawDependencyDraft(event,null);
}
function render() {
  normalizedLevels();
  renderSummary(); renderOwnerTabs();
  const visible=visibleIndexes(), nos=numberTasks(), today=localDate(), start=addDays(today,-7+rangeOffset), totalDays=42;
  renderHead(start,totalDays);
  document.getElementById('visibleCount').textContent=`${visible.length}行`;
  document.getElementById('taskPane').innerHTML=visible.length?visible.map(i=>taskRow(state.tasks[i],i,nos[i])).join(''):`<div class="empty-state"><div><strong>表示するタスクがありません</strong><br><small>検索条件を変更するか、タスクを追加してください</small></div></div>`;
  const pane=document.getElementById('ganttPane'),height=Math.max(visible.length*ROW_HEIGHT,220);
  pane.style.height=`${height}px`;
  pane.innerHTML=visible.map(i=>ganttRow(state.tasks[i],i,start,totalDays)).join('')+renderMilestoneMarkers(start,totalDays,height)+`<div class="today-column" style="left:${daysBetween(start,today)*DAY_WIDTH+DAY_WIDTH/2}px;height:${height}px"></div><svg id="dependencySvg" aria-label="タスク依存関係" style="height:${height}px"></svg>`;
  drawDependencies(visible,start); save();
}

function setOwner(id){activeOwner=id;render()}
function shiftRange(days){rangeOffset+=days;render()}
function resetRange(){rangeOffset=0;render();jumpToday()}
function jumpToday(){ const sc=document.getElementById('tableScroll'); sc.scrollLeft=Math.max(0,7*DAY_WIDTH-210); }
function applyLayoutSettings(){
  document.body.classList.toggle('sidebar-collapsed',Boolean(state.layout.sidebarCollapsed));
  document.body.classList.toggle('compact-mode',Boolean(state.layout.compactMode));
  const button=document.getElementById('focusModeButton');
  if(button)button.textContent=state.layout.compactMode?'↙ 通常表示':'⛶ 集中表示';
  const completedToggle=document.getElementById('hideCompletedParents');
  if(completedToggle)completedToggle.checked=state.layout.hideCompletedParents;
}
function toggleSidebar(){state.layout.sidebarCollapsed=!state.layout.sidebarCollapsed;applyLayoutSettings();save()}
function toggleCompactMode(){state.layout.compactMode=!state.layout.compactMode;applyLayoutSettings();save();setTimeout(jumpToday,30)}
function toggleCompletedParents(){state.layout.hideCompletedParents=document.getElementById('hideCompletedParents').checked;save();render()}
function openModal(id){document.getElementById(id).classList.add('open')}
function closeModal(id){document.getElementById(id).classList.remove('open')}
function populateTaskSelects(currentId='') {
  document.getElementById('editOwner').innerHTML=`<option value="">未割当</option>`+state.members.map(m=>`<option value="${m.id}">${esc(m.name)}</option>`).join('');
  document.getElementById('editDependency').innerHTML=`<option value="">なし</option>`+state.tasks.filter(t=>String(t.id)!==String(currentId)).map(t=>`<option value="${t.id}">${esc(t.title)}</option>`).join('');
}
function addTask(){
  const today=localDate(); populateTaskSelects();
  document.getElementById('taskModalTitle').textContent='タスクを追加';document.getElementById('editId').value='';document.getElementById('editTitle').value='';document.getElementById('editOverview').value='';
  document.getElementById('editLevel').value=state.tasks.length?Math.min(2,state.tasks.at(-1).level+1):0;document.getElementById('editOwner').value=activeOwner==='all'?'':activeOwner;
  document.getElementById('editStart').value=today;document.getElementById('editEnd').value=addDays(today,3);document.getElementById('editEffort').value='1';document.getElementById('editProgress').value='0';document.getElementById('editStatus').value='todo';document.getElementById('editDependency').value='';document.getElementById('editMemo').value='';document.getElementById('editPurpose').value='';document.getElementById('editDeliverable').value='';document.getElementById('editIssue').value='';document.getElementById('editDelayRisk').checked=false;document.getElementById('editAdvanceShared').checked=false;document.getElementById('editDeadlineAdjusted').checked=false;document.getElementById('deleteTaskButton').style.visibility='hidden';openModal('taskModal');document.getElementById('editTitle').focus();
  document.getElementById('editProgress').disabled=false;document.getElementById('editStatus').disabled=false;document.getElementById('progressEditNote').textContent='このタスクのみ更新';
}
function openTask(id){
  const t=taskById(id); if(!t)return; populateTaskSelects(id);
  document.getElementById('taskModalTitle').textContent='タスクを編集';document.getElementById('editId').value=t.id;document.getElementById('editTitle').value=t.title;document.getElementById('editOverview').value=t.overview||'';document.getElementById('editLevel').value=t.level;document.getElementById('editOwner').value=t.owner||'';document.getElementById('editStart').value=t.start;document.getElementById('editEnd').value=t.end;document.getElementById('editEffort').value=t.effort;document.getElementById('editProgress').value=t.progress;document.getElementById('editStatus').value=t.status;document.getElementById('editDependency').value=t.dependency||'';document.getElementById('editMemo').value=t.memo||'';document.getElementById('editPurpose').value=t.purpose||'';document.getElementById('editDeliverable').value=t.deliverable||'';document.getElementById('editIssue').value=t.issue||'';document.getElementById('editDelayRisk').checked=Boolean(t.delayRisk);document.getElementById('editAdvanceShared').checked=Boolean(t.advanceShared);document.getElementById('editDeadlineAdjusted').checked=Boolean(t.deadlineAdjusted);document.getElementById('deleteTaskButton').style.visibility='visible';openModal('taskModal');
  const index=state.tasks.findIndex(x=>String(x.id)===String(id)),summary=displayTask(t,index),isSummary=descendants(index).length>0;
  document.getElementById('editProgress').value=summary.progress;document.getElementById('editStatus').value=summary.status;
  document.getElementById('editProgress').disabled=isSummary;document.getElementById('editStatus').disabled=isSummary;
  document.getElementById('progressEditNote').textContent=isSummary?'配下タスクから自動集計':'このタスクのみ更新';
}
function syncProgressStatus(source){
  const progress=document.getElementById('editProgress'),status=document.getElementById('editStatus');
  if(source==='status'&&status.value==='done'){progress.value=100;return}
  const value=Math.max(0,Math.min(100,Number(progress.value)||0));progress.value=value;
  if(value>=100)status.value='done';else if(source==='progress'&&status.value==='done')status.value=value===0?'todo':'doing';
}
function saveTask(event){
  event.preventDefault(); const id=document.getElementById('editId').value, start=document.getElementById('editStart').value,end=document.getElementById('editEnd').value;
  if(end<start){toast('期限は開始日以降にしてください');return}
  const data={title:document.getElementById('editTitle').value.trim(),overview:document.getElementById('editOverview').value.trim(),level:Number(document.getElementById('editLevel').value),owner:document.getElementById('editOwner').value,start,end,effort:Number(document.getElementById('editEffort').value),progress:Number(document.getElementById('editProgress').value),status:document.getElementById('editStatus').value,dependency:document.getElementById('editDependency').value,memo:document.getElementById('editMemo').value.trim(),purpose:document.getElementById('editPurpose').value.trim(),deliverable:document.getElementById('editDeliverable').value.trim(),issue:document.getElementById('editIssue').value.trim(),delayRisk:document.getElementById('editDelayRisk').checked,advanceShared:document.getElementById('editAdvanceShared').checked,deadlineAdjusted:document.getElementById('editDeadlineAdjusted').checked};
  const editIndex=id?state.tasks.findIndex(t=>String(t.id)===String(id)):-1;
  const isSummary=editIndex>=0&&descendants(editIndex).length>0;
  if(isSummary){data.progress=state.tasks[editIndex].progress;data.status=state.tasks[editIndex].status}
  else if(data.status==='done'||data.progress>=100){data.progress=100;data.status='done'}
  if(id){
    Object.assign(state.tasks[editIndex],data);
  }else state.tasks.push({id:uid(),...data});
  normalizedLevels();closeModal('taskModal');render();toast(id?'タスクを更新しました':'タスクを追加しました');
}
function deleteCurrentTask(){
  const id=document.getElementById('editId').value,index=state.tasks.findIndex(x=>String(x.id)===String(id));
  if(index<0)return;
  const task=state.tasks[index],end=subtreeEndIndex(index),targets=state.tasks.slice(index,end);
  const childCount=targets.length-1;
  const message=childCount?`「${task.title}」と配下のタスク ${childCount}件を削除しますか？`:`「${task.title}」を削除しますか？`;
  if(!confirm(message))return;
  const deletedIds=new Set(targets.map(x=>String(x.id)));
  state.tasks.splice(index,targets.length);
  state.tasks.forEach(x=>{if(deletedIds.has(String(x.dependency)))x.dependency=''});
  closeModal('taskModal');render();toast(childCount?`タスクを配下 ${childCount}件と一緒に削除しました`:'タスクを削除しました');
}

function openMilestoneModal(){document.getElementById('milestoneDate').value=addDays(localDate(),7);renderMilestones();openModal('milestoneModal')}
function renderMilestones(){document.getElementById('milestoneList').innerHTML=state.milestones.length?state.milestones.slice().sort((a,b)=>a.date.localeCompare(b.date)).map((m,i)=>`<div class="milestone-item"><span class="milestone-gem" style="background:${m.color||MILESTONE_COLORS[i%MILESTONE_COLORS.length]}"></span><div class="item-grow"><strong>${esc(m.name)}</strong><small>${m.date.replaceAll('-',' / ')}</small></div><button class="tiny-delete" onclick="deleteMilestone('${m.id}')">削除</button></div>`).join(''):`<div class="empty-state" style="height:120px">マイルストーンはまだありません</div>`}
function addMilestone(){const name=document.getElementById('milestoneName').value.trim(),date=document.getElementById('milestoneDate').value;if(!name||!date){toast('名前と日付を入力してください');return}state.milestones.push({id:uid(),name,date,color:MILESTONE_COLORS[state.milestones.length%MILESTONE_COLORS.length]});document.getElementById('milestoneName').value='';renderMilestones();render();toast('マイルストーンを追加しました')}
function deleteMilestone(id){state.milestones=state.milestones.filter(m=>String(m.id)!==String(id));renderMilestones();render()}
function openTeamModal(){renderTeam();openModal('teamModal')}
function renderTeam(){document.getElementById('teamList').innerHTML=state.members.map(m=>`<div class="team-item"><span class="avatar-small" style="background:${m.color}">${esc(m.name.slice(0,1))}</span><div class="item-grow"><strong>${esc(m.name)}</strong><small>${state.tasks.filter(t=>t.owner===m.id).length}タスクを担当</small></div><button class="tiny-delete" onclick="deleteMember('${m.id}')">削除</button></div>`).join('')}
function addMember(){const input=document.getElementById('memberName'),name=input.value.trim();if(!name)return;state.members.push({id:uid(),name,color:document.getElementById('memberColor').value});input.value='';renderTeam();render();toast('担当者を追加しました')}
function deleteMember(id){const m=member(id);if(!confirm(`${m.name}さんを担当者一覧から削除しますか？\n担当タスクは「未割当」になります。`))return;state.members=state.members.filter(x=>x.id!==id);state.tasks.forEach(t=>{if(t.owner===id)t.owner=''});if(activeOwner===id)activeOwner='all';renderTeam();render()}

const REPORT_STATUS={todo:'未',doing:'中',review:'確認',done:'済',blocked:'保留'};
function reportDate(value){
  if(!value)return '--/--';
  const date=new Date(`${value}T00:00:00`);
  if(Number.isNaN(date.getTime()))return '--/--';
  return `${String(date.getMonth()+1).padStart(2,'0')}/${String(date.getDate()).padStart(2,'0')}`;
}
function reportLine(value){return String(value||'').replace(/\r?\n/g,' ').trim()}
function reportIndexes(ownerId){
  const included=new Set();
  for(let parentIndex=0;parentIndex<state.tasks.length;parentIndex++){
    const parentTask=state.tasks[parentIndex];if(parentTask.level!==0)continue;
    const end=subtreeEndIndex(parentIndex),parent=displayTask(parentTask,parentIndex);
    if(Number(parent.progress)>=100||parent.status==='done'){parentIndex=end-1;continue}
    if(ownerId==='all')for(let i=parentIndex;i<end;i++)included.add(i);
    else{
      for(let i=parentIndex;i<end;i++){
        const taskOwner=state.tasks[i].owner||'__unassigned__';
        if(String(taskOwner)!==String(ownerId))continue;
        included.add(i);let level=state.tasks[i].level;
        for(let j=i-1;j>=parentIndex&&level>0;j--)if(state.tasks[j].level<level){included.add(j);level=state.tasks[j].level}
      }
    }
    parentIndex=end-1;
  }
  return [...included].sort((a,b)=>a-b);
}
function buildCustomerReport(ownerId='all'){
  const lines=[],indexes=reportIndexes(ownerId);
  const parentCount=indexes.filter(index=>state.tasks[index].level===0).length;
  indexes.forEach(index=>{
    const task=state.tasks[index];
    const shown=displayTask(task,index);
    const title=reportLine(task.title)||'名称未設定';
    const status=REPORT_STATUS[shown.status]||REPORT_STATUS.todo;
    lines.push(`${'#'.repeat(Math.min(3,Number(task.level)+1))} ${title} [${status}] ${reportDate(shown.start)} - ${reportDate(shown.end)}`,'');
    const memoLines=String(task.memo||'').split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
    memoLines.forEach(line=>lines.push(`- ${line}`));
    if(memoLines.length)lines.push('');
  });
  if(!parentCount)lines.push('# 対応中の親タスクはありません','');
  return {text:`${lines.join('\r\n').trimEnd()}\r\n`,parentCount,taskCount:indexes.length};
}
function updateCustomerReportPreview(){
  const ownerId=document.getElementById('reportOwner').value||'all',report=buildCustomerReport(ownerId);
  document.getElementById('customerReportPreview').value=report.text;
  document.getElementById('reportTaskCount').textContent=`未完了の親 ${report.parentCount}件 / 出力タスク ${report.taskCount}件`;
}
function openCustomerReport(){
  const select=document.getElementById('reportOwner'),current=select.value;
  const unassigned=state.tasks.some(t=>!t.owner)?'<option value="__unassigned__">未割当</option>':'';
  select.innerHTML=`<option value="all">全担当者</option>${state.members.map(m=>`<option value="${esc(String(m.id))}">${esc(m.name)}</option>`).join('')}${unassigned}`;
  const currentExists=current==='all'||current==='__unassigned__'||state.members.some(m=>String(m.id)===String(current));
  select.value=currentExists?current:(activeOwner!=='all'?activeOwner:state.members[0]?.id||'all');
  updateCustomerReportPreview();
  openModal('customerReportModal');
}
function downloadCustomerReport(){
  const ownerId=document.getElementById('reportOwner').value||'all',report=buildCustomerReport(ownerId),ownerName=ownerId==='all'?'全担当者':ownerId==='__unassigned__'?'未割当':member(ownerId).name;
  const safeOwner=String(ownerName).replace(/[\\/:*?"<>|]/g,'_');
  const blob=new Blob(['\uFEFF',report.text],{type:'text/plain;charset=utf-8'}),a=document.createElement('a');
  a.href=URL.createObjectURL(blob);a.download=`${safeOwner}_進捗レポート_${localDate().replaceAll('-','')}.txt`;a.click();URL.revokeObjectURL(a.href);
  updateCustomerReportPreview();toast(`${ownerName}のレポートを書き出しました`);
}
function exportData(){const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`teamflow-backup-${localDate()}.json`;a.click();URL.revokeObjectURL(a.href);toast('バックアップを書き出しました')}
function importData(event){const file=event.target.files[0];if(!file)return;const reader=new FileReader();reader.onload=()=>{try{const data=JSON.parse(reader.result);if(!Array.isArray(data.tasks))throw new Error();state=prepareState(data);activeOwner='all';applyLayoutSettings();render();toast('データを復元しました')}catch(e){toast('読み込めるJSON形式ではありません')}};reader.readAsText(file);event.target.value=''}
let toastTimer;function toast(message){const el=document.getElementById('toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2200)}
document.addEventListener('keydown',e=>{if(e.key==='Escape')document.querySelectorAll('.modal-backdrop.open').forEach(x=>x.classList.remove('open'))});
document.addEventListener('pointermove',movePointerReorder);
document.addEventListener('pointerup',finishPointerReorder);
document.addEventListener('pointercancel',finishPointerReorder);
document.querySelectorAll('.modal-backdrop').forEach(x=>x.addEventListener('mousedown',e=>{if(e.target===x)x.classList.remove('open')}));
applyLayoutSettings();render();setTimeout(jumpToday,30);
