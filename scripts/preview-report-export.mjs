import fs from "node:fs";
import path from "node:path";
import { createServer } from "node:http";
import { build } from "esbuild";
const dir = path.resolve(".wrangler/report-export-test");
fs.mkdirSync(dir, { recursive: true });
const entry = `import Dashboard from '../../components/dashboard';import React,{useRef,useState} from 'react';import{createRoot}from'react-dom/client';import ReportCalendar from '../../components/report-calendar';import TimelinePicker from '../../components/timeline-picker';import{exportReportPdf}from'../../lib/export-report-pdf';import{todayKey,addDays}from'../../lib/timeline';const today=todayKey();function App(){const ref=useRef(null),[state,setState]=useState(''),[range,setRange]=useState([today,addDays(today,8)]);const tasks=[{id:'1',name:'ออกแบบหน้า Dashboard ใหม่',assignees:[0],status:1,project:'Design',custom:{timeline:range}},{id:'2',name:'ทดสอบระบบและสรุปผล',assignees:[1],status:2,project:'Development',custom:{timeline:[addDays(today,2),addDays(today,12)]}}];return <main style={{margin:0,width:'100%'}}><div className="content" ref={ref}><div className="heading"><div><h1>สรุปผลงาน</h1><p>ตัวอย่างรายงานสำหรับตรวจ PDF · ไม่มีข้อมูลบัญชีจริง</p></div><button data-pdf-exclude="true" onClick={async()=>{setState('กำลังสร้าง');try{await exportReportPdf(ref.current);setState('สร้าง PDF แล้ว');}catch(e){setState('ERROR '+e.message);}}}>Export PDF</button></div><div className="stats">{['งานทั้งหมด','เสร็จเรียบร้อย','กำลังดำเนินการ','งานที่ติดปัญหา'].map((s,i)=><div className="stat" key={s}><div className="stathead">{s}</div><div className="statnum">{i===0?8:i===1?5:i===2?2:1}</div></div>)}</div><div className="grid"><div className="card"><h2>ผลงานของแต่ละคน</h2><div className="chart"><div className="plot">{['ธนกร','พิมพ์ชนก','ณัฐวุฒิ','ศิริพร'].map((p,i)=><div className="barwrap" key={p}><div className="bar" style={{height:(40+i*10)+'%',background:['#ffb547','#5da5ff','#41d9ad','#be8cff'][i]}}/><span className="barlabel">{p}</span></div>)}</div></div></div><div className="card"><h2>สถานะงานโดยรวม</h2><div className="donut" style={{background:'conic-gradient(#18ac89 0 67%,#d79722 67% 100%)',margin:'40px auto'}}><div className="donutinner">67%</div></div></div></div><ReportCalendar tasks={tasks} columns={[{id:'timeline',name:'ช่วงเวลา',type:'timeline'}]} layout={{order:[],hidden:[],overrides:{},calendarFields:['name','project']}} people={['ธนกร','พิมพ์ชนก']}/><footer className="pagefooter">Workly report</footer></div><div role="status">{state}</div><div style={{padding:20,width:350}}><TimelinePicker label="ช่วงเวลาทดสอบ" value={range} disabled={false} onChange={setRange}/></div></main>}createRoot(document.getElementById('root')).render(['/board','/reports-preview'].includes(location.pathname)?<Dashboard view={location.pathname==='/board'?'board':'reports'} user={{id:'local-preview',memberId:0,name:'Preview',email:'preview@example.test',role:'admin'}}/>:<App/>);`;
const entryFile = path.join(dir, "entry.tsx");
fs.writeFileSync(entryFile, entry);
await build({
  entryPoints: [entryFile],
  bundle: true,
  format: "esm",
  platform: "browser",
  jsx: "automatic",
  outfile: path.join(dir, "preview.js"),
  alias: { "@": path.resolve(".") },
  define: {
    "process.env.NODE_ENV": '"production"',
    "process.env": '{"NODE_ENV":"production"}',
  },
});
fs.writeFileSync(
  path.join(dir, "style.css"),
  fs
    .readFileSync("app/globals.css", "utf8")
    .replace('@import "tailwindcss";', ""),
);
const html =
  '<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><body><div id="root"></div><script type="module" src="/preview.js"></script></body></html>';
const server = createServer((req, res) => {
  if (/^\/api\/tasks\/[^/]+\/updates/.test(req.url)) {
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        items: [
          {
            id: "preview-update",
            body: "**ความคืบหน้า**\n- ตรวจสอบระบบเรียบร้อย",
            created_at: 1793318400000,
            updated_at: 1793318400000,
            authorName: "สมาชิกตัวอย่าง",
            avatarUrl: null,
            isAdmin: false,
            canEdit: false,
            images: [],
          },
        ],
        nextCursor: null,
      }),
    );
    return;
  }
  if (req.url === "/api/workspace") {
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        members: [{ id: 0, name: "สมาชิกตัวอย่าง" }],
        tasks: [
          {
            id: "preview-task",
            name: "งานทดสอบรูปแบบสถานะ",
            assignees: [0],
            person: 0,
            status: 2,
            date: "2026-10-30",
            priority: "สูง",
            project: "Design",
            hours: 6,
            group_id: "todo",
            custom: { timeline: ["2026-10-21", "2026-10-29"] },
          },
        ],
        columns: [{ id: "timeline", name: "dateline", type: "timeline" }],
        attachments: [],
        groups: [],
        layout: {
          order: [
            "name",
            "assignees",
            "status",
            "date",
            "timeline",
            "priority",
            "project",
            "hours",
            "images",
          ],
          hidden: [],
          overrides: {
            date: { id: "date", name: "เสร็จงาน", type: "date" },
            hours: { id: "hours", name: "ชิ้น", type: "number" },
          },
          groupNames: { todo: "งานที่กำลังทำ" },
        },
      }),
    );
    return;
  }
  if (
    req.url === "/" ||
    req.url === "/board" ||
    req.url === "/reports-preview"
  ) {
    res.setHeader("Content-Type", "text/html;charset=utf-8");
    res.end(html);
    return;
  }
  const name =
    req.url === "/preview.js"
      ? "preview.js"
      : req.url === "/style.css"
        ? "style.css"
        : null;
  if (!name) {
    res.writeHead(404);
    res.end();
    return;
  }
  res.setHeader(
    "Content-Type",
    name.endsWith(".js") ? "application/javascript" : "text/css",
  );
  res.end(fs.readFileSync(path.join(dir, name)));
});
server.listen(3004, "127.0.0.1", () =>
  console.log(
    "Disposable PDF/Timeline preview at http://127.0.0.1:3004 (no accounts or database writes).",
  ),
);
