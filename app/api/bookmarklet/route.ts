import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ensureGradescopeSyncToken } from '@/lib/prefs';

// Returns the bookmarklet JS source (text/javascript) for the *current
// authenticated user*, with their sync token embedded. The Settings UI
// builds a draggable `javascript:` URL from this body.
//
// Bookmarklet behavior:
//   - Runs in the user's authenticated Gradescope tab.
//   - Walks the assignments table on the current course page.
//   - Extracts (title, due_at, external_id, external_url) per row.
//   - POSTs to /api/sync/gradescope with the embedded token.
//   - Renders a small floating toast with the result.
//
// Robust to no-data: if it can't find the assignments table, the toast
// reports `selectors_failed` so the user knows to ping us.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse('unauthenticated', { status: 401 });

  const token = await ensureGradescopeSyncToken(supabase, user.id);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

  // Embedded as a string-only template; downstream wraps in `javascript:`.
  const js = makeBookmarklet({ appUrl, token });
  return new NextResponse(js, {
    status: 200,
    headers: { 'Content-Type': 'application/javascript; charset=utf-8' },
  });
}

interface BookmarkletOpts {
  appUrl: string;
  token: string;
}

function makeBookmarklet({ appUrl, token }: BookmarkletOpts): string {
  // The IIFE is intentionally written terse — bookmarklet URL length matters.
  // Comments stripped client-side via the Settings UI's URL builder.
  return `(async()=>{const TOKEN=${JSON.stringify(token)};const APP=${JSON.stringify(appUrl)};
function toast(msg,bad){const d=document.createElement('div');d.textContent=msg;Object.assign(d.style,{position:'fixed',bottom:'16px',right:'16px',padding:'10px 14px',background:bad?'#d94a38':'#1a1a1a',color:'#fff',font:'13px ui-sans-serif,system-ui',borderRadius:'6px',zIndex:99999,boxShadow:'0 4px 12px rgba(0,0,0,.2)'});document.body.appendChild(d);setTimeout(()=>d.remove(),5000);}
try{const courseEl=document.querySelector('.courseHeader--titleAndInstructor h1, .courseHeader__title, h1.courseTitle, header h1');const courseName=(courseEl?courseEl.textContent:document.title).trim().split(/\\s{2,}|\\n/)[0].slice(0,120);
const rows=document.querySelectorAll('table.js-rosterTable tbody tr, table.assignments tbody tr, table#assignments-student-table tbody tr');if(!rows.length){toast('Sync failed: could not find assignments table',true);return;}
const items=[];rows.forEach(tr=>{const link=tr.querySelector('a[href*="/assignments/"]');if(!link)return;const href=link.getAttribute('href')||'';const m=href.match(/\\/assignments\\/(\\d+)/);if(!m)return;const courseM=href.match(/\\/courses\\/(\\d+)/);const externalId='gs:'+(courseM?courseM[1]:'0')+':'+m[1];const title=link.textContent.trim();
let dueAt=null;tr.querySelectorAll('time, [datetime]').forEach(el=>{const dt=el.getAttribute('datetime');if(dt&&!dueAt){const d=new Date(dt);if(!isNaN(d))dueAt=d.toISOString();}});
if(!dueAt)return;items.push({externalId,title,dueAt,externalUrl:new URL(href,location.origin).toString()});});
if(!items.length){toast('No assignments found on this page',true);return;}
const r=await fetch(APP+'/api/sync/gradescope',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:TOKEN,courseName,assignments:items})});
const j=await r.json().catch(()=>({}));if(!r.ok){toast('Sync failed: '+(j.error||r.status),true);return;}
toast('Synced '+j.inserted+' new, '+j.updated+' updated · '+courseName);}catch(e){toast('Sync error: '+(e&&e.message||e),true);}})();`.replace(/\n/g, '');
}
