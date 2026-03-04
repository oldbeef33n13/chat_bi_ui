import{r as x,j as e}from"./react-vendor-CeeCjGIk.js";import{s as G,d as J,e as X,u as Y,a as Z,b as K,p as M,c as ee,T as te,E as se,f as ne}from"./index-BdorGUnL.js";import{a as re,C as oe}from"./ChartAskAssistant-CVhuvZFn.js";import"./echarts-vendor-C-UbbZkN.js";const ie=(s,t,r,i=420)=>{const d=Math.max(0,t-i),o=t+r+i,l=[];let c=0;return s.forEach(p=>{const h=c;h+p.height>=d&&h<=o&&l.push({item:p,top:h}),c+=p.height}),{totalHeight:c,visible:l}},v=s=>s.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;"),q=s=>String(s??""),ae=s=>s==="Letter"?{widthMm:216,heightMm:279,cssSize:"Letter"}:{widthMm:210,heightMm:297,cssSize:"A4"},ce=s=>{const t=s.root.props??{},r=t.reportTitle??s.title??"未命名报告";return{...t,reportTitle:r,tocShow:t.tocShow??!0,coverEnabled:t.coverEnabled??!0,coverTitle:t.coverTitle??r,coverSubtitle:t.coverSubtitle??"Report",coverNote:t.coverNote??`生成时间：${new Date().toLocaleDateString()}`,summaryEnabled:t.summaryEnabled??!0,summaryTitle:t.summaryTitle??"执行摘要",summaryText:t.summaryText??"",headerShow:t.headerShow??!0,footerShow:t.footerShow??!0,headerText:t.headerText??r,footerText:t.footerText??"Visual Document OS",showPageNumber:t.showPageNumber??!0,pageSize:t.pageSize??"A4"}},le=s=>{const t=Math.max(2,Math.ceil(s.length/28));return Math.min(95,12+t*4.6)},de=s=>{const t=Math.max(2,Math.ceil(s.length/30));return Math.min(120,62+t*4.4)},he=s=>{const t=s.bindings.find(i=>i.role==="x"||i.role==="category"),r=s.bindings.find(i=>i.role==="y"||i.role==="value");return`字段: ${(t==null?void 0:t.field)??"-"} / ${(r==null?void 0:r.field)??"-"}`},me=(s,t,r)=>{var c,p;const i=(c=t.data)==null?void 0:c.sourceId;if(!i)return[];const d=(p=s.dataSources)==null?void 0:p.find(h=>h.id===i);if(!d||d.type!=="static"||!Array.isArray(d.staticData))return[];const o=d.staticData.filter(h=>!!h&&typeof h=="object"),l=J(o,r);return X(l,s.filters??[],t)},ue=s=>(s.root.children??[]).filter(r=>r.kind==="section").map((r,i)=>{var l;const d=q((l=r.props)==null?void 0:l.title)||`章节 ${i+1}`,o=(r.children??[]).map(c=>{var p;if(c.kind==="text")return{kind:"text",text:q((p=c.props)==null?void 0:p.text)};if(c.kind==="chart"){const h=c.props??{bindings:[]},j=me(s,c,h);return{kind:"chart",title:h.titleText??c.name??c.id,bindingHint:he(h),summary:G(h,j)}}return{kind:"other",text:`未导出块类型: ${c.kind}`}});return{id:r.id,title:d,blocks:o}}),pe=({sections:s,contentHeightMm:t,startPageNo:r})=>{const i=[],d=new Map;let o={pageNo:r,items:[]},l=0;const c=()=>{i.push(o),o={pageNo:o.pageNo+1,items:[]},l=0},p=h=>{l>0&&l+h>t&&c()};return s.forEach(h=>{p(12),d.has(h.id)||d.set(h.id,o.pageNo),o.items.push({kind:"section",title:h.title}),l+=12,h.blocks.forEach(w=>{const f=w.kind==="text"?le(w.text):w.kind==="chart"?de(w.summary):22;p(f),o.items.push({kind:"block",block:w}),l+=f})}),o.items.length>0&&i.push(o),{pages:i,sectionPageMap:d}},ge=s=>{if(s.length===0)return"本报告暂无章节内容。";const t=s.reduce((i,d)=>i+d.blocks.filter(o=>o.kind==="chart").length,0),r=s.reduce((i,d)=>i+d.blocks.filter(o=>o.kind==="text").length,0);return`本报告共 ${s.length} 个章节，包含 ${t} 张图表与 ${r} 段文本。建议优先关注峰值异常区间及后续处置动作。`},xe=s=>{if(s.kind==="section")return`<h2 class="section-title">${v(s.title)}</h2>`;const t=s.block;return t.kind==="text"?`<div class="text-block"><pre>${v(t.text)}</pre></div>`:t.kind==="chart"?`<div class="chart-block">
      <div class="chart-title">${v(t.title)}</div>
      <div class="chart-hint">${v(t.bindingHint)}</div>
      <div class="chart-summary">${v(t.summary)}</div>
    </div>`:`<div class="other-block">${v(t.text)}</div>`},I=({props:s,pageNo:t,body:r})=>{const i=s.headerShow?`<div class="page-header"><span>${v(s.headerText||s.reportTitle)}</span>${s.showPageNumber?`<span>Page ${t}</span>`:""}</div>`:"",d=s.footerShow?`<div class="page-footer"><span>${v(s.footerText||"Visual Document OS")}</span>${s.showPageNumber?`<span>#${t}</span>`:""}</div>`:"";return`<section class="page">
    ${i}
    <div class="page-body">${r}</div>
    ${d}
  </section>`},fe=s=>{const t=ce(s),r=ae(t.pageSize),i=t.headerShow?10:0,d=t.footerShow?10:0,o=r.heightMm-24-i-d,l=ue(s),c=Math.max(1,Math.floor((o-20)/6)),p=t.tocShow?Math.max(1,Math.ceil(l.length/c)):0,j=(t.coverEnabled?1:0)+p+1,{pages:w,sectionPageMap:f}=pe({sections:l,contentHeightMm:o,startPageNo:j}),S=[];let N=1;if(t.coverEnabled&&(S.push(I({props:t,pageNo:N,body:`<div class="cover">
          <h1>${v(t.coverTitle||t.reportTitle)}</h1>
          <p class="cover-subtitle">${v(t.coverSubtitle)}</p>
          <p class="cover-note">${v(t.coverNote)}</p>
        </div>`})),N+=1),t.tocShow)for(let k=0;k<p;k+=1){const R=`<div class="toc">
        <h2>目录</h2>
        ${l.slice(k*c,(k+1)*c).map((a,$)=>{const A=f.get(a.id)??"-";return`<div class="toc-row"><span>${v(`${k*c+$+1}. ${a.title}`)}</span><span>${A}</span></div>`}).join("")}
      </div>`;S.push(I({props:t,pageNo:N,body:R})),N+=1}if(w.forEach(k=>{S.push(I({props:t,pageNo:N,body:`<div class="content-page">${k.items.map(xe).join("")}</div>`})),N+=1}),t.summaryEnabled){const k=t.summaryText.trim()||ge(l);S.push(I({props:t,pageNo:N,body:`<div class="summary-page"><h2>${v(t.summaryTitle)}</h2><pre>${v(k)}</pre></div>`}))}const E=`
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
      min-height: ${Math.max(140,o-4)}mm;
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
  </html>`},be=s=>{if(typeof window>"u")return{ok:!1,message:"当前环境不支持浏览器导出"};const t=fe(s),r=window.open("","_blank","noopener,noreferrer");return r?(r.document.open(),r.document.write(t),r.document.close(),r.focus(),setTimeout(()=>{r.print()},180),{ok:!0,message:"已打开打印窗口，可选择“另存为 PDF”"}):{ok:!1,message:"浏览器拦截了弹窗，请允许后重试"}};function Me({doc:s}){const t=Y(),r=Z(t.selection),{engine:i,dataVersion:d}=K(s.dataSources??[],s.queries??[],{debounceMs:120}),o=(s.root.children??[]).filter(n=>n.kind==="section"),[l,c]=x.useState(!1),[p,h]=x.useState(""),[j,w]=x.useState({}),[f,S]=x.useState({}),N=x.useRef(null),[E,k]=x.useState(0),[H,R]=x.useState(620),a=x.useMemo(()=>we(s),[s]),$=x.useMemo(()=>Te(s),[s]),A=x.useMemo(()=>ke(a,o),[a,o]),b=(n,u,m=0)=>{t.executeCommand({type:"UpdateProps",nodeId:s.root.id,props:n},{summary:u,mergeWindowMs:m})},C=(n,u)=>{var T,P,V,O;const m=(P=(T=s.dataSources)==null?void 0:T[0])==null?void 0:P.id,g=(O=(V=s.queries)==null?void 0:V.find(W=>W.sourceId===m))==null?void 0:O.queryId,y=u==="text"?{id:M("text"),kind:"text",props:{text:"新段落",format:"plain"}}:u==="chart"?{id:M("chart"),kind:"chart",props:ne("新图表")}:{id:M("table"),kind:"table",data:m?{sourceId:m,queryId:g}:void 0,props:{titleText:"新表格",columns:[],repeatHeader:!0,zebra:!0}};t.executeCommand({type:"InsertNode",parentId:n.id,node:y},{summary:`insert ${u} into ${n.id}`})},B=(n,u)=>{const m=o.findIndex(y=>y.id===n);if(m<0)return;const g=m+u;g<0||g>=o.length||t.executeCommand({type:"MoveNode",nodeId:n,newParentId:s.root.id,newIndex:g},{summary:"reorder section"})},D=x.useMemo(()=>{const n=[];let u=0;return a.coverEnabled&&(u+=1,n.push({kind:"cover",key:"report_cover",pageIndex:u,height:f.report_cover??340})),a.tocShow&&(u+=1,n.push({kind:"toc",key:"report_toc",pageIndex:u,height:f.report_toc??260})),o.forEach((m,g)=>{u+=1;const y=u;n.push({kind:"section-header",key:`section_header_${m.id}`,section:m,sectionIndex:g,pageIndex:y,height:f[`section_header_${m.id}`]??96}),(m.children??[]).forEach(T=>{const P=`block_${T.id}`;n.push({kind:"block",key:P,section:m,block:T,pageIndex:y,height:f[P]??Se(T)})}),n.push({kind:"quick-insert",key:`insert_${m.id}`,section:m,pageIndex:y,height:f[`insert_${m.id}`]??82})}),a.summaryEnabled&&(u+=1,n.push({kind:"summary",key:"report_summary",pageIndex:u,height:f.report_summary??260})),n},[f,a.coverEnabled,a.summaryEnabled,a.tocShow,o]);x.useEffect(()=>{const n=N.current;if(!n)return;const u=()=>R(n.clientHeight);if(u(),typeof ResizeObserver>"u")return;const m=new ResizeObserver(u);return m.observe(n),()=>m.disconnect()},[]);const{totalHeight:F,visible:L}=x.useMemo(()=>ie(D,E,H,420),[D,E,H]),_=n=>j[n]??"/",Q=(n,u)=>{w(m=>({...m,[n]:u}))},U=x.useCallback((n,u)=>{S(m=>{const g=m[n];return g!==void 0&&Math.abs(g-u)<2?m:{...m,[n]:u}})},[]);return e.jsxs("div",{className:"col",style:{height:"100%"},children:[e.jsxs("div",{className:"row",style:{justifyContent:"space-between"},children:[e.jsxs("div",{className:"row",children:[e.jsx("span",{className:"chip",children:a.reportTitle}),e.jsxs("span",{className:"chip",children:["章节 ",o.length]}),e.jsxs("span",{className:"chip",children:["页 ",Math.max(1,Ne(a,o.length))]}),p?e.jsx("span",{className:"chip",children:p}):null]}),e.jsxs("div",{className:"row",children:[e.jsx("button",{className:"btn",onClick:()=>{const n=be(s);h(n.message),setTimeout(()=>h(""),3e3)},children:"导出 PDF"}),e.jsx("button",{className:`btn ${l?"primary":""}`,onClick:()=>c(n=>!n),children:"报告结构"}),e.jsx("button",{className:"btn",onClick:()=>t.executeCommand({type:"InsertNode",parentId:s.root.id,node:{id:M("section"),kind:"section",props:{title:`章节 ${o.length+1}`},children:[]}},{summary:"add section"}),children:"+章节"})]})]}),l?e.jsxs("div",{className:"col",style:{border:"1px solid var(--line)",borderRadius:10,padding:8},children:[e.jsxs("div",{className:"row",style:{justifyContent:"space-between"},children:[e.jsx("strong",{children:"封面 / 总结 / 页眉页脚"}),e.jsx("button",{className:"btn",onClick:()=>b({summaryText:$},"refresh auto summary"),children:"刷新自动总结"})]}),e.jsxs("div",{className:"row",children:[e.jsxs("label",{className:"row",children:[e.jsx("input",{type:"checkbox",checked:a.tocShow,onChange:n=>b({tocShow:n.target.checked},"toggle toc")}),e.jsx("span",{children:"目录页"})]}),e.jsxs("label",{className:"row",children:[e.jsx("input",{type:"checkbox",checked:a.coverEnabled,onChange:n=>b({coverEnabled:n.target.checked},"toggle cover")}),e.jsx("span",{children:"封面页"})]}),e.jsxs("label",{className:"row",children:[e.jsx("input",{type:"checkbox",checked:a.summaryEnabled,onChange:n=>b({summaryEnabled:n.target.checked},"toggle summary")}),e.jsx("span",{children:"总结页"})]}),e.jsxs("label",{className:"row",children:[e.jsx("input",{type:"checkbox",checked:!!a.headerShow,onChange:n=>b({headerShow:n.target.checked},"toggle header")}),e.jsx("span",{children:"页眉"})]}),e.jsxs("label",{className:"row",children:[e.jsx("input",{type:"checkbox",checked:!!a.footerShow,onChange:n=>b({footerShow:n.target.checked},"toggle footer")}),e.jsx("span",{children:"页脚"})]}),e.jsxs("label",{className:"row",children:[e.jsx("input",{type:"checkbox",checked:a.showPageNumber,onChange:n=>b({showPageNumber:n.target.checked},"toggle page number")}),e.jsx("span",{children:"页码"})]})]}),e.jsxs("div",{className:"row",children:[e.jsxs("label",{className:"col",style:{flex:1},children:[e.jsx("span",{children:"报告标题"}),e.jsx("input",{className:"input",value:a.reportTitle,onChange:n=>b({reportTitle:n.target.value},"edit report title",160)})]}),e.jsxs("label",{className:"col",style:{width:180},children:[e.jsx("span",{children:"纸张"}),e.jsxs("select",{className:"select",value:typeof a.pageSize=="string"?a.pageSize:"A4",onChange:n=>b({pageSize:n.target.value},"change page size"),children:[e.jsx("option",{value:"A4",children:"A4"}),e.jsx("option",{value:"Letter",children:"Letter"})]})]})]}),e.jsxs("div",{className:"row",children:[e.jsxs("label",{className:"col",style:{flex:1},children:[e.jsx("span",{children:"封面主标题"}),e.jsx("input",{className:"input",value:a.coverTitle,onChange:n=>b({coverTitle:n.target.value},"edit cover title",160)})]}),e.jsxs("label",{className:"col",style:{flex:1},children:[e.jsx("span",{children:"封面副标题"}),e.jsx("input",{className:"input",value:a.coverSubtitle,onChange:n=>b({coverSubtitle:n.target.value},"edit cover subtitle",160)})]})]}),e.jsxs("div",{className:"row",children:[e.jsxs("label",{className:"col",style:{flex:1},children:[e.jsx("span",{children:"页眉文案"}),e.jsx("input",{className:"input",value:a.headerText,onChange:n=>b({headerText:n.target.value},"edit header text",160)})]}),e.jsxs("label",{className:"col",style:{flex:1},children:[e.jsx("span",{children:"页脚文案"}),e.jsx("input",{className:"input",value:a.footerText,onChange:n=>b({footerText:n.target.value},"edit footer text",160)})]})]}),e.jsxs("label",{className:"col",children:[e.jsx("span",{children:"总结页标题"}),e.jsx("input",{className:"input",value:a.summaryTitle,onChange:n=>b({summaryTitle:n.target.value},"edit summary title",160)})]}),e.jsxs("label",{className:"col",children:[e.jsx("span",{children:"总结内容"}),e.jsx("textarea",{className:"textarea",value:a.summaryText,onChange:n=>b({summaryText:n.target.value},"edit summary text",160)})]}),e.jsxs("div",{className:"muted",style:{fontSize:12},children:["自动总结建议：",$]})]}):null,e.jsxs("div",{ref:N,className:"col",style:{overflow:"auto",minHeight:0,paddingRight:4,position:"relative"},onScroll:n=>k(n.currentTarget.scrollTop),children:[D.length===0?e.jsx("div",{className:"muted",children:"暂无章节内容"}):null,e.jsx("div",{style:{position:"relative",minHeight:F},children:L.map(({item:n,top:u})=>{var m;return e.jsxs(ye,{entryKey:n.key,onHeight:U,style:{position:"absolute",left:0,right:0,top:u,paddingBottom:8},children:[n.kind==="cover"?e.jsx(z,{props:a,pageIndex:n.pageIndex,children:e.jsxs("div",{className:"col",style:{minHeight:240,justifyContent:"center",alignItems:"center",textAlign:"center"},children:[e.jsx("div",{style:{fontSize:30,fontWeight:700},children:a.coverTitle||a.reportTitle}),e.jsx("div",{className:"muted",style:{fontSize:16},children:a.coverSubtitle}),e.jsx("div",{className:"muted",style:{marginTop:14},children:a.coverNote||`生成时间：${new Date().toLocaleDateString()}`})]})}):null,n.kind==="toc"?e.jsx(z,{props:a,pageIndex:n.pageIndex,children:e.jsxs("div",{className:"section",children:[e.jsx("div",{className:"section-title",children:"目录"}),e.jsxs("div",{className:"block",style:{margin:0},children:[o.length===0?e.jsx("div",{className:"muted",children:"暂无章节"}):null,o.map((g,y)=>{var T;return e.jsxs("div",{className:"row",style:{justifyContent:"space-between",borderBottom:"1px dashed var(--line)",padding:"6px 0"},children:[e.jsx("span",{children:`${y+1}. ${String(((T=g.props)==null?void 0:T.title)??`章节 ${y+1}`)}`}),e.jsxs("span",{className:"muted",children:["Page ",A.get(g.id)??"-"]})]},g.id)})]})]})}):null,n.kind==="section-header"?e.jsx(z,{props:a,pageIndex:n.pageIndex,children:e.jsx("div",{className:"section",children:e.jsxs("div",{className:"section-title row",style:{justifyContent:"space-between"},children:[e.jsxs("div",{className:"row",children:[e.jsx("span",{children:String(((m=n.section.props)==null?void 0:m.title)??`章节 ${n.sectionIndex+1}`)}),e.jsx("span",{className:"muted",children:n.section.id})]}),e.jsxs("div",{className:"row",children:[e.jsx("button",{className:"btn",onClick:()=>B(n.section.id,-1),children:"上移"}),e.jsx("button",{className:"btn",onClick:()=>B(n.section.id,1),children:"下移"}),e.jsx("button",{className:"btn",onClick:()=>C(n.section,"text"),children:"+文本"}),e.jsx("button",{className:"btn",onClick:()=>C(n.section,"chart"),children:"+图表"}),e.jsx("button",{className:"btn",onClick:()=>C(n.section,"table"),children:"+表格"})]})]})})}):null,n.kind==="block"?e.jsx(ve,{doc:s,block:n.block,selected:r.selectedIds.includes(n.block.id),onSelect:g=>t.setSelection(n.block.id,g),engine:i,dataVersion:d,lazyRootRef:N,onQuickChartPatch:(g,y)=>t.executeCommand({type:"UpdateProps",nodeId:n.block.id,props:g},{summary:y})}):null,n.kind==="quick-insert"?e.jsx("div",{className:"block",children:e.jsxs("div",{className:"row",style:{justifyContent:"space-between"},children:[e.jsx("input",{className:"input",value:_(n.section.id),onChange:g=>Q(n.section.id,g.target.value),placeholder:"输入 /chart /table 或 /text"}),e.jsx("button",{className:"btn",onClick:()=>{const g=_(n.section.id).trim();if(g==="/chart"){C(n.section,"chart");return}if(g==="/table"){C(n.section,"table");return}C(n.section,"text")},children:"快捷插入"})]})}):null,n.kind==="summary"?e.jsx(z,{props:a,pageIndex:n.pageIndex,children:e.jsxs("div",{className:"section",children:[e.jsx("div",{className:"section-title",children:a.summaryTitle}),e.jsx("div",{className:"block",style:{margin:0},children:e.jsx("pre",{style:{margin:0,whiteSpace:"pre-wrap"},children:a.summaryText||$})})]})}):null]},n.key)})})]})]})}function ve({doc:s,block:t,selected:r,onSelect:i,engine:d,dataVersion:o,lazyRootRef:l,onQuickChartPatch:c}){var f;const{rows:p,loading:h,error:j}=ee(s,t,d,o),w=r?{borderColor:"#2563eb",boxShadow:"0 0 0 2px rgba(37, 99, 235, .2)"}:void 0;return e.jsx("div",{className:"block",style:w,onClick:S=>i(S.ctrlKey||S.metaKey),children:t.kind==="text"?e.jsx("pre",{style:{margin:0,whiteSpace:"pre-wrap"},children:String(((f=t.props)==null?void 0:f.text)??"")}):t.kind==="table"?h?e.jsx("div",{className:"muted",children:"loading..."}):j?e.jsxs("div",{className:"muted",children:["error: ",j]}):e.jsx(te,{spec:t.props,rows:p,height:260}):t.kind==="chart"?h?e.jsx("div",{className:"muted",children:"loading..."}):j?e.jsxs("div",{className:"muted",children:["error: ",j]}):e.jsx("div",{className:"col",children:e.jsx(je,{rootRef:l,height:260,children:e.jsxs("div",{style:{width:"100%",height:260,position:"relative"},children:[e.jsx("div",{style:{position:"absolute",top:6,right:6,zIndex:5},children:e.jsx(re,{doc:s,node:t,rows:p,compact:!0})}),r?e.jsx("div",{style:{position:"absolute",top:6,left:6,zIndex:5},children:e.jsx(oe,{spec:t.props,onPatch:c})}):null,e.jsx(se,{spec:t.props,rows:p,height:260})]})})}):e.jsxs("div",{className:"muted",children:["暂未支持的块类型: ",t.kind]})})}function je({rootRef:s,height:t,children:r}){const i=x.useRef(null),[d,o]=x.useState(!1);return x.useEffect(()=>{if(d)return;const l=i.current;if(!l)return;if(typeof IntersectionObserver>"u"){o(!0);return}const c=new IntersectionObserver(p=>{p.some(h=>h.isIntersecting)&&(o(!0),c.disconnect())},{root:s.current,rootMargin:"220px"});return c.observe(l),()=>c.disconnect()},[d,s]),e.jsx("div",{ref:i,style:{minHeight:t},children:d?r:e.jsx("div",{className:"muted",style:{height:t,display:"flex",alignItems:"center",justifyContent:"center"},children:"图表离屏，滚动到可视区后加载"})})}function ye({entryKey:s,onHeight:t,style:r,children:i}){const d=x.useRef(null);return x.useEffect(()=>{const o=d.current;if(!o)return;const l=()=>t(s,o.getBoundingClientRect().height);if(l(),typeof ResizeObserver>"u")return;const c=new ResizeObserver(l);return c.observe(o),()=>c.disconnect()},[s,t]),e.jsx("div",{ref:d,style:r,children:i})}function z({props:s,pageIndex:t,children:r}){return e.jsxs("div",{className:"report-page-frame",children:[s.headerShow?e.jsxs("div",{className:"report-page-header row",style:{justifyContent:"space-between"},children:[e.jsx("span",{children:s.headerText||s.reportTitle}),s.showPageNumber?e.jsxs("span",{className:"muted",children:["Page ",t]}):null]}):null,e.jsx("div",{className:"report-page-body",children:r}),s.footerShow?e.jsxs("div",{className:"report-page-footer row",style:{justifyContent:"space-between"},children:[e.jsx("span",{className:"muted",children:s.footerText||"Visual Document OS"}),s.showPageNumber?e.jsxs("span",{className:"muted",children:["#",t]}):null]}):null]})}const we=s=>{const t=s.root.props??{},r=t.reportTitle??s.title??"未命名报告";return{...t,reportTitle:r,tocShow:t.tocShow??!0,coverEnabled:t.coverEnabled??!0,coverTitle:t.coverTitle??r,coverSubtitle:t.coverSubtitle??"Report",coverNote:t.coverNote??`生成时间：${new Date().toLocaleDateString()}`,summaryEnabled:t.summaryEnabled??!0,summaryTitle:t.summaryTitle??"执行摘要",summaryText:t.summaryText??"",headerText:t.headerText??r,footerText:t.footerText??"Visual Document OS",showPageNumber:t.showPageNumber??!0,pageSize:t.pageSize??"A4"}},Ne=(s,t)=>t+(s.coverEnabled?1:0)+(s.tocShow?1:0)+(s.summaryEnabled?1:0),ke=(s,t)=>{let r=0;s.coverEnabled&&(r+=1),s.tocShow&&(r+=1);const i=new Map;return t.forEach(d=>{r+=1,i.set(d.id,r)}),i},Se=s=>{var t;if(s.kind==="chart")return 332;if(s.kind==="text"){const r=String(((t=s.props)==null?void 0:t.text)??"");return 72+Math.max(2,Math.min(8,Math.ceil(r.length/30)))*20}return 150},Te=s=>{const t=(s.root.children??[]).filter(o=>o.kind==="section"),r=t.reduce((o,l)=>o+(l.children??[]).filter(c=>c.kind==="chart").length,0),i=t.reduce((o,l)=>o+(l.children??[]).filter(c=>c.kind==="text").length,0),d=t.map(o=>{var l;return String(((l=o.props)==null?void 0:l.title)??"未命名章节")}).slice(0,3).join("、");return t.length===0?"报告暂无章节，建议先新增章节并补充关键图表。":`本报告共 ${t.length} 个章节，包含 ${r} 张图表与 ${i} 段文本。重点章节：${d}。建议优先核对峰值异常与对应处置动作。`};export{Me as ReportEditor};
