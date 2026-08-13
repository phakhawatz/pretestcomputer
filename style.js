
    /* ================= SweetAlert theming ================= */
const MySwal = Swal.mixin({
  customClass:{popup:'app-swal-popup',confirmButton:'app-swal-confirm',cancelButton:'app-swal-cancel'},
  buttonsStyling:false
});

/* ================= Firebase Realtime Database layer ================= */
const firebaseConfig = {
  databaseURL: "https://pretest-4847d-default-rtdb.asia-southeast1.firebasedatabase.app/"
};
firebase.initializeApp(firebaseConfig);
const fbDb = firebase.database();
const SETS_PATH = 'examSets';
const HISTORY_PATH = 'examHistory';

function blobToBase64(blob){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(reader.result); // data:application/pdf;base64,....
    reader.onerror=reject;
    reader.readAsDataURL(blob);
  });
}
function base64ToUint8Array(dataUrl){
  const base64 = dataUrl.split(',')[1] || dataUrl;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++) bytes[i]=binary.charCodeAt(i);
  return bytes;
}

async function dbGetAll(){
  const snap = await fbDb.ref(SETS_PATH).once('value');
  const val = snap.val() || {};
  return Object.values(val);
}
async function dbPut(obj){
  await fbDb.ref(SETS_PATH+'/'+obj.id).set(obj);
}
async function dbDelete(id){
  await fbDb.ref(SETS_PATH+'/'+id).remove();
}

/* ================= App state ================= */
let examSets=[];
let student={name:'',className:''};
let currentSet=null;
let answers=[];
let editingSetId=null;

async function loadExamSets(){
  try{
    examSets = await dbGetAll();
  }catch(err){
    console.error(err);
    examSets = [];
  }
}

function escapeHtml(str){
  return String(str).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

function showView(id){
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

/* ================= Login ================= */
document.getElementById('loginForm').addEventListener('submit', e=>{
  e.preventDefault();
  const fn=document.getElementById('firstName').value.trim();
  const ln=document.getElementById('lastName').value.trim();
  const cls=document.getElementById('classInput').value.trim();
  if(!fn||!ln||!cls){
    MySwal.fire({icon:'error',title:'กรอกข้อมูลไม่ครบ',text:'กรุณากรอกชื่อ นามสกุล และชั้นให้ครบถ้วน'});
    return;
  }
  student={name:fn+' '+ln, className:cls};
  document.getElementById('examCodeInput').value='';
  document.getElementById('examPassInput').value='';
  showView('view-select');
});

/* ================= Select / exam gate ================= */
document.getElementById('selectForm').addEventListener('submit', async e=>{
  e.preventDefault();
  const code=document.getElementById('examCodeInput').value.trim();
  const pass=document.getElementById('examPassInput').value.trim();
  let sets;
  try{
    sets = await dbGetAll();
  }catch(err){
    console.error(err);
    MySwal.fire({icon:'error',title:'โหลดข้อมูลไม่สำเร็จ',text:'เบราว์เซอร์นี้อาจไม่รองรับ ลองเปิดผ่านเว็บเซิร์ฟเวอร์ (http/https)'});
    return;
  }
  examSets = sets;
  const set=examSets.find(s=>s.code.toLowerCase()===code.toLowerCase());
  if(!set){
    MySwal.fire({icon:'error',title:'ไม่พบชุดข้อสอบ',text:'กรุณาติดต่อครูภควรรษ รัตนภานพ'});
    return;
  }
  const correctPassword = set.password || '1234'; // fallback for sets created before password field existed
  if(pass !== correctPassword){
    MySwal.fire({icon:'error',title:'รหัสผ่านไม่ถูกต้อง',text:'กรุณาติดต่อครูภควรรษ รัตนภานพ'});
    return;
  }
  currentSet=set;
  answers=new Array(set.numQuestions).fill(null);
  await MySwal.fire({icon:'success',title:'เข้าสู่ระบบสำเร็จ',text:'ชุดข้อสอบ: '+set.name,timer:1200,showConfirmButton:false});
  startExam();
});

/* ================= Exam view ================= */
async function startExam(){
  document.getElementById('examStudentName').textContent=student.name;
  document.getElementById('examStudentClass').textContent='ชั้น '+student.className;
  document.getElementById('examAvatar').textContent=(student.name||'-').trim().charAt(0).toUpperCase();
  document.getElementById('examSetName').textContent=currentSet.name;
  showView('view-exam');
  renderAnswerSheet();
  if(currentSet.pdfBase64){
    document.getElementById('pdfEmptyMsg').style.display='none';
    document.getElementById('pdfCanvas').style.display='block';
    await loadPdfIntoViewer(currentSet.pdfBase64);
  } else {
    document.getElementById('pdfEmptyMsg').style.display='block';
    document.getElementById('pdfCanvas').style.display='none';
  }
}

function renderAnswerSheet(){
  const container=document.getElementById('answerList');
  container.innerHTML='';
  currentSet.questions.forEach((q,idx)=>{
    const row=document.createElement('div');
    row.className='answer-row';
    row.innerHTML=`
      <div class="answer-row-head">
        <span class="status-circle unanswered" id="status-${idx}"></span>
        <span class="q-number">ข้อที่ ${idx+1}</span>
      </div>
      <div class="answer-options" id="opts-${idx}"></div>
    `;
    container.appendChild(row);
    const opts=row.querySelector(`#opts-${idx}`);
    if(q.type==='choice'){
      ['ก','ข','ค','ง'].forEach(letter=>{
        const btn=document.createElement('button');
        btn.type='button';
        btn.className='choice-btn';
        btn.textContent=letter;
        btn.onclick=()=>{ answers[idx]=letter; updateAnswerUI(); };
        opts.appendChild(btn);
      });
    } else {
      opts.classList.add('fill-mode');
      const input=document.createElement('input');
      input.type='text';
      input.className='fill-input';
      input.placeholder='พิมพ์คำตอบ...';
      input.oninput=(e)=>{
        const v=e.target.value;
        answers[idx]= v.trim()===''? null : v;
        updateAnswerUI();
      };
      opts.appendChild(input);
    }
  });
  updateAnswerUI();
}

function updateAnswerUI(){
  currentSet.questions.forEach((q,idx)=>{
    const answered= answers[idx]!==null && answers[idx]!==undefined && String(answers[idx]).trim()!=='';
    const circle=document.getElementById(`status-${idx}`);
    circle.className='status-circle '+(answered?'answered':'unanswered');
    if(q.type==='choice'){
      const opts=document.getElementById(`opts-${idx}`);
      [...opts.children].forEach(btn=>{
        btn.classList.toggle('selected', btn.textContent===answers[idx]);
      });
    }
  });
  updateProgress();
}

function updateProgress(){
  const total=currentSet.questions.length;
  const done=answers.filter(a=>a!==null && a!==undefined && String(a).trim()!=='').length;
  document.getElementById('progressText').textContent=`ตอบแล้ว ${done}/${total} ข้อ`;
  document.getElementById('progressBarFill').style.width=(total? (done/total*100):0)+'%';
}

function handleSubmit(){
  const unanswered=[];
  answers.forEach((a,idx)=>{
    if(a===null||a===undefined||String(a).trim()==='') unanswered.push(idx+1);
  });
  if(unanswered.length>0){
    MySwal.fire({
      icon:'warning',
      title:'ยังตอบไม่ครบ!',
      html:`กรุณาตอบให้ครบทุกข้อก่อนส่งคำตอบ<br>เหลืออีก <b>${unanswered.length}</b> ข้อ<br><span style="font-size:12.5px;color:#94a3b8;">ข้อ ${unanswered.join(', ')}</span>`
    });
    return;
  }
  MySwal.fire({
    title:'ยืนยันการส่งคำตอบ?',
    text:'เมื่อส่งแล้วจะไม่สามารถแก้ไขคำตอบได้อีก',
    icon:'question',
    showCancelButton:true,
    confirmButtonText:'ส่งคำตอบ',
    cancelButtonText:'ยกเลิก'
  }).then(res=>{
    if(res.isConfirmed) gradeAndShowResult();
  });
}

async function gradeAndShowResult(){
  let correct=0;
  const total=currentSet.questions.length;
  currentSet.questions.forEach((q,idx)=>{
    const ans=answers[idx];
    if(q.type==='choice'){
      if(ans===q.answer) correct++;
    } else {
      if(String(ans).trim().toLowerCase()===String(q.answer).trim().toLowerCase()) correct++;
    }
  });
  const percent= total? Math.round(correct/total*100) : 0;
  const pass= percent>=50;
  try{
    await addHistoryRecord({
      id:'h_'+Date.now(),
      name:student.name,
      className:student.className,
      examName:currentSet.name,
      examCode:currentSet.code,
      date:new Date().toISOString(),
      score:correct,
      total,
      percent
    });
  }catch(err){
    console.error('บันทึกประวัติไม่สำเร็จ:', err);
  }
  MySwal.fire({
    title: pass? 'ยินดีด้วย! สอบผ่าน' : 'ส่งคำตอบเรียบร้อย',
    html:`
      <div style="text-align:center;">
        <p style="font-size:15px;margin:2px 0;color:#475569;">${escapeHtml(student.name)} · ชั้น ${escapeHtml(student.className)}</p>
        <div style="font-size:46px;font-weight:700;color:${pass?'#2563eb':'#ef4444'};margin:14px 0 4px;">${correct}/${total}</div>
        <p style="font-size:16px;color:#475569;">คิดเป็น ${percent}%</p>
      </div>
    `,
    icon: pass?'success':'error',
    confirmButtonText:'เสร็จสิ้น',
    allowOutsideClick:false
  }).then(()=>{ resetToLogin(); });
}

function resetToLogin(){
  currentSet=null; answers=[]; student={name:'',className:''};
  document.getElementById('loginForm').reset();
  document.getElementById('selectForm').reset();
  pdfDoc=null;
  showView('view-login');
}

/* ================= PDF viewer ================= */
pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
let pdfDoc=null, pdfPageNum=1, pdfScale=1.6;

async function loadPdfIntoViewer(pdfBase64){
  try{
    const bytes=base64ToUint8Array(pdfBase64);
    pdfDoc=await pdfjsLib.getDocument({data:bytes}).promise;
    pdfPageNum=1;
    // auto-fit width to the viewer pane so text reads closer/larger by default
    const page=await pdfDoc.getPage(1);
    const baseViewport=page.getViewport({scale:1});
    const paneWidth=document.querySelector('.pdf-scroll').clientWidth - 40; // minus padding
    pdfScale=Math.max(1, paneWidth / baseViewport.width);
    renderPdfPage();
  }catch(err){
    console.error(err);
    document.getElementById('pdfEmptyMsg').textContent='ไม่สามารถโหลดไฟล์ PDF ได้';
    document.getElementById('pdfEmptyMsg').style.display='block';
  }
}
async function renderPdfPage(){
  if(!pdfDoc) return;
  const page=await pdfDoc.getPage(pdfPageNum);
  const viewport=page.getViewport({scale:pdfScale});
  const dpr=window.devicePixelRatio || 1;
  const canvas=document.getElementById('pdfCanvas');
  canvas.width=Math.floor(viewport.width*dpr);
  canvas.height=Math.floor(viewport.height*dpr);
  canvas.style.width=viewport.width+'px';
  canvas.style.height=viewport.height+'px';
  const ctx=canvas.getContext('2d');
  ctx.setTransform(dpr,0,0,dpr,0,0);
  await page.render({canvasContext:ctx, viewport}).promise;
  document.getElementById('pdfPageInfo').textContent=`หน้า ${pdfPageNum} / ${pdfDoc.numPages}`;
}
function pdfPrevPage(){ if(pdfDoc && pdfPageNum>1){ pdfPageNum--; renderPdfPage(); } }
function pdfNextPage(){ if(pdfDoc && pdfPageNum<pdfDoc.numPages){ pdfPageNum++; renderPdfPage(); } }
function pdfZoom(delta){ if(!pdfDoc) return; pdfScale=Math.min(4, Math.max(0.5, pdfScale+delta)); renderPdfPage(); }

/* ================= Exam history (Firebase Realtime Database) ================= */
async function loadHistory(){
  try{
    const snap = await fbDb.ref(HISTORY_PATH).once('value');
    const val = snap.val() || {};
    return Object.values(val).sort((a,b)=> new Date(b.date) - new Date(a.date));
  }catch(err){
    console.error(err);
    return [];
  }
}
async function addHistoryRecord(rec){
  await fbDb.ref(HISTORY_PATH+'/'+rec.id).set(rec);
}
function formatHistoryDate(iso){
  const d=new Date(iso);
  const datePart=d.toLocaleDateString('th-TH',{year:'numeric',month:'short',day:'numeric'});
  const timePart=d.toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'});
  return `${datePart} ${timePart}`;
}
function switchAdminTab(tab){
  const setsPanel=document.getElementById('adminSetsPanel');
  const historyPanel=document.getElementById('adminHistoryPanel');
  const tabSets=document.getElementById('tabBtnSets');
  const tabHistory=document.getElementById('tabBtnHistory');
  if(tab==='history'){
    setsPanel.style.display='none'; historyPanel.style.display='block';
    tabHistory.classList.add('active'); tabSets.classList.remove('active');
    renderHistoryList();
  } else {
    setsPanel.style.display='block'; historyPanel.style.display='none';
    tabSets.classList.add('active'); tabHistory.classList.remove('active');
  }
}
async function renderHistoryList(){
  const container=document.getElementById('adminHistoryList');
  container.innerHTML=`<p class="empty-hint">กำลังโหลดข้อมูล...</p>`;
  const list=await loadHistory();
  document.getElementById('historyCount').textContent=`ทั้งหมด ${list.length} รายการ`;
  if(list.length===0){
    container.innerHTML=`<p class="empty-hint">ยังไม่มีประวัติการสอบ</p>`;
    return;
  }
  container.innerHTML=`
    <div class="history-table-wrap">
      <table class="history-table">
        <thead>
          <tr>
            <th>ชื่อ-นามสกุล</th><th>ชั้น</th><th>ชุดข้อสอบ</th><th>วันที่สอบ</th><th>คะแนน</th><th>%</th><th></th>
          </tr>
        </thead>
        <tbody>
          ${list.map(r=>`
            <tr>
              <td>${escapeHtml(r.name)}</td>
              <td>${escapeHtml(r.className)}</td>
              <td>${escapeHtml(r.examName)}${r.examCode? ' ('+escapeHtml(r.examCode)+')':''}</td>
              <td>${formatHistoryDate(r.date)}</td>
              <td>${r.score}/${r.total}</td>
              <td><span class="pct-badge ${r.percent>=50?'pass':'fail'}">${r.percent}%</span></td>
              <td><button class="btn-ghost" onclick="deleteHistoryRecord('${r.id}')">ลบ</button></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}
function deleteHistoryRecord(id){
  MySwal.fire({
    icon:'warning', title:'ลบรายการนี้?', showCancelButton:true,
    confirmButtonText:'ลบ', cancelButtonText:'ยกเลิก'
  }).then(async res=>{
    if(res.isConfirmed){
      try{
        await fbDb.ref(HISTORY_PATH+'/'+id).remove();
      }catch(err){
        console.error(err);
        MySwal.fire({icon:'error',title:'ลบไม่สำเร็จ',text:'ไม่สามารถเชื่อมต่อได้'});
        return;
      }
      renderHistoryList();
    }
  });
}
function clearAllHistory(){
  MySwal.fire({
    icon:'warning', title:'ล้างประวัติทั้งหมด?', text:'การลบไม่สามารถย้อนกลับได้',
    showCancelButton:true, confirmButtonText:'ล้างทั้งหมด', cancelButtonText:'ยกเลิก'
  }).then(async res=>{
    if(res.isConfirmed){
      try{
        await fbDb.ref(HISTORY_PATH).remove();
      }catch(err){
        console.error(err);
        MySwal.fire({icon:'error',title:'ล้างประวัติไม่สำเร็จ',text:'ไม่สามารถเชื่อมต่อได้'});
        return;
      }
      renderHistoryList();
      MySwal.fire({icon:'success',title:'ล้างประวัติแล้ว',timer:1200,showConfirmButton:false});
    }
  });
}

/* ================= Admin ================= */
function openAdminAuth(){
  MySwal.fire({
    title:'สำหรับแอดมิน',
    input:'password',
    inputLabel:'กรุณากรอกรหัสผ่าน',
    inputPlaceholder:'รหัสผ่าน',
    showCancelButton:true,
    confirmButtonText:'เข้าสู่ระบบ',
    cancelButtonText:'ยกเลิก'
  }).then(async res=>{
    if(res.isConfirmed){
      if(res.value==='0m3sz6tuj99'){
        await loadExamSets();
        renderAdminList();
        switchAdminTab('sets');
        showView('view-admin');
      } else {
        MySwal.fire({icon:'error',title:'รหัสผ่านไม่ถูกต้อง'});
      }
    }
  });
}

function renderAdminList(){
  const container=document.getElementById('adminSetsList');
  if(examSets.length===0){
    container.innerHTML=`<p class="empty-hint">ยังไม่มีชุดข้อสอบ กด "+ สร้างชุดข้อสอบใหม่" เพื่อเริ่มต้น</p>`;
    return;
  }
  container.innerHTML=examSets.map(s=>`
    <div class="admin-set-card">
      <div class="admin-set-info">
        <h4>${escapeHtml(s.name)}</h4>
        <p>รหัส: <b>${escapeHtml(s.code)}</b> · รหัสผ่าน: <b>${escapeHtml(s.password||'1234')}</b> · จำนวน ${s.numQuestions} ข้อ · ไฟล์: ${escapeHtml(s.pdfName||'-')}</p>
      </div>
      <div class="admin-set-actions">
        <button class="btn-secondary" onclick="editSet('${s.id}')">แก้ไข</button>
        <button class="btn-danger" onclick="deleteSet('${s.id}')">ลบ</button>
      </div>
    </div>
  `).join('');
}

function openSetForm(existing){
  editingSetId= existing? existing.id : null;
  document.getElementById('setFormTitle').textContent= existing? 'แก้ไขชุดข้อสอบ' : 'สร้างชุดข้อสอบใหม่';
  document.getElementById('setNameInput').value= existing? existing.name : '';
  document.getElementById('setCodeInput').value= existing? existing.code : '';
  document.getElementById('setNumQInput').value= existing? existing.numQuestions : 5;
  document.getElementById('setPasswordInput').value= existing? (existing.password || '1234') : '1234';
  document.getElementById('setPdfInput').value='';
  document.getElementById('setPdfCurrentName').textContent= (existing && existing.pdfName)? `ไฟล์ปัจจุบัน: ${existing.pdfName} (อัปโหลดใหม่เพื่อแทนที่)` : '';
  buildQuestionConfigRows(existing? existing.numQuestions : 5, existing? existing.questions : []);
  document.getElementById('setFormOverlay').classList.add('active');
}
function closeSetForm(){
  document.getElementById('setFormOverlay').classList.remove('active');
}

document.getElementById('setNumQInput').addEventListener('input', e=>{
  let n=parseInt(e.target.value,10)||0;
  if(n>200) n=200;
  const existingQ= editingSetId ? (examSets.find(s=>s.id===editingSetId)?.questions || []) : [];
  buildQuestionConfigRows(n, existingQ);
});

function buildQuestionConfigRows(count, existingQuestions){
  const container=document.getElementById('questionConfigList');
  container.innerHTML='';
  for(let i=0;i<count;i++){
    const q= existingQuestions[i] || {type:'choice', answer:'ก'};
    const row=document.createElement('div');
    row.className='qconfig-row';
    row.innerHTML=`
      <span class="qconfig-num">ข้อ ${i+1}</span>
      <select class="qconfig-type" data-idx="${i}">
        <option value="choice" ${q.type==='choice'?'selected':''}>ตัวเลือก (ก/ข/ค/ง)</option>
        <option value="fill" ${q.type==='fill'?'selected':''}>กรอกคำตอบ</option>
      </select>
      <div class="qconfig-answer" data-idx="${i}"></div>
    `;
    container.appendChild(row);
    renderAnswerConfigInput(i, q);
    row.querySelector('.qconfig-type').addEventListener('change', (e)=>{
      renderAnswerConfigInput(i, {type:e.target.value, answer: e.target.value==='choice' ? 'ก' : ''});
    });
  }
}
function renderAnswerConfigInput(idx, q){
  const holder=document.querySelector(`.qconfig-answer[data-idx="${idx}"]`);
  if(q.type==='choice'){
    holder.innerHTML=`<select class="qconfig-answerselect" data-idx="${idx}">
      ${['ก','ข','ค','ง'].map(l=>`<option value="${l}" ${q.answer===l?'selected':''}>${l}</option>`).join('')}
    </select>`;
  } else {
    holder.innerHTML=`<input type="text" class="qconfig-answertext" data-idx="${idx}" placeholder="เฉลย" value="${escapeHtml(q.answer||'')}">`;
  }
}
function collectQuestionsFromForm(count){
  const questions=[];
  for(let i=0;i<count;i++){
    const typeSel=document.querySelector(`.qconfig-type[data-idx="${i}"]`);
    const type=typeSel.value;
    let answer;
    if(type==='choice'){
      answer=document.querySelector(`.qconfig-answerselect[data-idx="${i}"]`).value;
    } else {
      answer=document.querySelector(`.qconfig-answertext[data-idx="${i}"]`).value.trim();
    }
    questions.push({type, answer});
  }
  return questions;
}

async function saveExamSet(){
  const name=document.getElementById('setNameInput').value.trim();
  const code=document.getElementById('setCodeInput').value.trim();
  const password=document.getElementById('setPasswordInput').value.trim();
  const numQ=parseInt(document.getElementById('setNumQInput').value,10);
  const fileInput=document.getElementById('setPdfInput');

  if(!name || !code || !password || !numQ || numQ<1){
    MySwal.fire({icon:'error',title:'ข้อมูลไม่ครบ',text:'กรุณากรอกชื่อชุดข้อสอบ รหัส รหัสผ่าน และจำนวนข้อให้ครบถ้วน'});
    return;
  }
  const dup=examSets.find(s=>s.code.toLowerCase()===code.toLowerCase() && s.id!==editingSetId);
  if(dup){
    MySwal.fire({icon:'error',title:'รหัสซ้ำ',text:'มีชุดข้อสอบที่ใช้รหัสนี้อยู่แล้ว กรุณาใช้รหัสอื่น'});
    return;
  }
  let pdfBase64=null, pdfName=null;
  if(fileInput.files[0]){
    const file=fileInput.files[0];
    if(file.size > 8*1024*1024){
      MySwal.fire({icon:'warning',title:'ไฟล์ใหญ่เกินไป',text:'กรุณาใช้ไฟล์ PDF ขนาดไม่เกิน 8MB'});
      return;
    }
    pdfName=file.name;
    MySwal.fire({title:'กำลังอัปโหลดไฟล์...',allowOutsideClick:false,didOpen:()=>MySwal.showLoading()});
    try{
      pdfBase64=await blobToBase64(file);
    }catch(err){
      console.error(err);
      MySwal.fire({icon:'error',title:'อ่านไฟล์ไม่สำเร็จ'});
      return;
    }
  } else if(editingSetId){
    const existing=examSets.find(s=>s.id===editingSetId);
    if(existing){ pdfBase64=existing.pdfBase64; pdfName=existing.pdfName; }
  }
  if(!pdfBase64){
    MySwal.fire({icon:'error',title:'ยังไม่ได้อัปโหลดไฟล์ PDF',text:'กรุณาเลือกไฟล์ข้อสอบ (.pdf)'});
    return;
  }
  const questions=collectQuestionsFromForm(numQ);
  const invalidFill=questions.find(q=>q.type==='fill' && !q.answer);
  if(invalidFill){
    MySwal.fire({icon:'error',title:'กรุณากรอกเฉลยให้ครบทุกข้อ'});
    return;
  }
  const id= editingSetId || ('set_'+Date.now());
  const setObj={id, name, code, password, numQuestions:numQ, questions, pdfBase64, pdfName};
  try{
    if(!Swal.isVisible()) MySwal.fire({title:'กำลังบันทึกไปยัง Firebase...',allowOutsideClick:false,didOpen:()=>MySwal.showLoading()});
    await dbPut(setObj);
  }catch(err){
    console.error(err);
    MySwal.fire({icon:'error',title:'บันทึกไม่สำเร็จ',text:'ไม่สามารถเชื่อมต่อ Firebase ได้ กรุณาตรวจสอบอินเทอร์เน็ตและ Realtime Database Rules'});
    return;
  }
  await loadExamSets();
  closeSetForm();
  renderAdminList();
  MySwal.fire({icon:'success',title:'บันทึกสำเร็จ',timer:1400,showConfirmButton:false});
}

function editSet(id){
  const s=examSets.find(x=>x.id===id);
  if(s) openSetForm(s);
}
async function deleteSet(id){
  const res=await MySwal.fire({
    icon:'warning', title:'ลบชุดข้อสอบนี้?', text:'การลบไม่สามารถย้อนกลับได้',
    showCancelButton:true, confirmButtonText:'ลบ', cancelButtonText:'ยกเลิก'
  });
  if(res.isConfirmed){
    await dbDelete(id);
    await loadExamSets();
    renderAdminList();
    MySwal.fire({icon:'success',title:'ลบแล้ว',timer:1100,showConfirmButton:false});
  }
}

/* ================= init ================= */
loadExamSets();
