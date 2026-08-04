export function renderInterviewer(data) {
  return `
    <h2>Interviewer Efficiency</h2>
    <p class="sub-note">Interviewer-level metrics on feedback turnaround and hiring quality.</p>

    <!-- Section 1: Feedback TAT -->
    <div style="margin-bottom:8px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
        <div style="width:4px;height:18px;background:var(--accent);border-radius:2px;"></div>
        <h3 style="margin:0;font-size:14px;font-weight:600;color:var(--text);">Feedback TAT</h3>
      </div>
      <div class="card" style="text-align:center;padding:2.5rem;">
        <p style="color:var(--muted);font-size:13px;">Feedback turnaround time data will be populated here.</p>
        <p style="color:var(--muted);font-size:11px;margin-top:6px;">Track how quickly interviewers submit their feedback after interviews.</p>
      </div>
    </div>

    <hr class="section-divider">

    <!-- Section 2: Quality of Hire -->
    <div>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
        <div style="width:4px;height:18px;background:var(--green);border-radius:2px;"></div>
        <h3 style="margin:0;font-size:14px;font-weight:600;color:var(--text);">Quality of Hire</h3>
      </div>
      <div class="card" style="text-align:center;padding:2.5rem;">
        <p style="color:var(--muted);font-size:13px;">Quality of hire metrics will be populated here.</p>
        <p style="color:var(--muted);font-size:11px;margin-top:6px;">Measure hiring outcomes and interviewer calibration accuracy.</p>
      </div>
    </div>
  `;
}
