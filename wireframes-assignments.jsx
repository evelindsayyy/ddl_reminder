// Assignments list variants

function AssignA() {
  // Classic grouped list by course
  const byCourse = {};
  SAMPLE_ASSIGNMENTS.filter((a) => !a.done).forEach((a) => {
    byCourse[a.course.code] = byCourse[a.course.code] || { course: a.course, items: [] };
    byCourse[a.course.code].items.push(a);
  });
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <AppNav active="assignments" />
      <div style={{ padding: "16px 24px", flex: 1, overflow: "hidden" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
          <span style={{ fontFamily: "'Caveat', cursive", fontSize: 28 }}>assignments</span>
          <div style={{ display: "flex", gap: 8 }}>
            {["all", "open", "done"].map((f, i) => (
              <span key={f} style={{
                fontFamily: "'Patrick Hand', cursive", fontSize: 14,
                padding: "2px 10px", border: `1px solid ${i === 1 ? INK : INK_FAINT}`,
                background: i === 1 ? INK : "transparent", color: i === 1 ? PAPER : INK_SOFT,
              }}>{f}</span>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {Object.values(byCourse).map((g) => (
            <div key={g.course.code}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <CourseChip code={g.course.code} color={g.course.color} size="lg" />
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: INK_FAINT }}>
                  {g.items.length} open
                </span>
                <div style={{ flex: 1, borderBottom: `1px dashed ${INK_FAINT}`, marginLeft: 4 }} />
              </div>
              {g.items.map((a) => (
                <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 4px", borderBottom: `1px solid ${PAPER_DIM}` }}>
                  <SketchCheck />
                  <span style={{ fontFamily: "'Patrick Hand', cursive", fontSize: 16, flex: 1 }}>{a.title}</span>
                  <TypePill type={a.type} />
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: a.urgent ? URGENT : INK_SOFT, minWidth: 110, textAlign: "right" }}>{a.due}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AssignB() {
  // Table view (power-user)
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <AppNav active="assignments" />
      <div style={{ padding: "14px 20px", flex: 1, overflow: "hidden" }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "center" }}>
          <SketchBox style={{ padding: "4px 10px", flex: 1, maxWidth: 300 }}>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: INK_FAINT }}>search... (⌘K)</span>
          </SketchBox>
          <span style={{ fontFamily: "'Patrick Hand', cursive", fontSize: 13, color: INK_FAINT }}>filter:</span>
          {["course", "type", "due", "tags"].map((f) => (
            <span key={f} style={{ fontFamily: "'Patrick Hand', cursive", fontSize: 13, border: `1px dashed ${INK_FAINT}`, padding: "1px 8px", color: INK_SOFT }}>{f} ▾</span>
          ))}
        </div>
        <div style={{ border: `1px solid ${INK}`, fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "28px 110px 1fr 90px 110px 60px 40px", background: PAPER_DIM, padding: "6px 10px", borderBottom: `1px solid ${INK}`, fontSize: 10, letterSpacing: 0.5, color: INK_SOFT }}>
            <span></span><span>COURSE</span><span>TITLE</span><span>TYPE</span><span>DUE</span><span>EST</span><span></span>
          </div>
          {SAMPLE_ASSIGNMENTS.map((a) => (
            <div key={a.id} style={{
              display: "grid", gridTemplateColumns: "28px 110px 1fr 90px 110px 60px 40px",
              padding: "8px 10px", borderBottom: `1px solid ${PAPER_DIM}`, alignItems: "center",
              opacity: a.done ? 0.4 : 1,
            }}>
              <SketchCheck checked={a.done} />
              <CourseChip code={a.course.code} color={a.course.color} />
              <span style={{ fontFamily: "'Patrick Hand', cursive", fontSize: 15, textDecoration: a.done ? "line-through" : "none" }}>{a.title}</span>
              <span style={{ color: INK_SOFT }}>{a.type}</span>
              <span style={{ color: a.urgent ? URGENT : INK }}>{a.due}</span>
              <span style={{ color: INK_FAINT }}>{a.hours ? `${a.hours}h` : "—"}</span>
              <span style={{ color: INK_FAINT, cursor: "pointer" }}>···</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AssignC() {
  // Timeline/gantt — each course is a swim lane
  const lanes = SAMPLE_COURSES.slice(0, 5).map((c) => ({
    course: c,
    items: SAMPLE_ASSIGNMENTS.filter((a) => a.course.code === c.code && !a.done),
  }));
  // positions along a 14-day axis
  const posMap = { 1: 20, 2: 8, 3: 55, 4: 80, 5: 4, 6: 25 };
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <AppNav active="assignments" />
      <div style={{ padding: "16px 24px", flex: 1, overflow: "hidden" }}>
        <div style={{ fontFamily: "'Caveat', cursive", fontSize: 28, marginBottom: 10 }}>next 2 weeks</div>
        <div style={{ position: "relative", border: `1px solid ${INK}` }}>
          {/* Date header */}
          <div style={{ display: "flex", borderBottom: `1px solid ${INK}`, background: PAPER_DIM }}>
            <div style={{ width: 130, padding: "6px 10px", fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: INK_SOFT, borderRight: `1px solid ${INK}` }}>course</div>
            <div style={{ flex: 1, display: "flex" }}>
              {["Apr 23", "Apr 26", "Apr 29", "May 2", "May 5"].map((d, i) => (
                <div key={i} style={{ flex: 1, padding: "6px 0", textAlign: "center", fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: INK_SOFT, borderRight: i < 4 ? `1px dashed ${INK_FAINT}` : "none" }}>{d}</div>
              ))}
            </div>
          </div>
          {lanes.map((lane) => (
            <div key={lane.course.code} style={{ display: "flex", borderBottom: `1px solid ${PAPER_DIM}`, minHeight: 42, alignItems: "center" }}>
              <div style={{ width: 130, padding: "6px 10px", borderRight: `1px solid ${PAPER_DIM}` }}>
                <CourseChip code={lane.course.code} color={lane.course.color} />
              </div>
              <div style={{ flex: 1, position: "relative", height: 42 }}>
                {/* today line */}
                <div style={{ position: "absolute", left: "3%", top: 0, bottom: 0, borderLeft: `1.5px dashed ${URGENT}` }} />
                {lane.items.map((a) => (
                  <div key={a.id} style={{
                    position: "absolute",
                    left: `${posMap[a.id] || 30}%`, top: 8,
                    padding: "3px 8px",
                    background: a.course.color + "40",
                    border: `1.5px solid ${a.course.color}`,
                    fontFamily: "'Patrick Hand', cursive", fontSize: 13,
                    whiteSpace: "nowrap",
                  }}>
                    {a.title}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 10, fontFamily: "'Caveat', cursive", fontSize: 16, color: URGENT, display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 16, borderTop: `1.5px dashed ${URGENT}` }}/> today (Apr 23)
        </div>
      </div>
    </div>
  );
}

function AssignD() {
  // Calendar month grid
  const weeks = [
    [20, 21, 22, { d: 23, items: [{ t: "pset 11", c: COURSE_COLORS.violet }], today: true }, { d: 24, items: [{ t: "HW5", c: COURSE_COLORS.indigo }, { t: "Lab 6", c: COURSE_COLORS.sky }] }, 25, { d: 26, items: [{ t: "Dracula", c: COURSE_COLORS.amber }] }],
    [27, 28, 29, 30, { d: 1, items: [{ t: "essay", c: COURSE_COLORS.amber }] }, 2, 3],
    [4, { d: 5, items: [{ t: "STA 199 final", c: COURSE_COLORS.emerald }] }, 6, 7, 8, 9, 10],
  ];
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <AppNav active="assignments" />
      <div style={{ padding: "14px 20px", flex: 1, overflow: "hidden" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
          <span style={{ fontFamily: "'Caveat', cursive", fontSize: 28 }}>April / May 2026</span>
          <div style={{ display: "flex", gap: 6, alignItems: "center", fontFamily: "'Patrick Hand', cursive", fontSize: 14 }}>
            <span>‹</span><span>today</span><span>›</span>
            <span style={{ marginLeft: 12, color: INK_FAINT }}>list · grid</span>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", border: `1px solid ${INK}` }}>
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} style={{ padding: "4px 6px", borderBottom: `1px solid ${INK}`, borderRight: `1px solid ${PAPER_DIM}`, fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: INK_SOFT, background: PAPER_DIM }}>{d}</div>
          ))}
          {weeks.flat().map((cell, i) => {
            const day = typeof cell === "number" ? cell : cell.d;
            const items = typeof cell === "object" ? cell.items || [] : [];
            const today = typeof cell === "object" && cell.today;
            return (
              <div key={i} style={{
                minHeight: 75, padding: 4, borderRight: `1px solid ${PAPER_DIM}`, borderBottom: `1px solid ${PAPER_DIM}`,
                background: today ? URGENT + "15" : "transparent",
              }}>
                <div style={{ fontFamily: "'Caveat', cursive", fontSize: 16, color: today ? URGENT : INK, fontWeight: today ? 700 : 400 }}>{day}</div>
                {items.map((it, j) => (
                  <div key={j} style={{
                    marginTop: 2, padding: "1px 4px",
                    borderLeft: `3px solid ${it.c}`,
                    background: it.c + "25",
                    fontFamily: "'Patrick Hand', cursive", fontSize: 11,
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}>{it.t}</div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function AssignE() {
  // Kanban by type (homework, lab, exam, essay, reading, project)
  const types = ["homework", "lab", "essay", "exam", "reading"];
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <AppNav active="assignments" />
      <div style={{ padding: "14px 18px", flex: 1, overflow: "hidden" }}>
        <div style={{ fontFamily: "'Caveat', cursive", fontSize: 26, marginBottom: 10 }}>by type</div>
        <div style={{ display: "flex", gap: 10, height: "calc(100% - 44px)" }}>
          {types.map((t) => {
            const items = SAMPLE_ASSIGNMENTS.filter((a) => a.type === t && !a.done);
            return (
              <div key={t} style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderBottom: `1.5px solid ${INK}`, paddingBottom: 3 }}>
                  <span style={{ fontFamily: "'Patrick Hand', cursive", fontSize: 16, textTransform: "capitalize" }}>{t}</span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: INK_FAINT }}>{items.length}</span>
                </div>
                {items.map((a) => (
                  <SketchBox key={a.id} style={{ padding: "6px 8px" }}>
                    <CourseChip code={a.course.code} color={a.course.color} />
                    <div style={{ fontFamily: "'Patrick Hand', cursive", fontSize: 14, marginTop: 4 }}>{a.title}</div>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: a.urgent ? URGENT : INK_FAINT, marginTop: 2 }}>{a.rel}</div>
                  </SketchBox>
                ))}
                {items.length === 0 && (
                  <div style={{ fontFamily: "'Caveat', cursive", fontSize: 14, color: INK_FAINT, textAlign: "center", marginTop: 12 }}>none</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { AssignA, AssignB, AssignC, AssignD, AssignE });
