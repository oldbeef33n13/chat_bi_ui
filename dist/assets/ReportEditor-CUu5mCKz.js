import{r as g,j as e}from"./react-vendor-CeeCjGIk.js";import{s as q,b as Q,c as U,u as W,a as G,p as R,d as J}from"./index-Q2yF7HMO.js";import{D as K,u as X,a as Y,C as Z,E as ee}from"./ChartAskAssistant-HoHnyLIy.js";import"./echarts-vendor-DL8T-ZVK.js";const te=(s,t,r,a=420)=>{const o=Math.max(0,t-a),i=t+r+a,d=[];let c=0;return s.forEach(p=>{const h=c;h+p.height>=o&&h<=i&&d.push({item:p,top:h}),c+=p.height}),{totalHeight:c,visible:d}},v=s=>s.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;"),_=s=>String(s??""),se=s=>s==="Letter"?{widthMm:216,heightMm:279,cssSize:"Letter"}:{widthMm:210,heightMm:297,cssSize:"A4"},ne=s=>{const t=s.root.props??{},r=t.reportTitle??s.title??"未命名报告";return{...t,reportTitle:r,tocShow:t.tocShow??!0,coverEnabled:t.coverEnabled??!0,coverTitle:t.coverTitle??r,coverSubtitle:t.coverSubtitle??"Report",coverNote:t.coverNote??`生成时间：${new Date().toLocaleDateString()}`,summaryEnabled:t.summaryEnabled??!0,summaryTitle:t.summaryTitle??"执行摘要",summaryText:t.summaryText??"",headerShow:t.headerShow??!0,footerShow:t.footerShow??!0,headerText:t.headerText??r,footerText:t.footerText??"Visual Document OS",showPageNumber:t.showPageNumber??!0,pageSize:t.pageSize??"A4"}},re=s=>{const t=Math.max(2,Math.ceil(s.length/28));return Math.min(95,12+t*4.6)},oe=s=>{const t=Math.max(2,Math.ceil(s.length/30));return Math.min(120,62+t*4.4)},ie=s=>{const t=s.bindings.find(a=>a.role==="x"||a.role==="category"),r=s.bindings.find(a=>a.role==="y"||a.role==="value");return`字段: ${(t==null?void 0:t.field)??"-"} / ${(r==null?void 0:r.field)??"-"}`},ae=(s,t,r)=>{var c,p;const a=(c=t.data)==null?void 0:c.sourceId;if(!a)return[];const o=(p=s.dataSources)==null?void 0:p.find(h=>h.id===a);if(!o||o.type!=="static"||!Array.isArray(o.staticData))return[];const i=o.staticData.filter(h=>!!h&&typeof h=="object"),d=Q(i,r);return U(d,s.filters??[],t)},ce=s=>(s.root.children??[]).filter(r=>r.kind==="section").map((r,a)=>{var d;const o=_((d=r.props)==null?void 0:d.title)||`章节 ${a+1}`,i=(r.children??[]).map(c=>{var p;if(c.kind==="text")return{kind:"text",text:_((p=c.props)==null?void 0:p.text)};if(c.kind==="chart"){const h=c.props??{bindings:[]},N=ae(s,c,h);return{kind:"chart",title:h.titleText??c.name??c.id,bindingHint:ie(h),summary:q(h,N)}}return{kind:"other",text:`未导出块类型: ${c.kind}`}});return{id:r.id,title:o,blocks:i}}),le=({sections:s,contentHeightMm:t,startPageNo:r})=>{const a=[],o=new Map;let i={pageNo:r,items:[]},d=0;const c=()=>{a.push(i),i={pageNo:i.pageNo+1,items:[]},d=0},p=h=>{d>0&&d+h>t&&c()};return s.forEach(h=>{p(12),o.has(h.id)||o.set(h.id,i.pageNo),i.items.push({kind:"section",title:h.title}),d+=12,h.blocks.forEach(f=>{const k=f.kind==="text"?re(f.text):f.kind==="chart"?oe(f.summary):22;p(k),i.items.push({kind:"block",block:f}),d+=k})}),i.items.length>0&&a.push(i),{pages:a,sectionPageMap:o}},de=s=>{if(s.length===0)return"本报告暂无章节内容。";const t=s.reduce((a,o)=>a+o.blocks.filter(i=>i.kind==="chart").length,0),r=s.reduce((a,o)=>a+o.blocks.filter(i=>i.kind==="text").length,0);return`本报告共 ${s.length} 个章节，包含 ${t} 张图表与 ${r} 段文本。建议优先关注峰值异常区间及后续处置动作。`},he=s=>{if(s.kind==="section")return`<h2 class="section-title">${v(s.title)}</h2>`;const t=s.block;return t.kind==="text"?`<div class="text-block"><pre>${v(t.text)}</pre></div>`:t.kind==="chart"?`<div class="chart-block">
      <div class="chart-title">${v(t.title)}</div>
      <div class="chart-hint">${v(t.bindingHint)}</div>
      <div class="chart-summary">${v(t.summary)}</div>
    </div>`:`<div class="other-block">${v(t.text)}</div>`},P=({props:s,pageNo:t,body:r})=>{const a=s.headerShow?`<div class="page-header"><span>${v(s.headerText||s.reportTitle)}</span>${s.showPageNumber?`<span>Page ${t}</span>`:""}</div>`:"",o=s.footerShow?`<div class="page-footer"><span>${v(s.footerText||"Visual Document OS")}</span>${s.showPageNumber?`<span>#${t}</span>`:""}</div>`:"";return`<section class="page">
    ${a}
    <div class="page-body">${r}</div>
    ${o}
  </section>`},me=s=>{const t=ne(s),r=se(t.pageSize),a=t.headerShow?10:0,o=t.footerShow?10:0,i=r.heightMm-24-a-o,d=ce(s),c=Math.max(1,Math.floor((i-20)/6)),p=t.tocShow?Math.max(1,Math.ceil(d.length/c)):0,N=(t.coverEnabled?1:0)+p+1,{pages:f,sectionPageMap:k}=le({sections:d,contentHeightMm:i,startPageNo:N}),S=[];let y=1;if(t.coverEnabled&&(S.push(P({props:t,pageNo:y,body:`<div class="cover">
          <h1>${v(t.coverTitle||t.reportTitle)}</h1>
          <p class="cover-subtitle">${v(t.coverSubtitle)}</p>
          <p class="cover-note">${v(t.coverNote)}</p>
        </div>`})),y+=1),t.tocShow)for(let j=0;j<p;j+=1){const l=`<div class="toc">
        <h2>目录</h2>
        ${d.slice(j*c,(j+1)*c).map((T,z)=>{const b=k.get(T.id)??"-";return`<div class="toc-row"><span>${v(`${j*c+z+1}. ${T.title}`)}</span><span>${b}</span></div>`}).join("")}
      </div>`;S.push(P({props:t,pageNo:y,body:l})),y+=1}if(f.forEach(j=>{S.push(P({props:t,pageNo:y,body:`<div class="content-page">${j.items.map(he).join("")}</div>`})),y+=1}),t.summaryEnabled){const j=t.summaryText.trim()||de(d);S.push(P({props:t,pageNo:y,body:`<div class="summary-page"><h2>${v(t.summaryTitle)}</h2><pre>${v(j)}</pre></div>`}))}const E=`
    @page { size: ${r.cssSize}; margin: 0; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: #eef2f9;
      font-family: "Source Sans 3", "Segoe UI", sans-serif;
      color: #0f172a;
    }
    .page {
      position: relative;
      width: ${r.widthMm}mm;
      min-height: ${r.heightMm}mm;
      margin: 8mm auto;
      padding: 12mm 14mm;
      background: #fff;
      box-shadow: 0 8px 18px rgba(15, 23, 42, 0.12);
      page-break-after: always;
      overflow: hidden;
    }
    .page-header, .page-footer {
      position: absolute;
      left: 14mm;
      right: 14mm;
      font-size: 10pt;
      color: #475569;
      display: flex;
      justify-content: space-between;
      border-bottom: 1px solid #dbe6f7;
      padding-bottom: 2mm;
    }
    .page-header {
      top: 6mm;
    }
    .page-footer {
      bottom: 6mm;
      border-bottom: none;
      border-top: 1px solid #dbe6f7;
      padding-top: 2mm;
      padding-bottom: 0;
    }
    .page-body {
      margin-top: ${t.headerShow?"12mm":"0"};
      margin-bottom: ${t.footerShow?"12mm":"0"};
    }
    .cover {
      min-height: ${Math.max(140,i-4)}mm;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      gap: 4mm;
    }
    .cover h1 { margin: 0; font-size: 34pt; }
    .cover-subtitle { margin: 0; color: #475569; font-size: 14pt; }
    .cover-note { margin: 0; color: #64748b; font-size: 11pt; }
    .toc h2, .summary-page h2, .section-title {
      margin: 0 0 4mm 0;
      font-size: 16pt;
      color: #1e293b;
    }
    .toc-row {
      display: flex;
      justify-content: space-between;
      border-bottom: 1px dashed #dbe6f7;
      padding: 2mm 0;
      font-size: 11pt;
    }
    .text-block, .chart-block, .other-block {
      border: 1px solid #dbe6f7;
      border-radius: 3mm;
      padding: 3mm;
      margin-bottom: 3mm;
      background: #f8fbff;
    }
    .text-block pre, .summary-page pre {
      margin: 0;
      white-space: pre-wrap;
      font-family: inherit;
      line-height: 1.5;
      font-size: 11pt;
    }
    .chart-title {
      font-size: 12pt;
      font-weight: 700;
      margin-bottom: 1mm;
    }
    .chart-hint {
      font-size: 10pt;
      color: #475569;
      margin-bottom: 2mm;
    }
    .chart-summary {
      font-size: 10.5pt;
      line-height: 1.45;
    }
    .summary-page pre {
      border: 1px solid #dbe6f7;
      border-radius: 3mm;
      background: #f8fbff;
      padding: 3mm;
    }
    @media print {
      body { background: #fff; }
      .page {
        margin: 0;
        box-shadow: none;
      }
    }
  `;return`<!doctype html>
  <html lang="zh-CN">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>${v(t.reportTitle)} - Export</title>
      <style>${E}</style>
    </head>
    <body>
      ${S.join(`
`)}
    </body>
  </html>`},ue=s=>{if(typeof window>"u")return{ok:!1,message:"当前环境不支持浏览器导出"};const t=me(s),r=window.open("","_blank","noopener,noreferrer");return r?(r.document.open(),r.document.write(t),r.document.close(),r.focus(),setTimeout(()=>{r.print()},180),{ok:!0,message:"已打开打印窗口，可选择“另存为 PDF”"}):{ok:!1,message:"浏览器拦截了弹窗，请允许后重试"}};function Te({doc:s}){const t=W(),r=G(t.selection),a=g.useMemo(()=>new K(s.dataSources??[],s.queries??[],{debounceMs:120}),[s.docId]),o=(s.root.children??[]).filter(n=>n.kind==="section"),[i,d]=g.useState(!1),[c,p]=g.useState(""),[h,N]=g.useState({}),[f,k]=g.useState({}),S=g.useRef(null),[y,E]=g.useState(0),[j,H]=g.useState(620),l=g.useMemo(()=>fe(s),[s]),T=g.useMemo(()=>ye(s),[s]),z=g.useMemo(()=>ve(l,o),[l,o]),b=(n,u,m=0)=>{t.executeCommand({type:"UpdateProps",nodeId:s.root.id,props:n},{summary:u,mergeWindowMs:m})},C=(n,u)=>{const m=u==="text"?{id:R("text"),kind:"text",props:{text:"新段落",format:"plain"}}:{id:R("chart"),kind:"chart",props:J("新图表")};t.executeCommand({type:"InsertNode",parentId:n.id,node:m},{summary:`insert ${u} into ${n.id}`})},A=(n,u)=>{const m=o.findIndex(w=>w.id===n);if(m<0)return;const x=m+u;x<0||x>=o.length||t.executeCommand({type:"MoveNode",nodeId:n,newParentId:s.root.id,newIndex:x},{summary:"reorder section"})},I=g.useMemo(()=>{const n=[];let u=0;return l.coverEnabled&&(u+=1,n.push({kind:"cover",key:"report_cover",pageIndex:u,height:f.report_cover??340})),l.tocShow&&(u+=1,n.push({kind:"toc",key:"report_toc",pageIndex:u,height:f.report_toc??260})),o.forEach((m,x)=>{u+=1;const w=u;n.push({kind:"section-header",key:`section_header_${m.id}`,section:m,sectionIndex:x,pageIndex:w,height:f[`section_header_${m.id}`]??96}),(m.children??[]).forEach($=>{const B=`block_${$.id}`;n.push({kind:"block",key:B,section:m,block:$,pageIndex:w,height:f[B]??je($)})}),n.push({kind:"quick-insert",key:`insert_${m.id}`,section:m,pageIndex:w,height:f[`insert_${m.id}`]??82})}),l.summaryEnabled&&(u+=1,n.push({kind:"summary",key:"report_summary",pageIndex:u,height:f.report_summary??260})),n},[f,l.coverEnabled,l.summaryEnabled,l.tocShow,o]);g.useEffect(()=>{const n=S.current;if(!n)return;const u=()=>H(n.clientHeight);if(u(),typeof ResizeObserver>"u")return;const m=new ResizeObserver(u);return m.observe(n),()=>m.disconnect()},[]);const{totalHeight:O,visible:V}=g.useMemo(()=>te(I,y,j,420),[I,y,j]),D=n=>h[n]??"/",F=(n,u)=>{N(m=>({...m,[n]:u}))},L=g.useCallback((n,u)=>{k(m=>{const x=m[n];return x!==void 0&&Math.abs(x-u)<2?m:{...m,[n]:u}})},[]);return e.jsxs("div",{className:"col",style:{height:"100%"},children:[e.jsxs("div",{className:"row",style:{justifyContent:"space-between"},children:[e.jsxs("div",{className:"row",children:[e.jsx("span",{className:"chip",children:l.reportTitle}),e.jsxs("span",{className:"chip",children:["章节 ",o.length]}),e.jsxs("span",{className:"chip",children:["页 ",Math.max(1,be(l,o.length))]}),c?e.jsx("span",{className:"chip",children:c}):null]}),e.jsxs("div",{className:"row",children:[e.jsx("button",{className:"btn",onClick:()=>{const n=ue(s);p(n.message),setTimeout(()=>p(""),3e3)},children:"导出 PDF"}),e.jsx("button",{className:`btn ${i?"primary":""}`,onClick:()=>d(n=>!n),children:"报告结构"}),e.jsx("button",{className:"btn",onClick:()=>t.executeCommand({type:"InsertNode",parentId:s.root.id,node:{id:R("section"),kind:"section",props:{title:`章节 ${o.length+1}`},children:[]}},{summary:"add section"}),children:"+章节"})]})]}),i?e.jsxs("div",{className:"col",style:{border:"1px solid var(--line)",borderRadius:10,padding:8},children:[e.jsxs("div",{className:"row",style:{justifyContent:"space-between"},children:[e.jsx("strong",{children:"封面 / 总结 / 页眉页脚"}),e.jsx("button",{className:"btn",onClick:()=>b({summaryText:T},"refresh auto summary"),children:"刷新自动总结"})]}),e.jsxs("div",{className:"row",children:[e.jsxs("label",{className:"row",children:[e.jsx("input",{type:"checkbox",checked:l.tocShow,onChange:n=>b({tocShow:n.target.checked},"toggle toc")}),e.jsx("span",{children:"目录页"})]}),e.jsxs("label",{className:"row",children:[e.jsx("input",{type:"checkbox",checked:l.coverEnabled,onChange:n=>b({coverEnabled:n.target.checked},"toggle cover")}),e.jsx("span",{children:"封面页"})]}),e.jsxs("label",{className:"row",children:[e.jsx("input",{type:"checkbox",checked:l.summaryEnabled,onChange:n=>b({summaryEnabled:n.target.checked},"toggle summary")}),e.jsx("span",{children:"总结页"})]}),e.jsxs("label",{className:"row",children:[e.jsx("input",{type:"checkbox",checked:!!l.headerShow,onChange:n=>b({headerShow:n.target.checked},"toggle header")}),e.jsx("span",{children:"页眉"})]}),e.jsxs("label",{className:"row",children:[e.jsx("input",{type:"checkbox",checked:!!l.footerShow,onChange:n=>b({footerShow:n.target.checked},"toggle footer")}),e.jsx("span",{children:"页脚"})]}),e.jsxs("label",{className:"row",children:[e.jsx("input",{type:"checkbox",checked:l.showPageNumber,onChange:n=>b({showPageNumber:n.target.checked},"toggle page number")}),e.jsx("span",{children:"页码"})]})]}),e.jsxs("div",{className:"row",children:[e.jsxs("label",{className:"col",style:{flex:1},children:[e.jsx("span",{children:"报告标题"}),e.jsx("input",{className:"input",value:l.reportTitle,onChange:n=>b({reportTitle:n.target.value},"edit report title",160)})]}),e.jsxs("label",{className:"col",style:{width:180},children:[e.jsx("span",{children:"纸张"}),e.jsxs("select",{className:"select",value:typeof l.pageSize=="string"?l.pageSize:"A4",onChange:n=>b({pageSize:n.target.value},"change page size"),children:[e.jsx("option",{value:"A4",children:"A4"}),e.jsx("option",{value:"Letter",children:"Letter"})]})]})]}),e.jsxs("div",{className:"row",children:[e.jsxs("label",{className:"col",style:{flex:1},children:[e.jsx("span",{children:"封面主标题"}),e.jsx("input",{className:"input",value:l.coverTitle,onChange:n=>b({coverTitle:n.target.value},"edit cover title",160)})]}),e.jsxs("label",{className:"col",style:{flex:1},children:[e.jsx("span",{children:"封面副标题"}),e.jsx("input",{className:"input",value:l.coverSubtitle,onChange:n=>b({coverSubtitle:n.target.value},"edit cover subtitle",160)})]})]}),e.jsxs("div",{className:"row",children:[e.jsxs("label",{className:"col",style:{flex:1},children:[e.jsx("span",{children:"页眉文案"}),e.jsx("input",{className:"input",value:l.headerText,onChange:n=>b({headerText:n.target.value},"edit header text",160)})]}),e.jsxs("label",{className:"col",style:{flex:1},children:[e.jsx("span",{children:"页脚文案"}),e.jsx("input",{className:"input",value:l.footerText,onChange:n=>b({footerText:n.target.value},"edit footer text",160)})]})]}),e.jsxs("label",{className:"col",children:[e.jsx("span",{children:"总结页标题"}),e.jsx("input",{className:"input",value:l.summaryTitle,onChange:n=>b({summaryTitle:n.target.value},"edit summary title",160)})]}),e.jsxs("label",{className:"col",children:[e.jsx("span",{children:"总结内容"}),e.jsx("textarea",{className:"textarea",value:l.summaryText,onChange:n=>b({summaryText:n.target.value},"edit summary text",160)})]}),e.jsxs("div",{className:"muted",style:{fontSize:12},children:["自动总结建议：",T]})]}):null,e.jsxs("div",{ref:S,className:"col",style:{overflow:"auto",minHeight:0,paddingRight:4,position:"relative"},onScroll:n=>E(n.currentTarget.scrollTop),children:[I.length===0?e.jsx("div",{className:"muted",children:"暂无章节内容"}):null,e.jsx("div",{style:{position:"relative",minHeight:O},children:V.map(({item:n,top:u})=>{var m;return e.jsxs(xe,{entryKey:n.key,onHeight:L,style:{position:"absolute",left:0,right:0,top:u,paddingBottom:8},children:[n.kind==="cover"?e.jsx(M,{props:l,pageIndex:n.pageIndex,children:e.jsxs("div",{className:"col",style:{minHeight:240,justifyContent:"center",alignItems:"center",textAlign:"center"},children:[e.jsx("div",{style:{fontSize:30,fontWeight:700},children:l.coverTitle||l.reportTitle}),e.jsx("div",{className:"muted",style:{fontSize:16},children:l.coverSubtitle}),e.jsx("div",{className:"muted",style:{marginTop:14},children:l.coverNote||`生成时间：${new Date().toLocaleDateString()}`})]})}):null,n.kind==="toc"?e.jsx(M,{props:l,pageIndex:n.pageIndex,children:e.jsxs("div",{className:"section",children:[e.jsx("div",{className:"section-title",children:"目录"}),e.jsxs("div",{className:"block",style:{margin:0},children:[o.length===0?e.jsx("div",{className:"muted",children:"暂无章节"}):null,o.map((x,w)=>{var $;return e.jsxs("div",{className:"row",style:{justifyContent:"space-between",borderBottom:"1px dashed var(--line)",padding:"6px 0"},children:[e.jsx("span",{children:`${w+1}. ${String((($=x.props)==null?void 0:$.title)??`章节 ${w+1}`)}`}),e.jsxs("span",{className:"muted",children:["Page ",z.get(x.id)??"-"]})]},x.id)})]})]})}):null,n.kind==="section-header"?e.jsx(M,{props:l,pageIndex:n.pageIndex,children:e.jsx("div",{className:"section",children:e.jsxs("div",{className:"section-title row",style:{justifyContent:"space-between"},children:[e.jsxs("div",{className:"row",children:[e.jsx("span",{children:String(((m=n.section.props)==null?void 0:m.title)??`章节 ${n.sectionIndex+1}`)}),e.jsx("span",{className:"muted",children:n.section.id})]}),e.jsxs("div",{className:"row",children:[e.jsx("button",{className:"btn",onClick:()=>A(n.section.id,-1),children:"上移"}),e.jsx("button",{className:"btn",onClick:()=>A(n.section.id,1),children:"下移"}),e.jsx("button",{className:"btn",onClick:()=>C(n.section,"text"),children:"+文本"}),e.jsx("button",{className:"btn",onClick:()=>C(n.section,"chart"),children:"+图表"})]})]})})}):null,n.kind==="block"?e.jsx(pe,{doc:s,block:n.block,selected:r.selectedIds.includes(n.block.id),onSelect:x=>t.setSelection(n.block.id,x),engine:a,lazyRootRef:S,onQuickChartPatch:(x,w)=>t.executeCommand({type:"UpdateProps",nodeId:n.block.id,props:x},{summary:w})}):null,n.kind==="quick-insert"?e.jsx("div",{className:"block",children:e.jsxs("div",{className:"row",style:{justifyContent:"space-between"},children:[e.jsx("input",{className:"input",value:D(n.section.id),onChange:x=>F(n.section.id,x.target.value),placeholder:"输入 /chart 或 /text"}),e.jsx("button",{className:"btn",onClick:()=>{if(D(n.section.id).trim()==="/chart"){C(n.section,"chart");return}C(n.section,"text")},children:"快捷插入"})]})}):null,n.kind==="summary"?e.jsx(M,{props:l,pageIndex:n.pageIndex,children:e.jsxs("div",{className:"section",children:[e.jsx("div",{className:"section-title",children:l.summaryTitle}),e.jsx("div",{className:"block",style:{margin:0},children:e.jsx("pre",{style:{margin:0,whiteSpace:"pre-wrap"},children:l.summaryText||T})})]})}):null]},n.key)})})]})]})}function pe({doc:s,block:t,selected:r,onSelect:a,engine:o,lazyRootRef:i,onQuickChartPatch:d}){var f;const{rows:c,loading:p,error:h}=X(s,t,o),N=r?{borderColor:"#2563eb",boxShadow:"0 0 0 2px rgba(37, 99, 235, .2)"}:void 0;return e.jsx("div",{className:"block",style:N,onClick:k=>a(k.ctrlKey||k.metaKey),children:t.kind==="text"?e.jsx("pre",{style:{margin:0,whiteSpace:"pre-wrap"},children:String(((f=t.props)==null?void 0:f.text)??"")}):t.kind==="chart"?p?e.jsx("div",{className:"muted",children:"loading..."}):h?e.jsxs("div",{className:"muted",children:["error: ",h]}):e.jsx("div",{className:"col",children:e.jsx(ge,{rootRef:i,height:260,children:e.jsxs("div",{style:{width:"100%",height:260,position:"relative"},children:[e.jsx("div",{style:{position:"absolute",top:6,right:6,zIndex:5},children:e.jsx(Y,{doc:s,node:t,rows:c,compact:!0})}),r?e.jsx("div",{style:{position:"absolute",top:6,left:6,zIndex:5},children:e.jsx(Z,{spec:t.props,onPatch:d})}):null,e.jsx(ee,{spec:t.props,rows:c,height:260})]})})}):e.jsxs("div",{className:"muted",children:["暂未支持的块类型: ",t.kind]})})}function ge({rootRef:s,height:t,children:r}){const a=g.useRef(null),[o,i]=g.useState(!1);return g.useEffect(()=>{if(o)return;const d=a.current;if(!d)return;if(typeof IntersectionObserver>"u"){i(!0);return}const c=new IntersectionObserver(p=>{p.some(h=>h.isIntersecting)&&(i(!0),c.disconnect())},{root:s.current,rootMargin:"220px"});return c.observe(d),()=>c.disconnect()},[o,s]),e.jsx("div",{ref:a,style:{minHeight:t},children:o?r:e.jsx("div",{className:"muted",style:{height:t,display:"flex",alignItems:"center",justifyContent:"center"},children:"图表离屏，滚动到可视区后加载"})})}function xe({entryKey:s,onHeight:t,style:r,children:a}){const o=g.useRef(null);return g.useEffect(()=>{const i=o.current;if(!i)return;const d=()=>t(s,i.getBoundingClientRect().height);if(d(),typeof ResizeObserver>"u")return;const c=new ResizeObserver(d);return c.observe(i),()=>c.disconnect()},[s,t]),e.jsx("div",{ref:o,style:r,children:a})}function M({props:s,pageIndex:t,children:r}){return e.jsxs("div",{className:"report-page-frame",children:[s.headerShow?e.jsxs("div",{className:"report-page-header row",style:{justifyContent:"space-between"},children:[e.jsx("span",{children:s.headerText||s.reportTitle}),s.showPageNumber?e.jsxs("span",{className:"muted",children:["Page ",t]}):null]}):null,e.jsx("div",{className:"report-page-body",children:r}),s.footerShow?e.jsxs("div",{className:"report-page-footer row",style:{justifyContent:"space-between"},children:[e.jsx("span",{className:"muted",children:s.footerText||"Visual Document OS"}),s.showPageNumber?e.jsxs("span",{className:"muted",children:["#",t]}):null]}):null]})}const fe=s=>{const t=s.root.props??{},r=t.reportTitle??s.title??"未命名报告";return{...t,reportTitle:r,tocShow:t.tocShow??!0,coverEnabled:t.coverEnabled??!0,coverTitle:t.coverTitle??r,coverSubtitle:t.coverSubtitle??"Report",coverNote:t.coverNote??`生成时间：${new Date().toLocaleDateString()}`,summaryEnabled:t.summaryEnabled??!0,summaryTitle:t.summaryTitle??"执行摘要",summaryText:t.summaryText??"",headerText:t.headerText??r,footerText:t.footerText??"Visual Document OS",showPageNumber:t.showPageNumber??!0,pageSize:t.pageSize??"A4"}},be=(s,t)=>t+(s.coverEnabled?1:0)+(s.tocShow?1:0)+(s.summaryEnabled?1:0),ve=(s,t)=>{let r=0;s.coverEnabled&&(r+=1),s.tocShow&&(r+=1);const a=new Map;return t.forEach(o=>{r+=1,a.set(o.id,r)}),a},je=s=>{var t;if(s.kind==="chart")return 332;if(s.kind==="text"){const r=String(((t=s.props)==null?void 0:t.text)??"");return 72+Math.max(2,Math.min(8,Math.ceil(r.length/30)))*20}return 150},ye=s=>{const t=(s.root.children??[]).filter(i=>i.kind==="section"),r=t.reduce((i,d)=>i+(d.children??[]).filter(c=>c.kind==="chart").length,0),a=t.reduce((i,d)=>i+(d.children??[]).filter(c=>c.kind==="text").length,0),o=t.map(i=>{var d;return String(((d=i.props)==null?void 0:d.title)??"未命名章节")}).slice(0,3).join("、");return t.length===0?"报告暂无章节，建议先新增章节并补充关键图表。":`本报告共 ${t.length} 个章节，包含 ${r} 张图表与 ${a} 段文本。重点章节：${o}。建议优先核对峰值异常与对应处置动作。`};export{Te as ReportEditor};
