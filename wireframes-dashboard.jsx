// Dashboard wireframe variants.
// 5 distinct mental models for the "what should I do right now?" screen.

// Shared faux nav header
function AppNav({ active = "dashboard" }) {
  const items = ["dashboard", "assignments", "applications", "settings"];
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "10px 16px", borderBottom: `1px solid ${INK}`, background: PAPER,
    }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <span style={{ fontFamily: "'Caveat', cursive", fontSize: 22, lineHeight: 1 }}>deadlines.</span>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: INK_FAINT }}>grace@duke</span>
      </div>
      <div style={{ display: "flex", gap: 18 }}>
        {items.map((it) => (
          <span key={it} style={{
            fontFamily: "'Patrick Hand', cursive", fontSize: 16,
            color: it === active ? INK : INK_FAINT,
            borderBottom: it === active ? `2px solid ${INK}` : "none",
            paddingBottom: 2,
          }}>{it}</span>
        ))}
      </div>
    </div>
  );
}

// Variant A — Single "do this now" hero
function DashA() {
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <AppNav />
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, flexDirection: "column", gap: 16 }}>
        <span style={{ fontFamily: "'Caveat', cursive", fontSize: 28, color: INK_SOFT }}>right now →</span>
        <SketchBox thick style={{ width: 520, padding: "32px 36px", background: PAPER }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <CourseChip code="MATH 212" color={COURSE_COLORS.violet} size="lg" />
            <TypePill type="homework" />
          </div>
          <div style={{ fontFamily: "'Patrick Hand', cursive", fontSize: 36, lineHeight: 1.1, marginBottom: 6 }}>
            Problem set 11
          </div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: URGENT, marginBottom: 20 }}>
            due today, 11:59 PM — 6 hrs left
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <SketchBox style={{ padding: "8px 16px", flex: 1, textAlign: "center", background: INK, color: PAPER }}>
              <span style={{ fontFamily: "'Patrick Hand', cursive", fontSize: 16, color: PAPER }}>start working</span>
            </SketchBox>
            <SketchBox style={{ padding: "8px 16px" }}>
              <span style={{ fontFamily: "'Patrick Hand', cursive", fontSize: 16 }}>mark done</span>
            </SketchBox>
            <SketchBox style={{ padding: "8px 16px" }}>
              <span style={{ fontFamily: "'Patrick Hand', cursive", fontSize: 16 }}>snooze</span>
            </SketchBox>
          </div>
        </SketchBox>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: INK_FAINT, marginTop: 8 }}>
          2 more due this week ↓
        </div>
        <div style={{ display: "flex", gap: 8, opacity: 0.5 }}>
          {SAMPLE_ASSIGNMENTS.slice(0, 3).map((a) => (
            <SketchBox key={a.id} style={{ padding: "6px 10px", width: 140 }}>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: a.course.color }}>{a.course.code}</div>
              <div style={{ fontFamily: "'Patrick Hand', cursive", fontSize: 14 }}>{a.title}</div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: INK_FAINT }}>{a.rel}</div>
            </SketchBox>
          ))}
        </div>
      </div>
    </div>
  );
}

// Variant B — Prioritized ranked list (urgency × effort score)
function DashB() {
  const ranked = [
    { ...SAMPLE_ASSIGNMENTS[4], score: 94 }, // problem set today
    { ...SAMPLE_ASSIGNMENTS[1], score: 82 }, // lab tomorrow
    { ...SAMPLE_ASSIGNMENTS[0], score: 61 }, // HW5 friday
    { ...SAMPLE_ASSIGNMENTS[5], score: 44 }, // reading sun
    { ...SAMPLE_ASSIGNMENTS[2], score: 38 }, // essay may 1
    { ...SAMPLE_ASSIGNMENTS[3], score: 25 }, // exam may 5
  ];
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <AppNav />
      <div style={{ padding: "20px 28px", flex: 1, overflow: "hidden" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
          <span style={{ fontFamily: "'Caveat', cursive", fontSize: 32 }}>what's next?</span>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: INK_FAINT }}>ranked by urgency × effort</span>
        </div>
        <Underline width="100%" />
        <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
          {ranked.map((a, i) => (
            <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{
                width: 36, height: 36, border: `1.5px solid ${INK}`, borderRadius: "50%",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontFamily: "'Caveat', cursive", fontSize: 22,
                background: i === 0 ? URGENT : "transparent",
                color: i === 0 ? PAPER : INK,
              }}>{i + 1}</div>
              <SketchBox style={{ flex: 1, padding: "10px 14px", display: "flex", alignItems: "center", gap: 12 }}>
                <SketchCheck />
                <CourseChip code={a.course.code} color={a.course.color} />
                <span style={{ fontFamily: "'Patrick Hand', cursive", fontSize: 18, flex: 1 }}>{a.title}</span>
                <TypePill type={a.type} />
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: a.urgent ? URGENT : INK_SOFT, minWidth: 90, textAlign: "right" }}>
                  {a.rel}
                </span>
                {a.hours && (
                  <span style={{ fontFamily: "'Caveat', cursive", fontSize: 16, color: INK_FAINT, minWidth: 40 }}>~{a.hours}h</span>
                )}
                <div style={{ width: 50, height: 8, background: PAPER_DIM, borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ width: `${a.score}%`, height: "100%", background: a.score > 70 ? URGENT : INK }} />
                </div>
              </SketchBox>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Variant C — Today / This week / Later buckets
function DashC() {
  const today = [SAMPLE_ASSIGNMENTS[4]];
  const week = [SAMPLE_ASSIGNMENTS[1], SAMPLE_ASSIGNMENTS[0], SAMPLE_ASSIGNMENTS[5]];
  const later = [SAMPLE_ASSIGNMENTS[2], SAMPLE_ASSIGNMENTS[3]];

  function Bucket({ title, items, color, urgent }) {
    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          <span style={{ fontFamily: "'Caveat', cursive", fontSize: 26, color: urgent ? URGENT : INK }}>{title}</span>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: INK_FAINT }}>{items.length} open</span>
        </div>
        <Underline color={urgent ? URGENT : INK} />
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
          {items.map((a) => (
            <SketchBox key={a.id} style={{ padding: "8px 10px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <CourseChip code={a.course.code} color={a.course.color} />
                <TypePill type={a.type} />
              </div>
              <div style={{ fontFamily: "'Patrick Hand', cursive", fontSize: 16, marginBottom: 2 }}>{a.title}</div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: a.urgent ? URGENT : INK_SOFT }}>
                {a.due} · {a.rel}
              </div>
            </SketchBox>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <AppNav />
      <div style={{ padding: "20px 24px", flex: 1, overflow: "hidden" }}>
        <div style={{ fontFamily: "'Caveat', cursive", fontSize: 32, marginBottom: 14 }}>
          hey Grace — Thu Apr 23
        </div>
        <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
          <Bucket title="today" items={today} urgent />
          <Bucket title="this week" items={week} />
          <Bucket title="later" items={later} />
        </div>
      </div>
    </div>
  );
}

// Variant D — Week agenda / timeline
function DashD() {
  const days = [
    { label: "Thu", date: "23", items: [SAMPLE_ASSIGNMENTS[4]], today: true },
    { label: "Fri", date: "24", items: [SAMPLE_ASSIGNMENTS[1], SAMPLE_ASSIGNMENTS[0]] },
    { label: "Sat", date: "25", items: [] },
    { label: "Sun", date: "26", items: [SAMPLE_ASSIGNMENTS[5]] },
    { label: "Mon", date: "27", items: [] },
    { label: "Tue", date: "28", items: [{ ...SAMPLE_APPS[0], title: SAMPLE_APPS[0].company, type: "interview" }] },
    { label: "Wed", date: "29", items: [] },
  ];

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <AppNav />
      <div style={{ padding: "18px 20px", flex: 1, overflow: "hidden" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
          <span style={{ fontFamily: "'Caveat', cursive", fontSize: 28 }}>this week</span>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <span style={{ fontFamily: "'Patrick Hand', cursive", fontSize: 14, color: INK_FAINT }}>← prev</span>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>Apr 23 – 29</span>
            <span style={{ fontFamily: "'Patrick Hand', cursive", fontSize: 14, color: INK_FAINT }}>next →</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 4, height: "calc(100% - 50px)" }}>
          {days.map((d) => (
            <div key={d.label} style={{ flex: 1, display: "flex", flexDirection: "column" }}>
              <div style={{
                borderBottom: `1.5px solid ${d.today ? URGENT : INK}`,
                paddingBottom: 4, marginBottom: 8,
                background: d.today ? URGENT + "15" : "transparent", padding: "4px 6px",
              }}>
                <div style={{ fontFamily: "'Patrick Hand', cursive", fontSize: 14, color: d.today ? URGENT : INK_SOFT }}>{d.label}</div>
                <div style={{ fontFamily: "'Caveat', cursive", fontSize: 24, color: d.today ? URGENT : INK, lineHeight: 1 }}>{d.date}</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {d.items.map((a, i) => (
                  <div key={i} style={{
                    borderLeft: `3px solid ${a.course?.color || ACCENT_GREEN}`,
                    paddingLeft: 6, paddingTop: 2, paddingBottom: 2,
                  }}>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: INK_FAINT }}>
                      {a.course?.code || "interview"}
                    </div>
                    <div style={{ fontFamily: "'Patrick Hand', cursive", fontSize: 13, lineHeight: 1.15 }}>{a.title}</div>
                  </div>
                ))}
                {d.items.length === 0 && (
                  <div style={{ fontFamily: "'Caveat', cursive", fontSize: 16, color: INK_FAINT, textAlign: "center", marginTop: 20 }}>
                    ~
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Variant E — "Map of the week" — visual pressure gauge
function DashE() {
  // Hours-per-day bars (load), with items annotated
  const load = [
    { d: "Thu", h: 3, items: ["pset 11"], today: true, urgent: true },
    { d: "Fri", h: 5, items: ["Lab 6", "HW5"], urgent: true },
    { d: "Sat", h: 1, items: [] },
    { d: "Sun", h: 1, items: ["Dracula ch 7"] },
    { d: "Mon", h: 0, items: [] },
    { d: "Tue", h: 2, items: ["Cisco screen"] },
    { d: "Wed", h: 0, items: [] },
  ];
  const max = 6;

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <AppNav />
      <div style={{ padding: 24, flex: 1, display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <div style={{ fontFamily: "'Caveat', cursive", fontSize: 32, lineHeight: 1 }}>pressure gauge</div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: INK_FAINT, marginTop: 4 }}>
            estimated hours of work per day — based on your estimates
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 200, borderBottom: `1.5px solid ${INK}`, paddingBottom: 2 }}>
          {load.map((d) => (
            <div key={d.d} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, position: "relative" }}>
              <div style={{ fontFamily: "'Caveat', cursive", fontSize: 16, color: d.urgent ? URGENT : INK_SOFT }}>
                {d.h > 0 ? `${d.h}h` : ""}
              </div>
              <div style={{
                width: "70%",
                height: `${(d.h / max) * 160}px`,
                background: d.urgent ? URGENT : INK,
                border: `1.5px solid ${INK}`,
                position: "relative",
              }}>
                <div style={{
                  position: "absolute", inset: 0,
                  background: "repeating-linear-gradient(-45deg, transparent 0 3px, rgba(255,255,255,0.2) 3px 4px)",
                }}/>
              </div>
              <div style={{
                fontFamily: "'Patrick Hand', cursive", fontSize: 14,
                color: d.today ? URGENT : INK, fontWeight: d.today ? 700 : 400,
              }}>{d.d}</div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 16, marginTop: 8 }}>
          <SketchBox style={{ flex: 1, padding: 14 }}>
            <div style={{ fontFamily: "'Caveat', cursive", fontSize: 20, marginBottom: 6 }}>right now</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <CourseChip code="MATH 212" color={COURSE_COLORS.violet} />
              <span style={{ fontFamily: "'Patrick Hand', cursive", fontSize: 16 }}>Problem set 11</span>
            </div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: URGENT, marginTop: 4 }}>
              due tonight 11:59 PM · ~2h
            </div>
          </SketchBox>
          <SketchBox style={{ flex: 1, padding: 14 }}>
            <div style={{ fontFamily: "'Caveat', cursive", fontSize: 20, marginBottom: 6 }}>heads up</div>
            <div style={{ fontFamily: "'Patrick Hand', cursive", fontSize: 14, lineHeight: 1.3 }}>
              Friday is stacked — 5 hrs est. Maybe start HW5 Thursday night?
            </div>
          </SketchBox>
          <SketchBox style={{ flex: 1, padding: 14 }}>
            <div style={{ fontFamily: "'Caveat', cursive", fontSize: 20, marginBottom: 6 }}>streak</div>
            <div style={{ fontFamily: "'Patrick Hand', cursive", fontSize: 28, lineHeight: 1 }}>12 days</div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: INK_FAINT, marginTop: 4 }}>
              no missed deadlines since Apr 11
            </div>
          </SketchBox>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { DashA, DashB, DashC, DashD, DashE, AppNav });
