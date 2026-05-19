// Applications views + Quick-add + Settings + Mobile

function AppsA() {
  // Kanban by stage
  const stages = [
    { key: "applied", label: "applied", color: INK_SOFT },
    { key: "interview", label: "interviewing", color: ACCENT_BLUE },
    { key: "offer", label: "offer", color: ACCENT_GREEN },
    { key: "rejected", label: "rejected", color: INK_FAINT },
  ];
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <AppNav active="applications" />
      <div style={{ padding: "14px 18px", flex: 1, overflow: "hidden" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
          <span style={{ fontFamily: "'Caveat', cursive", fontSize: 26 }}>internships</span>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: INK_FAINT }}>7 active · 1 offer</span>
        </div>
        <div style={{ display: "flex", gap: 10, height: "calc(100% - 46px)" }}>
          {stages.map((s) => {
            const items = SAMPLE_APPS.filter((a) => a.stage === s.key);
            return (
              <div key={s.key} style={{ flex: 1, background: PAPER_DIM, padding: 8, borderRadius: 2, display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", paddingBottom: 4, borderBottom: `2px solid ${s.color}` }}>
                  <span style={{ fontFamily: "'Patrick Hand', cursive", fontSize: 16 }}>{s.label}</span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: INK_FAINT }}>{items.length}</span>
                </div>
                {items.map((a) => (
                  <SketchBox key={a.id} style={{ padding: "8px 10px", background: PAPER }}>
                    <div style={{ fontFamily: "'Patrick Hand', cursive", fontSize: 16, fontWeight: 600 }}>{a.company}</div>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: INK_SOFT, marginTop: 2 }}>{a.role}</div>
                    {a.next && (
                      <div style={{ marginTop: 6, paddingTop: 6, borderTop: `1px dashed ${INK_FAINT}` }}>
                        <div style={{ fontFamily: "'Caveat', cursive", fontSize: 13, color: INK_FAINT }}>next:</div>
                        <div style={{ fontFamily: "'Patrick Hand', cursive", fontSize: 12 }}>{a.next}</div>
                        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: a.nextRel && a.nextRel.includes("1 day") ? URGENT : INK_FAINT }}>{a.nextRel}</div>
                      </div>
                    )}
                  </SketchBox>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function AppsB() {
  // Timeline by next action
  const sorted = [...SAMPLE_APPS].filter((a) => a.next).sort((a, b) => (a.nextRel || "").localeCompare(b.nextRel || ""));
  const stageBadge = (s) => ({
    applied: { label: "applied", color: INK_SOFT },
    interview: { label: "interview", color: ACCENT_BLUE },
    offer: { label: "offer", color: ACCENT_GREEN },
    rejected: { label: "rejected", color: INK_FAINT },
  }[s]);
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <AppNav active="applications" />
      <div style={{ padding: "16px 24px", flex: 1, overflow: "hidden" }}>
        <div style={{ fontFamily: "'Caveat', cursive", fontSize: 26, marginBottom: 10 }}>up next</div>
        <div style={{ position: "relative", paddingLeft: 30 }}>
          <div style={{ position: "absolute", left: 10, top: 6, bottom: 6, borderLeft: `1.5px solid ${INK}` }} />
          {sorted.map((a, i) => {
            const b = stageBadge(a.stage);
            return (
              <div key={a.id} style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 14, position: "relative" }}>
                <div style={{ position: "absolute", left: -24, top: 8, width: 10, height: 10, borderRadius: "50%", background: i === 0 ? URGENT : PAPER, border: `1.5px solid ${INK}` }} />
                <div style={{ width: 120, fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: i === 0 ? URGENT : INK_SOFT, paddingTop: 8 }}>
                  {a.next.split(" — ")[0]}
                  <div style={{ color: INK_FAINT, fontSize: 10, marginTop: 2 }}>{a.nextRel}</div>
                </div>
                <SketchBox style={{ flex: 1, padding: "10px 14px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <div>
                      <span style={{ fontFamily: "'Patrick Hand', cursive", fontSize: 18, fontWeight: 600 }}>{a.company}</span>
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: INK_SOFT, marginLeft: 10 }}>{a.role}</span>
                    </div>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: b.color, border: `1px solid ${b.color}`, padding: "1px 6px", textTransform: "uppercase", letterSpacing: 0.5 }}>{b.label}</span>
                  </div>
                  <div style={{ fontFamily: "'Patrick Hand', cursive", fontSize: 14, color: INK_SOFT, marginTop: 4 }}>{a.next.split(" — ")[1]}</div>
                </SketchBox>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function AppsC() {
  // Compact table
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <AppNav active="applications" />
      <div style={{ padding: "16px 24px", flex: 1, overflow: "hidden" }}>
        <div style={{ fontFamily: "'Caveat', cursive", fontSize: 26, marginBottom: 10 }}>internships — table</div>
        <div style={{ border: `1px solid ${INK}` }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1.5fr 120px 1.5fr 90px", background: PAPER_DIM, padding: "6px 10px", borderBottom: `1px solid ${INK}`, fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: INK_SOFT, letterSpacing: 0.5 }}>
            <span>COMPANY</span><span>ROLE</span><span>STAGE</span><span>NEXT ACTION</span><span>WHEN</span>
          </div>
          {SAMPLE_APPS.map((a) => (
            <div key={a.id} style={{ display: "grid", gridTemplateColumns: "1.2fr 1.5fr 120px 1.5fr 90px", padding: "8px 10px", borderBottom: `1px solid ${PAPER_DIM}`, alignItems: "center", opacity: a.stage === "rejected" ? 0.5 : 1 }}>
              <span style={{ fontFamily: "'Patrick Hand', cursive", fontSize: 16, fontWeight: 600 }}>{a.company}</span>
              <span style={{ fontFamily: "'Patrick Hand', cursive", fontSize: 14, color: INK_SOFT }}>{a.role}</span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, color: a.stage === "offer" ? ACCENT_GREEN : a.stage === "interview" ? ACCENT_BLUE : INK_SOFT }}>● {a.stage}</span>
              <span style={{ fontFamily: "'Patrick Hand', cursive", fontSize: 13 }}>{a.next || "—"}</span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: a.nextRel && a.nextRel.includes("1 day") ? URGENT : INK_FAINT }}>{a.nextRel || "—"}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AppsD() {
  // Sankey/funnel — visual pipeline
  const counts = { applied: 3, interview: 2, offer: 1, rejected: 1 };
  const total = 7;
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <AppNav active="applications" />
      <div style={{ padding: "20px 28px", flex: 1, overflow: "hidden" }}>
        <div style={{ fontFamily: "'Caveat', cursive", fontSize: 26, marginBottom: 14 }}>pipeline funnel</div>
        <div style={{ display: "flex", gap: 4, alignItems: "flex-end", height: 180, borderBottom: `1.5px solid ${INK}`, paddingBottom: 2 }}>
          {[
            { k: "applied", c: INK_SOFT },
            { k: "interview", c: ACCENT_BLUE },
            { k: "offer", c: ACCENT_GREEN },
            { k: "rejected", c: INK_FAINT },
          ].map((s) => (
            <div key={s.k} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <div style={{ fontFamily: "'Caveat', cursive", fontSize: 22 }}>{counts[s.k]}</div>
              <div style={{
                width: "70%", height: `${(counts[s.k] / total) * 140}px`,
                background: s.c, border: `1.5px solid ${INK}`,
                backgroundImage: "repeating-linear-gradient(-45deg, transparent 0 4px, rgba(255,255,255,0.2) 4px 5px)",
              }} />
              <div style={{ fontFamily: "'Patrick Hand', cursive", fontSize: 14 }}>{s.k}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 16, display: "flex", gap: 10 }}>
          <SketchBox style={{ flex: 1, padding: 12 }}>
            <div style={{ fontFamily: "'Caveat', cursive", fontSize: 18, color: URGENT }}>this week</div>
            <div style={{ fontFamily: "'Patrick Hand', cursive", fontSize: 14, lineHeight: 1.3, marginTop: 4 }}>
              · Cisco tech screen — Thu 2pm<br/>
              · Anthropic OA — by Apr 30
            </div>
          </SketchBox>
          <SketchBox style={{ flex: 1, padding: 12 }}>
            <div style={{ fontFamily: "'Caveat', cursive", fontSize: 18 }}>response rate</div>
            <div style={{ fontFamily: "'Patrick Hand', cursive", fontSize: 28, marginTop: 4 }}>43%</div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: INK_FAINT }}>3 of 7 got screens</div>
          </SketchBox>
          <SketchBox style={{ flex: 1, padding: 12 }}>
            <div style={{ fontFamily: "'Caveat', cursive", fontSize: 18 }}>decision due</div>
            <div style={{ fontFamily: "'Patrick Hand', cursive", fontSize: 16, marginTop: 4 }}>Palantir offer</div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: URGENT }}>May 3 — 9 days left</div>
          </SketchBox>
        </div>
      </div>
    </div>
  );
}

// Quick-add interaction — 4 states side by side
function QuickAddFlow() {
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: PAPER }}>
      <AppNav />
      <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ fontFamily: "'Caveat', cursive", fontSize: 24 }}>quick-add flow — 4 states</div>

        {/* State 1: empty */}
        <div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: INK_FAINT, marginBottom: 4 }}>① EMPTY</div>
          <SketchBox style={{ padding: "12px 16px" }}>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: INK_FAINT }}>type a deadline...  e.g. "STA 240 HW5 due Friday 11:59pm"</span>
          </SketchBox>
        </div>

        {/* State 2: typing — live preview */}
        <div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: INK_FAINT, marginBottom: 4 }}>② TYPING — live parse preview</div>
          <SketchBox thick style={{ padding: "12px 16px" }}>
            <div style={{ fontFamily: "'Patrick Hand', cursive", fontSize: 18 }}>
              <span style={{ background: COURSE_COLORS.indigo + "40", padding: "0 3px" }}>STA 240</span>{" "}
              <span>HW5</span>{" "}
              <span style={{ color: INK_SOFT }}>due</span>{" "}
              <span style={{ background: URGENT + "30", padding: "0 3px" }}>Friday 11:59pm</span>
              <span style={{ color: INK_FAINT, borderLeft: `1px solid ${INK}`, marginLeft: 2, height: 20, display: "inline-block" }}></span>
            </div>
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px dashed ${INK_FAINT}`, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <CourseChip code="STA 240" color={COURSE_COLORS.indigo} />
              <TypePill type="homework" />
              <span style={{ fontFamily: "'Patrick Hand', cursive", fontSize: 15 }}>HW5</span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: INK_SOFT }}>→ Fri Apr 24, 11:59 PM EDT</span>
              <span style={{ marginLeft: "auto", fontFamily: "'Caveat', cursive", fontSize: 16, color: ACCENT_GREEN }}>confidence: high ✓</span>
            </div>
          </SketchBox>
        </div>

        {/* State 3: low confidence */}
        <div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: INK_FAINT, marginBottom: 4 }}>③ AMBIGUOUS — low confidence warning</div>
          <SketchBox thick style={{ padding: "12px 16px", background: URGENT + "08" }}>
            <div style={{ fontFamily: "'Patrick Hand', cursive", fontSize: 18 }}>groceries</div>
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px dashed ${URGENT}`, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <TypePill type="other" />
              <span style={{ fontFamily: "'Patrick Hand', cursive", fontSize: 15 }}>groceries</span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: URGENT }}>⚠ no date — pick one?</span>
              <div style={{ display: "flex", gap: 4 }}>
                {["today", "tomorrow", "Fri", "pick date"].map((d, i) => (
                  <span key={i} style={{ fontFamily: "'Patrick Hand', cursive", fontSize: 12, border: `1px dashed ${INK_SOFT}`, padding: "1px 7px", color: INK_SOFT }}>{d}</span>
                ))}
              </div>
            </div>
          </SketchBox>
        </div>

        {/* State 4: confirmed, saved */}
        <div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: INK_FAINT, marginBottom: 4 }}>④ SAVED — toast + reset</div>
          <SketchBox style={{ padding: "12px 16px" }}>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: INK_FAINT }}>type a deadline...</span>
          </SketchBox>
          <div style={{ marginTop: 8, display: "inline-block", padding: "6px 12px", background: INK, color: PAPER, fontFamily: "'Patrick Hand', cursive", fontSize: 14 }}>
            ✓ saved STA 240 HW5 · Fri 11:59 PM  <span style={{ color: PAPER, textDecoration: "underline", marginLeft: 6 }}>undo</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function SettingsView() {
  const Row = ({ label, children, note }) => (
    <div style={{ padding: "12px 0", borderBottom: `1px dashed ${INK_FAINT}` }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
        <div style={{ width: 180 }}>
          <div style={{ fontFamily: "'Patrick Hand', cursive", fontSize: 15 }}>{label}</div>
          {note && <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: INK_FAINT, marginTop: 2 }}>{note}</div>}
        </div>
        <div style={{ flex: 1 }}>{children}</div>
      </div>
    </div>
  );
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <AppNav active="settings" />
      <div style={{ padding: "20px 40px", flex: 1, overflow: "hidden", maxWidth: 720 }}>
        <div style={{ fontFamily: "'Caveat', cursive", fontSize: 28, marginBottom: 4 }}>settings</div>
        <Row label="reminder offsets" note="hours before due">
          <div style={{ display: "flex", gap: 6 }}>
            {[168, 48, 12].map((h) => (
              <SketchBox key={h} style={{ padding: "3px 10px" }}>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>{h}h ×</span>
              </SketchBox>
            ))}
            <span style={{ fontFamily: "'Caveat', cursive", fontSize: 16, color: INK_FAINT, alignSelf: "center" }}>+ add</span>
          </div>
        </Row>
        <Row label="timezone">
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>America/New_York</span>
        </Row>
        <Row label="semester end" note="hides completed items after">
          <SketchBox style={{ padding: "3px 10px", display: "inline-block" }}>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>2026-05-10</span>
          </SketchBox>
        </Row>
        <Row label="calendar feed" note="subscribe in Apple Calendar">
          <SketchBox style={{ padding: "6px 10px", fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: INK_SOFT }}>
            webcal://deadlines.app/api/ics/k7x9m...
          </SketchBox>
          <div style={{ marginTop: 6, display: "flex", gap: 8 }}>
            <span style={{ fontFamily: "'Patrick Hand', cursive", fontSize: 13, textDecoration: "underline" }}>copy</span>
            <span style={{ fontFamily: "'Patrick Hand', cursive", fontSize: 13, color: URGENT }}>regenerate</span>
          </div>
        </Row>
        <Row label="courses">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {SAMPLE_COURSES.map((c) => (
              <CourseChip key={c.code} code={c.code} color={c.color} />
            ))}
            <span style={{ fontFamily: "'Caveat', cursive", fontSize: 16, color: INK_FAINT }}>+ add course</span>
          </div>
        </Row>
      </div>
    </div>
  );
}

// Mobile PWA frames
function MobileDash() {
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: PAPER }}>
      <div style={{ padding: "14px 14px 8px", borderBottom: `1px solid ${INK}` }}>
        <div style={{ fontFamily: "'Caveat', cursive", fontSize: 22, lineHeight: 1 }}>deadlines.</div>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: INK_FAINT, marginTop: 2 }}>Thu Apr 23</div>
      </div>
      <div style={{ padding: 12, flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", gap: 10 }}>
        <SketchBox thick style={{ padding: "12px 14px" }}>
          <div style={{ fontFamily: "'Caveat', cursive", fontSize: 14, color: URGENT }}>right now</div>
          <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
            <CourseChip code="MATH 212" color={COURSE_COLORS.violet} />
          </div>
          <div style={{ fontFamily: "'Patrick Hand', cursive", fontSize: 18, marginTop: 6 }}>Problem set 11</div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: URGENT, marginTop: 2 }}>due tonight · 6h left</div>
        </SketchBox>
        <div style={{ fontFamily: "'Caveat', cursive", fontSize: 18, marginTop: 2 }}>this week</div>
        {SAMPLE_ASSIGNMENTS.slice(0, 3).map((a) => (
          <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 8, paddingBottom: 6, borderBottom: `1px solid ${PAPER_DIM}` }}>
            <SketchCheck />
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                <CourseChip code={a.course.code} color={a.course.color} />
              </div>
              <div style={{ fontFamily: "'Patrick Hand', cursive", fontSize: 15, marginTop: 2 }}>{a.title}</div>
            </div>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: a.urgent ? URGENT : INK_FAINT }}>{a.rel}</span>
          </div>
        ))}
      </div>
      <div style={{ padding: "8px 12px", borderTop: `1px solid ${INK}`, display: "flex", gap: 8 }}>
        <SketchBox style={{ flex: 1, padding: "8px 12px" }}>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: INK_FAINT }}>+ add deadline...</span>
        </SketchBox>
      </div>
      <div style={{ display: "flex", borderTop: `1px solid ${INK}`, fontFamily: "'Patrick Hand', cursive", fontSize: 12 }}>
        {["home", "assigns", "apps", "more"].map((n, i) => (
          <div key={n} style={{ flex: 1, padding: "8px 0", textAlign: "center", background: i === 0 ? INK : "transparent", color: i === 0 ? PAPER : INK_SOFT }}>{n}</div>
        ))}
      </div>
    </div>
  );
}

function MobileAdd() {
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: PAPER }}>
      <div style={{ padding: "12px 14px", borderBottom: `1px solid ${INK}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontFamily: "'Patrick Hand', cursive", fontSize: 14 }}>← cancel</span>
        <span style={{ fontFamily: "'Caveat', cursive", fontSize: 18 }}>new deadline</span>
        <span style={{ fontFamily: "'Patrick Hand', cursive", fontSize: 14, color: INK_FAINT }}>save</span>
      </div>
      <div style={{ padding: 14, flex: 1, display: "flex", flexDirection: "column", gap: 12 }}>
        <SketchBox thick style={{ padding: "10px 12px", minHeight: 70 }}>
          <div style={{ fontFamily: "'Patrick Hand', cursive", fontSize: 15, lineHeight: 1.3 }}>
            <span style={{ background: COURSE_COLORS.indigo + "40", padding: "0 3px" }}>STA 240</span>{" "}
            HW5 due{" "}
            <span style={{ background: URGENT + "30", padding: "0 3px" }}>Friday 11:59pm</span>
          </div>
        </SketchBox>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: INK_FAINT }}>DETECTED</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px dashed ${INK_FAINT}` }}>
            <span style={{ fontFamily: "'Patrick Hand', cursive", fontSize: 13, color: INK_SOFT }}>course</span>
            <CourseChip code="STA 240" color={COURSE_COLORS.indigo} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px dashed ${INK_FAINT}` }}>
            <span style={{ fontFamily: "'Patrick Hand', cursive", fontSize: 13, color: INK_SOFT }}>title</span>
            <span style={{ fontFamily: "'Patrick Hand', cursive", fontSize: 14 }}>HW5</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px dashed ${INK_FAINT}` }}>
            <span style={{ fontFamily: "'Patrick Hand', cursive", fontSize: 13, color: INK_SOFT }}>type</span>
            <TypePill type="homework" />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px dashed ${INK_FAINT}` }}>
            <span style={{ fontFamily: "'Patrick Hand', cursive", fontSize: 13, color: INK_SOFT }}>due</span>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>Fri Apr 24, 11:59 PM</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function MobileList() {
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: PAPER }}>
      <div style={{ padding: "12px 14px", borderBottom: `1px solid ${INK}` }}>
        <div style={{ fontFamily: "'Caveat', cursive", fontSize: 22 }}>assignments</div>
        <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
          {["all", "open", "done"].map((t, i) => (
            <span key={t} style={{
              fontFamily: "'Patrick Hand', cursive", fontSize: 12,
              padding: "2px 10px", border: `1px solid ${i === 1 ? INK : INK_FAINT}`,
              background: i === 1 ? INK : "transparent", color: i === 1 ? PAPER : INK_SOFT,
            }}>{t}</span>
          ))}
        </div>
      </div>
      <div style={{ flex: 1, overflow: "hidden", padding: "6px 0" }}>
        {SAMPLE_ASSIGNMENTS.filter((a) => !a.done).map((a) => (
          <div key={a.id} style={{
            padding: "10px 14px", borderBottom: `1px solid ${PAPER_DIM}`,
            borderLeft: `4px solid ${a.course.color}`,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <SketchCheck />
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: a.course.color, fontWeight: 600 }}>{a.course.code}</span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: INK_FAINT, marginLeft: "auto" }}>{a.type}</span>
            </div>
            <div style={{ fontFamily: "'Patrick Hand', cursive", fontSize: 15, marginLeft: 22, marginTop: 2 }}>{a.title}</div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: a.urgent ? URGENT : INK_FAINT, marginLeft: 22 }}>{a.due} · {a.rel}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { AppsA, AppsB, AppsC, AppsD, QuickAddFlow, SettingsView, MobileDash, MobileAdd, MobileList });
