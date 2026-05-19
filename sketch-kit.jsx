// Shared sketchy wireframe primitives.
// Hand-drawn feel: slightly wobbly borders, Patrick Hand for UI text,
// Caveat for annotations. Monochrome ink with one warm-red urgency
// accent and muted course color chips.

const INK = "#1a1a1a";
const INK_SOFT = "#555";
const INK_FAINT = "#999";
const PAPER = "#fafaf7";
const PAPER_DIM = "#f2f0e8";
const URGENT = "#d94a38";
const ACCENT_BLUE = "#3a6ea8";
const ACCENT_GREEN = "#4a7c59";

// Muted course-color palette (faded versions of lib/colors.ts)
const COURSE_COLORS = {
  indigo: "#8a8fd9",
  red: "#e28a82",
  amber: "#e6be6d",
  emerald: "#7ab89a",
  sky: "#7cb6d9",
  violet: "#b393d9",
  pink: "#e8a0c2",
  teal: "#6fb8b0",
};

// Wobbly rounded-rect border via SVG filter (subtle turbulence)
function SketchDefs() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }}>
      <defs>
        <filter id="wobble" x="-2%" y="-2%" width="104%" height="104%">
          <feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves="2" seed="3" />
          <feDisplacementMap in="SourceGraphic" scale="1.2" />
        </filter>
        <filter id="wobble-lg" x="-2%" y="-2%" width="104%" height="104%">
          <feTurbulence type="fractalNoise" baseFrequency="0.015" numOctaves="2" seed="5" />
          <feDisplacementMap in="SourceGraphic" scale="2" />
        </filter>
      </defs>
    </svg>
  );
}

// A box drawn as SVG so the stroke can wobble
function SketchBox({ children, style = {}, dashed = false, thick = false, fill = "transparent", onClick }) {
  return (
    <div style={{ position: "relative", ...style }} onClick={onClick}>
      <svg
        width="100%"
        height="100%"
        style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
        preserveAspectRatio="none"
      >
        <rect
          x="2"
          y="2"
          width="calc(100% - 4px)"
          height="calc(100% - 4px)"
          rx="4"
          fill={fill}
          stroke={INK}
          strokeWidth={thick ? 2 : 1.2}
          strokeDasharray={dashed ? "5 3" : "none"}
          filter="url(#wobble)"
        />
      </svg>
      <div style={{ position: "relative", width: "100%", height: "100%" }}>{children}</div>
    </div>
  );
}

// Horizontal hand-drawn underline
function Underline({ color = INK, width = "100%", thickness = 1.5 }) {
  return (
    <svg width={width} height="6" style={{ display: "block" }}>
      <path
        d="M 2,3 Q 20,1 40,3 T 80,3 T 120,3 T 160,3 T 200,3 T 240,3 T 280,3 T 320,3 T 360,3 T 400,3 T 440,3 T 480,3 T 520,3 T 560,3 T 600,3 T 640,3 T 680,3"
        stroke={color}
        strokeWidth={thickness}
        fill="none"
        filter="url(#wobble)"
      />
    </svg>
  );
}

// Arrow callout pointing to something
function Arrow({ from, to, color = INK, curve = 0 }) {
  const [x1, y1] = from;
  const [x2, y2] = to;
  const mx = (x1 + x2) / 2 + curve;
  const my = (y1 + y2) / 2 - Math.abs(curve) * 0.5;
  const d = `M ${x1},${y1} Q ${mx},${my} ${x2},${y2}`;
  // Arrowhead angle
  const ang = Math.atan2(y2 - my, x2 - mx);
  const ah = 8;
  const hx1 = x2 - ah * Math.cos(ang - Math.PI / 6);
  const hy1 = y2 - ah * Math.sin(ang - Math.PI / 6);
  const hx2 = x2 - ah * Math.cos(ang + Math.PI / 6);
  const hy2 = y2 - ah * Math.sin(ang + Math.PI / 6);
  return (
    <svg
      style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "visible" }}
      width="100%"
      height="100%"
    >
      <path d={d} stroke={color} strokeWidth="1.3" fill="none" filter="url(#wobble)" />
      <path d={`M ${x2},${y2} L ${hx1},${hy1} M ${x2},${y2} L ${hx2},${hy2}`} stroke={color} strokeWidth="1.3" fill="none" />
    </svg>
  );
}

// A little hand-drawn checkbox
function SketchCheck({ checked = false, size = 16 }) {
  return (
    <svg width={size} height={size} style={{ flexShrink: 0 }}>
      <rect x="1.5" y="1.5" width={size - 3} height={size - 3} rx="2" stroke={INK} strokeWidth="1.3" fill="none" filter="url(#wobble)" />
      {checked && (
        <path
          d={`M ${size * 0.25},${size * 0.55} L ${size * 0.45},${size * 0.75} L ${size * 0.8},${size * 0.3}`}
          stroke={INK}
          strokeWidth="1.8"
          fill="none"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}

// Course code chip — small pill with muted color
function CourseChip({ code, color = COURSE_COLORS.indigo, size = "sm" }) {
  const padY = size === "sm" ? 2 : 4;
  const padX = size === "sm" ? 6 : 10;
  const fs = size === "sm" ? 13 : 15;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: `${padY}px ${padX}px`,
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: fs,
        fontWeight: 600,
        color: INK,
        background: color + "33",
        border: `1px solid ${color}`,
        borderRadius: 3,
        letterSpacing: 0.3,
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: color }} />
      {code}
    </span>
  );
}

// Small handwritten annotation / label
function Annotation({ children, color = INK_SOFT, rotate = 0, style = {} }) {
  return (
    <span
      style={{
        fontFamily: "'Caveat', cursive",
        fontSize: 18,
        color,
        transform: `rotate(${rotate}deg)`,
        display: "inline-block",
        lineHeight: 1,
        ...style,
      }}
    >
      {children}
    </span>
  );
}

// Pill for type badge
function TypePill({ type }) {
  return (
    <span
      style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 11,
        textTransform: "uppercase",
        letterSpacing: 0.8,
        padding: "1px 6px",
        border: `1px dashed ${INK_SOFT}`,
        color: INK_SOFT,
        borderRadius: 2,
      }}
    >
      {type}
    </span>
  );
}

// Placeholder image block — striped with monospace caption
function Placeholder({ w = "100%", h = 120, label = "placeholder" }) {
  return (
    <div
      style={{
        width: w,
        height: h,
        background:
          "repeating-linear-gradient(-45deg, transparent 0 8px, rgba(0,0,0,0.05) 8px 9px)",
        border: `1px dashed ${INK_FAINT}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 11,
        color: INK_FAINT,
        letterSpacing: 0.5,
      }}
    >
      {label}
    </div>
  );
}

// Artboard frame with a top-left title label (like Figma)
function Frame({ title, subtitle, width, height, children, bg = PAPER }) {
  return (
    <div style={{ width, display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, paddingLeft: 4 }}>
        <span style={{ fontFamily: "'Caveat', cursive", fontSize: 20, color: INK, lineHeight: 1 }}>
          {title}
        </span>
        {subtitle && (
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: INK_FAINT, letterSpacing: 0.4 }}>
            {subtitle}
          </span>
        )}
      </div>
      <div
        style={{
          width,
          height,
          background: bg,
          border: `1px solid ${INK}`,
          boxShadow: "3px 3px 0 rgba(0,0,0,0.08)",
          overflow: "hidden",
          position: "relative",
        }}
      >
        {children}
      </div>
    </div>
  );
}

// Sample data
const SAMPLE_COURSES = [
  { code: "STA 240", color: COURSE_COLORS.indigo },
  { code: "COMPSCI 210D", color: COURSE_COLORS.sky },
  { code: "ENGLISH 208S", color: COURSE_COLORS.amber },
  { code: "STA 199", color: COURSE_COLORS.emerald },
  { code: "MATH 212", color: COURSE_COLORS.violet },
];

const SAMPLE_ASSIGNMENTS = [
  { id: 1, title: "HW5", course: SAMPLE_COURSES[0], type: "homework", due: "Fri 11:59 PM", rel: "in 2 days", hours: 3, urgent: false, done: false },
  { id: 2, title: "Lab 6", course: SAMPLE_COURSES[1], type: "lab", due: "Tomorrow", rel: "in 19 hrs", hours: 2, urgent: true, done: false },
  { id: 3, title: "Dracula response paper", course: SAMPLE_COURSES[2], type: "essay", due: "May 1", rel: "in 8 days", hours: 5, urgent: false, done: false },
  { id: 4, title: "Final exam", course: SAMPLE_COURSES[3], type: "exam", due: "May 5, 9am", rel: "in 12 days", hours: null, urgent: false, done: false },
  { id: 5, title: "Problem set 11", course: SAMPLE_COURSES[4], type: "homework", due: "Today 11:59 PM", rel: "in 6 hrs", hours: 2, urgent: true, done: false },
  { id: 6, title: "Read ch 7 of Dracula", course: SAMPLE_COURSES[2], type: "reading", due: "Sun", rel: "in 4 days", hours: 1, urgent: false, done: false },
  { id: 7, title: "HW4", course: SAMPLE_COURSES[0], type: "homework", due: "Apr 18", rel: "5 days ago", hours: 3, urgent: false, done: true },
];

const SAMPLE_APPS = [
  { id: 1, company: "Cisco", role: "SWE Intern", stage: "interview", next: "Thu 2pm — Tech screen", nextRel: "in 1 day" },
  { id: 2, company: "Stripe", role: "Data Sci Intern", stage: "applied", next: "Apr 29 — Follow up", nextRel: "in 5 days" },
  { id: 3, company: "Palantir", role: "FDSE Intern", stage: "offer", next: "May 3 — Decision due", nextRel: "in 9 days" },
  { id: 4, company: "Figma", role: "PM Intern", stage: "rejected", next: null, nextRel: null },
  { id: 5, company: "Anthropic", role: "Research Intern", stage: "applied", next: "Apr 30 — OA", nextRel: "in 6 days" },
  { id: 6, company: "Notion", role: "SWE Intern", stage: "interview", next: "May 2 — Final round", nextRel: "in 8 days" },
  { id: 7, company: "Vercel", role: "DevRel Intern", stage: "applied", next: null, nextRel: null },
];

Object.assign(window, {
  INK, INK_SOFT, INK_FAINT, PAPER, PAPER_DIM, URGENT, ACCENT_BLUE, ACCENT_GREEN,
  COURSE_COLORS, SketchDefs, SketchBox, Underline, Arrow, SketchCheck,
  CourseChip, Annotation, TypePill, Placeholder, Frame,
  SAMPLE_COURSES, SAMPLE_ASSIGNMENTS, SAMPLE_APPS,
});
