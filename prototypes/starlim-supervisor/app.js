const tasks = [
  {id:1,type:'Facturación',priority:'high',title:'Definir facturación de ATILRA',detail:'Venta P-0052 · $461.179,05 · Entregada hoy',question:'¿Ya solicitaste la factura?',actions:['Solicitar factura','No requiere'],status:'pending'},
  {id:2,type:'Entrega',priority:'medium',title:'Confirmar entrega de IT Italy N2',detail:'Pedido P-0060 · Programado para las 14:00',question:'¿El pedido fue entregado?',actions:['Sí, entregado','Reprogramar'],status:'pending'},
  {id:3,type:'Facturación',priority:'medium',title:'Revisar venta de Torre del Carmen',detail:'Venta P-0022 · $43.604,49 · Sin decisión fiscal',question:'¿Corresponde solicitar factura?',actions:['Solicitar factura','No requiere'],status:'pending'},
  {id:4,type:'Pedido',priority:'medium',title:'Pedido P-0081 sin autorización',detail:'Cargado hace 19 horas · Cliente: La Cascada',question:'¿Querés revisarlo ahora?',actions:['Abrir pedido','Recordar mañana'],status:'pending'}
];

const activity = [
  {icon:'✓',title:'Fran confirmó la entrega de P-0058',detail:'Respuesta desde el Supervisor · Pedido vinculado',time:'Hoy · 10:42'},
  {icon:'F',title:'Solicitud fiscal creada para P-0056',detail:'Acción iniciada por Fran y confirmada en Facturación',time:'Ayer · 16:18'},
  {icon:'↺',title:'Recordatorio de P-0081 generado',detail:'Regla: pedido sin autorización durante más de 12 horas',time:'Ayer · 09:00'}
];

const opportunities = [
  {customer:'La Cascada',initials:'LC',last:'16 días sin comprar',confidence:'high',pattern:'Compra cada 9–12 días',reason:'Superó en 4 días su intervalo habitual. Suele reponer hipoclorito, bolsas y papel.',action:'Contactar hoy'},
  {customer:'IT Italy N6',initials:'I6',last:'Última compra hace 13 días',confidence:'high',pattern:'Compra cada 11–13 días',reason:'Su próximo pedido era esperable entre ayer y hoy. Volumen estable en los últimos 4 pedidos.',action:'Contactar hoy'},
  {customer:'Nivel Pádel',initials:'NP',last:'Última compra hace 21 días',confidence:'medium',pattern:'Compra cada 15–20 días',reason:'Está apenas fuera de su rango y redujo 42% el volumen del último mes.',action:'Consultar stock'},
  {customer:'Campa Fútbol',initials:'CF',last:'Última compra hace 8 días',confidence:'medium',pattern:'Suele comprar los lunes',reason:'Hoy es su día habitual y todavía no ingresó el pedido semanal.',action:'Enviar mensaje'},
  {customer:'ATILRA',initials:'AT',last:'Presupuesto hace 6 días',confidence:'medium',pattern:'Presupuesto sin respuesta',reason:'Tiene una propuesta abierta sin seguimiento comercial registrado.',action:'Dar seguimiento'}
];

const answers = [
  {match:['hoy','hacer','pendiente'],text:'Hoy tenés <strong>4 asuntos pendientes</strong>: dos decisiones de facturación, una entrega para confirmar y un pedido sin autorizar. Los ordené por impacto y antigüedad.',sources:['Mis tareas','Pedidos','Facturación']},
  {match:['factur','factura'],text:'Hay <strong>2 ventas entregadas sin decisión fiscal</strong>: ATILRA por $461.179,05 y Torre del Carmen por $43.604,49. Ninguna se solicitará automáticamente.',sources:['Venta P-0052','Venta P-0022']},
  {match:['atilra','debe','saldo'],text:'En este prototipo, ATILRA registra una venta por <strong>$461.179,05</strong>. Para informar un saldo real, la versión integrada deberá conciliar ventas, notas y cobros de su cuenta corriente.',sources:['Cliente ATILRA','Cuenta corriente simulada']},
  {match:['entrega','entregado'],text:'Hay una entrega que requiere confirmación: <strong>IT Italy N2, pedido P-0060</strong>, programado para hoy a las 14:00.',sources:['Pedido P-0060','Agenda de entregas']},
  {match:['proceso','devoluci','nota de credito'],text:'Una devolución debe registrarse como nota de crédito vinculada a una venta entregada. Después de autorizarla, ajusta stock, cuenta corriente y monto neto de la venta.',sources:['Proceso de devoluciones']},
  {match:['stock','existencia'],text:'El acceso de vendedor puede consultar disponibilidad, pero no modificar stock. En la integración real mostraré producto, existencia disponible y movimientos vinculados.',sources:['Permiso: vendedor','Inventario']},
  {match:['contactar','clientes','llamar'],text:'Hoy priorizaría <strong>La Cascada e IT Italy N6</strong>: ambos alcanzaron o superaron su intervalo habitual. También revisaría Nivel Pádel, Campa Fútbol y el presupuesto abierto de ATILRA.',sources:['Oportunidades comerciales','Patrones simulados']},
  {match:['suele','lleva','compra italy'],text:'IT Italy N2 suele llevar <strong>hipoclorito 33%, bolsas de consorcio y rollos de cocina</strong>. Su frecuencia simulada es de 11 a 13 días y las cantidades de hipoclorito suelen variar entre 4 y 6 bidones.',sources:['Historial simulado: IT Italy N2','Últimos 4 pedidos']}
];

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (value) => value.replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c]));

function assistantMessage(text, sources=[]){
  const el=document.createElement('div'); el.className='message assistant';
  el.innerHTML=`<div class="assistant-bubble"><div class="assistant-label"><i></i> STARLIM SUPERVISOR</div>${text}${sources.length?`<div class="source-row">${sources.map(s=>`<span class="source-chip">${s}</span>`).join('')}</div>`:''}</div>`;
  $('#chatMessages').append(el); $('#chatMessages').scrollTop=$('#chatMessages').scrollHeight;
}

function userMessage(text){const el=document.createElement('div');el.className='message user';el.textContent=text;$('#chatMessages').append(el)}

function answerQuestion(question){
  const normalized=question.toLowerCase();
  const answer=answers.map(a=>({...a,score:a.match.filter(word=>normalized.includes(word)).length})).sort((a,b)=>b.score-a.score)[0];
  setTimeout(()=>{
    if(answer?.score) assistantMessage(answer.text,answer.sources);
    else assistantMessage('Todavía no puedo respaldar esa respuesta con los datos simulados. En la integración real buscaría únicamente en los módulos autorizados y te mostraría las fuentes utilizadas.',['Respuesta limitada por seguridad']);
  },380);
}

function renderPreview(){
  const pending=tasks.filter(t=>t.status==='pending').slice(0,3);
  $('#taskPreview').innerHTML=pending.map(t=>`<article class="task-mini"><div class="task-meta"><span>${t.type}</span><span class="priority ${t.priority}">${t.priority==='high'?'Alta':'Media'}</span></div><strong>${t.title}</strong><div class="task-actions"><button class="primary" data-resolve="${t.id}">${t.actions[0]}</button><button data-postpone="${t.id}">Posponer</button></div></article>`).join('')||'<div class="empty">No hay tareas pendientes.</div>';
  updateCounts();
}

function renderTasks(){
  const filter=$('#taskFilter').value;
  const visible=tasks.filter(t=>filter==='all'||(filter==='done'?t.status==='done':t.status==='pending'));
  $('#taskBoard').innerHTML=visible.map(t=>`<article class="task-row ${t.status}"><div><div class="task-meta"><span>${t.type}</span><span class="priority ${t.priority}">${t.status==='done'?'Resuelta':t.priority==='high'?'Prioridad alta':'Prioridad media'}</span></div><h3>${t.title}</h3><p>${t.detail}</p><p><strong>${t.question}</strong></p></div><div class="task-actions">${t.status==='pending'?`<button class="primary" data-resolve="${t.id}">${t.actions[0]}</button><button data-postpone="${t.id}">Posponer</button>`:'<span>✓ Completada</span>'}</div></article>`).join('')||'<div class="empty">No hay tareas en esta vista.</div>';
}

function renderHistory(){
  $('#historyList').innerHTML=activity.map(a=>`<article class="history-entry"><div class="history-icon">${a.icon}</div><div><strong>${a.title}</strong><p>${a.detail}</p></div><time>${a.time}</time></article>`).join('');
}

function renderOpportunities(){
  $('#opportunityList').innerHTML=opportunities.map((o,index)=>`<article class="opportunity-card"><div class="customer-name"><div class="avatar">${o.initials}</div><div><strong>${index+1}. ${o.customer}</strong><span>${o.last}</span><div class="confidence ${o.confidence}">${o.confidence==='high'?'Confianza alta':'Confianza media'}</div></div></div><div class="reason-block"><strong>${o.pattern}</strong><p>${o.reason}</p><span>Basado en historial simulado</span></div><div class="opportunity-actions"><button class="primary" data-contact="${o.customer}">${o.action}</button><button data-pattern="${o.customer}">Ver patrón</button></div></article>`).join('');
}

function renderInterpretation(){
  const message=$('#whatsappMessage').value.trim();
  if(!message){toast('Pegá primero el mensaje del cliente');return}
  const result=$('#interpretationResult');
  result.classList.remove('empty-result');
  result.innerHTML=`<div class="result-header"><div><strong>Borrador interpretado</strong><span>Cliente propuesto: IT Italy N2 · Basado en último pedido</span></div><div class="confidence-score">Confianza media · 78%</div></div><div class="interpreted-items"><article class="interpreted-item"><div class="item-status">✓</div><div><strong>Hipoclorito 33% · Bidón 5 L</strong><p>Interpreté “lavandinas” según los últimos pedidos de este cliente. Llevó 5 unidades la vez anterior.</p></div><div class="item-qty">7 un.</div></article><article class="interpreted-item"><div class="item-status">✓</div><div><strong>Bolsa consorcio 80 × 110</strong><p>Es la presentación grande comprada en sus últimos cuatro pedidos.</p></div><div class="item-qty">3 pack</div></article><article class="interpreted-item"><div class="item-status warning">?</div><div><strong>“El coso del baño” · Sin confirmar</strong><p>Hay dos coincidencias posibles en su historial: filtro para mingitorio o pastillas para inodoro.</p></div><div class="item-qty">—</div></article></div><div class="ambiguity-box"><strong>Necesita confirmación:</strong> preguntarle al cliente a qué artículo del baño se refiere y cuántas unidades necesita. No se agregará automáticamente.</div><div class="result-actions"><button class="primary" data-draft>Preparar borrador seguro</button><button data-copy-question>Copiar pregunta al cliente</button></div>`;
}

function updateCounts(){
  const pending=tasks.filter(t=>t.status==='pending');
  const count=pending.length;
  $('#navTaskCount').textContent=count;
  $('#headline').textContent=count?`Tenés ${count} asuntos para revisar hoy.`:'No tenés asuntos pendientes.';
  $('#billingCount').textContent=pending.filter(t=>t.type==='Facturación').length;
  $('#deliveryCount').textContent=pending.filter(t=>t.type==='Entrega').length;
  $('#orderCount').textContent=pending.filter(t=>t.type==='Pedido').length;
}
function toast(message){const el=$('#toast');el.textContent=message;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),2400)}

function resolveTask(id){
  const task=tasks.find(t=>t.id===Number(id)); if(!task||task.status==='done') return;
  task.status='done'; activity.unshift({icon:'✓',title:`Fran resolvió: ${task.title}`,detail:'Respuesta registrada desde el prototipo del Supervisor',time:'Ahora'});
  renderPreview();renderTasks();renderHistory();toast('Respuesta registrada en el historial');
}

document.addEventListener('click',event=>{
  const nav=event.target.closest('[data-view]'); if(nav){document.querySelectorAll('.nav-item,.view').forEach(el=>el.classList.remove('active'));nav.classList.add('active');$(`#${nav.dataset.view}View`).classList.add('active')}
  const suggestion=event.target.closest('#suggestions button');if(suggestion){$('#chatInput').value=suggestion.textContent;$('#chatForm').requestSubmit()}
  const resolve=event.target.closest('[data-resolve]');if(resolve)resolveTask(resolve.dataset.resolve);
  const postpone=event.target.closest('[data-postpone]');if(postpone)toast('Recordatorio pospuesto por 2 horas');
  const contact=event.target.closest('[data-contact]');if(contact){activity.unshift({icon:'☎',title:`Fran marcó contacto con ${contact.dataset.contact}`,detail:'Seguimiento iniciado desde Oportunidades',time:'Ahora'});renderHistory();toast('Seguimiento registrado')}
  const pattern=event.target.closest('[data-pattern]');if(pattern)toast(`Abriendo patrón simulado de ${pattern.dataset.pattern}`);
  if(event.target.closest('[data-draft]'))toast('Borrador seguro preparado; no se registró ningún pedido');
  if(event.target.closest('[data-copy-question]'))toast('Pregunta preparada para copiar');
  if(event.target.closest('[data-open-tasks]'))document.querySelector('[data-view="tasks"]').click();
});

$('#chatForm').addEventListener('submit',event=>{event.preventDefault();const value=$('#chatInput').value.trim();if(!value)return;userMessage(escapeHtml(value));$('#chatInput').value='';answerQuestion(value)});
$('#clearChat').addEventListener('click',()=>{startChat();toast('Conversación reiniciada')});
$('#taskFilter').addEventListener('change',renderTasks);
$('#interpretButton').addEventListener('click',renderInterpretation);
$('#refreshOpportunities').addEventListener('click',()=>toast('Análisis actualizado con datos simulados'));

function startChat(){
  $('#chatMessages').innerHTML='';
  assistantMessage('Hola, Fran. Revisé tu jornada: encontré <strong>4 asuntos que requieren atención</strong>. También podés consultarme por clientes, pedidos, entregas, facturación o procesos internos.',['Actualizado hoy · 09:00','Datos simulados']);
}

startChat();renderPreview();renderTasks();renderHistory();renderOpportunities();
