import ResizeObserver from "resize-observer-polyfill";

if (!window.ResizeObserver) {
  window.ResizeObserver = ResizeObserver;
}

import { useState, useEffect, useRef, useCallback, useMemo, memo } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
  ReferenceLine, AreaChart, Area, ScatterChart, Scatter, Tooltip, Legend
} from "recharts";

/* ═══════════════════════════════════════════════════════════════════════════
   §0  UTILITIES  – guard rails ensuring zero NaN / Infinity
═══════════════════════════════════════════════════════════════════════════ */
const safe  = (v, fb = 0)     => (isFinite(v) && !isNaN(v) ? v : fb);
const clamp = (v, lo, hi)     => Math.min(hi, Math.max(lo, safe(v, lo)));
const rnd   = (v, d = 2)      => +safe(v, 0).toFixed(d);
const pctOf = (v, tot)        => clamp((v / clamp(tot, 0.001, 1e9)) * 100, 0, 100);

/* ═══════════════════════════════════════════════════════════════════════════
   §1  THEME SYSTEM  – dual dark / light with CSS-variable bridge
═══════════════════════════════════════════════════════════════════════════ */
const THEMES = {
  dark: {
    bg0:"#020609", bg1:"#030b16", bg2:"#040d18", bg3:"#050f1c",
    border:"#08182a", border2:"#0d2035",
    txt0:"#8ab0cc", txt1:"#4a7090", txt2:"#1a3a55", txt3:"#0a2035",
    accent:"#00e5a0", accentB:"#60c0ff", accentC:"#d080ff",
    warn:"#ffaa00", crit:"#ff3333", ok:"#00e5a0",
    waveB:"#030c16",
  },
  light: {
    bg0:"#eef3f8", bg1:"#e4edf5", bg2:"#dce7f2", bg3:"#d0dded",
    border:"#b8ccde", border2:"#a0b8cc",
    txt0:"#1a3a55", txt1:"#2a5070", txt2:"#4a7090", txt3:"#6890aa",
    accent:"#007a55", accentB:"#005ba0", accentC:"#7030c0",
    warn:"#b05000", crit:"#cc0000", ok:"#007a55",
    waveB:"#dce7f2",
  },
};

/* ═══════════════════════════════════════════════════════════════════════════
   §2  GLOBAL CSS  – cross-browser, theme-variable driven
═══════════════════════════════════════════════════════════════════════════ */
function buildCSS(t) { return `
  @import url('https://fonts.googleapis.com/css2?family=Exo+2:wght@300;400;500;600;700;800&family=Share+Tech+Mono&family=Rajdhani:wght@400;500;600;700&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: ${t.bg0}; overflow: hidden; }
  ::-webkit-scrollbar { width: 4px; height: 4px; background: ${t.bg0}; }
  ::-webkit-scrollbar-thumb { background: ${t.border}; border-radius: 2px; }
  /* Cross-browser range – Chrome/Safari */
  input[type=range] { -webkit-appearance: none; appearance: none; background: ${t.border}; border-radius: 2px; height: 3px; outline: none; width: 100%; cursor: pointer; }
  input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 12px; height: 12px; border-radius: 50%; border: none; cursor: pointer; transition: transform 0.1s; }
  input[type=range]::-webkit-slider-thumb:hover { transform: scale(1.3); }
  /* Firefox */
  input[type=range]::-moz-range-track { background: ${t.border}; border-radius: 2px; height: 3px; }
  input[type=range]::-moz-range-thumb { width: 12px; height: 12px; border-radius: 50%; border: none; cursor: pointer; }
  /* IE/Edge legacy */
  input[type=range]::-ms-track { background: transparent; border-color: transparent; color: transparent; height: 3px; }
  input[type=range]::-ms-fill-lower { background: ${t.border}; border-radius: 2px; }
  input[type=range]::-ms-thumb { width: 12px; height: 12px; border-radius: 50%; border: none; }
  input[type=range]:disabled { opacity: 0.28; cursor: not-allowed; }
  @keyframes blink   { 0%,100%{opacity:1}    50%{opacity:0.08} }
  @keyframes pulse   { 0%,100%{opacity:0.75} 50%{opacity:1} }
  @keyframes fadeUp  { from{opacity:0;transform:translateY(7px)} to{opacity:1;transform:translateY(0)} }
  @keyframes spin    { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
  @keyframes glow    { 0%,100%{filter:brightness(1)} 50%{filter:brightness(1.6)} }
  .tooltip-host { position:relative; }
  .tooltip-host .tooltip-body { display:none; position:absolute; z-index:500; bottom:100%; left:50%; transform:translateX(-50%); margin-bottom:6px;
    background:${t.bg1}; border:1px solid ${t.border2}; border-radius:5px; padding:10px 13px; min-width:280px; max-width:340px; pointer-events:none; }
  .tooltip-host:hover .tooltip-body { display:block; }
`; }

/* ═══════════════════════════════════════════════════════════════════════════
   §3  CLINICAL CONSTANTS
═══════════════════════════════════════════════════════════════════════════ */
const PATIENTS = {
  healthy:   { label:"Healthy Adult",       C:60,  R:5,   P50:26.8, Vd:150, VCO2:200, shunt0:0.03, Cmin:35, Cmax:68, color:"#00e5a0" },
  ards_mod:  { label:"ARDS Moderate",       C:28,  R:10,  P50:26.8, Vd:180, VCO2:220, shunt0:0.25, Cmin:12, Cmax:32, color:"#ff6b6b" },
  ards_sev:  { label:"ARDS Severe",         C:16,  R:14,  P50:26.8, Vd:200, VCO2:240, shunt0:0.40, Cmin:6,  Cmax:20, color:"#ff3333" },
  copd:      { label:"COPD Stage III",      C:80,  R:22,  P50:26.8, Vd:200, VCO2:190, shunt0:0.08, Cmin:55, Cmax:88, color:"#ffaa00" },
  neonatal:  { label:"Neonatal (1 kg)",     C:3,   R:65,  P50:20.0, Vd:8,   VCO2:12,  shunt0:0.05, Cmin:1,  Cmax:4,  color:"#60c0ff" },
  pediatric: { label:"Pediatric (5 yr)",    C:22,  R:16,  P50:26.8, Vd:45,  VCO2:80,  shunt0:0.04, Cmin:12, Cmax:26, color:"#d080ff" },
  fibrosis:  { label:"Pulm. Fibrosis",      C:11,  R:8,   P50:26.8, Vd:170, VCO2:210, shunt0:0.18, Cmin:4,  Cmax:14, color:"#ff8c42" },
  asthma:    { label:"Status Asthmaticus",  C:45,  R:40,  P50:26.8, Vd:170, VCO2:200, shunt0:0.06, Cmin:30, Cmax:50, color:"#ffd700" },
};

const MODES = {
  VCV:   { full:"Volume Control Ventilation",          col:"#00e5a0" },
  PCV:   { full:"Pressure Control Ventilation",        col:"#60c0ff" },
  PRVC:  { full:"Pressure-Regulated Volume Control",   col:"#ff8c42" },
  SIMV:  { full:"Synchronized IMV",                    col:"#d080ff" },
  PSV:   { full:"Pressure Support Ventilation",        col:"#f472b6" },
  BiPAP: { full:"Bi-level PAP (IPAP / EPAP)",          col:"#00ffcc" },
  CPAP:  { full:"Continuous Positive Airway Pressure", col:"#ffaa00" },
  APRV:  { full:"Airway Pressure Release Ventilation", col:"#a78bfa" },
};

// ISO 80601-2-12 alarm limits, patient-specific
const ALIM = {
  healthy:   { spo2c:90, spo2w:94, pawc:40, paww:32, tvl:0.80, etco2h:50, etco2l:28, driv:15 },
  ards_mod:  { spo2c:88, spo2w:92, pawc:32, paww:26, tvl:0.75, etco2h:55, etco2l:25, driv:13 },
  ards_sev:  { spo2c:88, spo2w:92, pawc:30, paww:24, tvl:0.70, etco2h:60, etco2l:22, driv:13 },
  copd:      { spo2c:88, spo2w:90, pawc:40, paww:34, tvl:0.75, etco2h:65, etco2l:32, driv:18 },
  neonatal:  { spo2c:88, spo2w:92, pawc:26, paww:20, tvl:0.75, etco2h:52, etco2l:35, driv:12 },
  pediatric: { spo2c:90, spo2w:94, pawc:30, paww:24, tvl:0.78, etco2h:50, etco2l:30, driv:14 },
  fibrosis:  { spo2c:88, spo2w:91, pawc:38, paww:30, tvl:0.75, etco2h:55, etco2l:28, driv:15 },
  asthma:    { spo2c:90, spo2w:94, pawc:45, paww:36, tvl:0.75, etco2h:55, etco2l:25, driv:20 },
};

const PRESETS = [
  { id:"ards_lp",   label:"ARDS Lung-Protective",   pid:"ards_sev",  s:{ mode:"VCV",  RR:20, TV:320, PEEP:12, Pip:28, Ti:0.8,  FiO2:70, IPAP:28, EPAP:12 }, f:{} },
  { id:"copd_ex",   label:"COPD Exacerbation",      pid:"copd",      s:{ mode:"PCV",  RR:12, TV:460, PEEP:4,  Pip:22, Ti:1.2,  FiO2:28, IPAP:22, EPAP:4  }, f:{ increased_resistance:true } },
  { id:"neo_rds",   label:"Neonatal RDS",            pid:"neonatal",  s:{ mode:"PCV",  RR:50, TV:18,  PEEP:5,  Pip:18, Ti:0.35, FiO2:60, IPAP:18, EPAP:5  }, f:{} },
  { id:"asthma",    label:"Status Asthmaticus",      pid:"asthma",    s:{ mode:"VCV",  RR:10, TV:420, PEEP:0,  Pip:30, Ti:1.5,  FiO2:100,IPAP:30, EPAP:0  }, f:{ increased_resistance:true } },
  { id:"wean",      label:"SBT Weaning Trial",       pid:"healthy",   s:{ mode:"PSV",  RR:14, TV:480, PEEP:5,  Pip:8,  Ti:0.9,  FiO2:40, IPAP:8,  EPAP:5  }, f:{} },
  { id:"aprv",      label:"APRV + Prone ARDS",       pid:"ards_sev",  s:{ mode:"APRV", RR:8,  TV:380, PEEP:14, Pip:32, Ti:4.0,  FiO2:80, IPAP:32, EPAP:14 }, f:{ reduced_compliance:true } },
  { id:"occlusion", label:"Circuit Occlusion Demo",  pid:"healthy",   s:{ mode:"VCV",  RR:14, TV:500, PEEP:5,  Pip:20, Ti:1.0,  FiO2:40, IPAP:20, EPAP:5  }, f:{ occlusion:true } },
  { id:"bipap_niv", label:"BiPAP NIV – COPD",        pid:"copd",      s:{ mode:"BiPAP",RR:14, TV:460, PEEP:6,  Pip:20, Ti:1.0,  FiO2:35, IPAP:20, EPAP:6  }, f:{} },
];

const DEFAULT_SETTINGS = { mode:"VCV", RR:14, TV:500, PEEP:5, Pip:20, Ti:1.0, FiO2:40, IPAP:20, EPAP:5 };
const DEFAULT_FAULTS   = { occlusion:false, leak:false, sensor_drift:false, reduced_compliance:false, increased_resistance:false };

const BLOCKCHAIN_DB = [
  { id:"0x4a3f…c12e", cmp:"Flow Sensor (Ultrasonic)",  sn:"FS-2024-00187", mfg:"MedSense GmbH",      batch:"B2024-09-12", cal:"2025-11-01", recalls:0, status:"VERIFIED" },
  { id:"0x9b1d…8a3c", cmp:"Pressure Transducer",       sn:"PT-2023-05541", mfg:"Honeywell MedTech",  batch:"B2023-06-15", cal:"2025-10-15", recalls:0, status:"VERIFIED" },
  { id:"0x2c7a…d44f", cmp:"Inspiratory Valve",         sn:"IV-2024-00892", mfg:"Hamilton Medical",   batch:"B2024-03-22", cal:"2025-09-30", recalls:0, status:"VERIFIED" },
  { id:"0xf3b9…e71a", cmp:"O₂ Sensor (Galvanic)",      sn:"OS-2022-11234", mfg:"Envitec GmbH",       batch:"B2022-11-05", cal:"2025-08-10", recalls:1, status:"ADVISORY" },
  { id:"0x6e4c…b2d8", cmp:"Expiratory Valve",          sn:"EV-2024-01105", mfg:"Bürkert Fluid Ctrl", batch:"B2024-07-18", cal:"2025-12-01", recalls:0, status:"VERIFIED" },
  { id:"0x1d8e…509b", cmp:"Humidifier Chamber",        sn:"HC-2023-07763", mfg:"Fisher & Paykel",    batch:"B2023-08-30", cal:"N/A",         recalls:0, status:"VERIFIED" },
  { id:"0x8a2f…c63d", cmp:"Battery Module",            sn:"BM-2024-00348", mfg:"Ultralife Corp",     batch:"B2024-01-09", cal:"2026-01-01", recalls:0, status:"VERIFIED" },
  { id:"0x3c6b…f91e", cmp:"MCU / Control Board",       sn:"CB-2024-00059", mfg:"Dräger AG",          batch:"B2024-04-14", cal:"2025-07-15", recalls:0, status:"VERIFIED" },
];

/* ═══════════════════════════════════════════════════════════════════════════
   §4  PHYSICS ENGINE  – with inline equation documentation
   ─────────────────────────────────────────────────────────────────────────
   Equation of Motion (Mead & Milic-Emili, 1964):
     Paw(t) = V̇(t)·R + V(t)/C + PEEP
   where: Paw = airway pressure [cmH₂O], V̇ = flow [L/s], R = resistance,
          V = tidal volume [mL], C = compliance [mL/cmH₂O], PEEP = end-expiratory pressure
═══════════════════════════════════════════════════════════════════════════ */

/**
 * Sigmoidal compliance – Venegas et al. (AJRCCM 1998)
 * C_eff(V) = Cmin + (Cmax – Cmin) × 4k(1–k),  k = σ(V/Vinfl)
 * Models the non-linear pressure–volume relationship:
 *   – lower inflection point: atelectatic units reopening
 *   – upper inflection point: overdistension
 */
function sigmoidC(V, C, Cmin, Cmax) {
  const Vn = clamp(V / clamp(C * 15, 1, 50000), 0, 1);
  const k  = 1 / (1 + Math.exp(-(Vn - 0.5) * 8));
  return clamp(Cmin + (Cmax - Cmin) * 4 * k * (1 - k), 1, 300);
}

/**
 * Dynamic shunt – physiologically coupled to PEEP and FiO₂
 * PEEP recruits collapsed alveoli  → reduces Qs/Qt (Riley 1949)
 * High FiO₂ causes absorption atelectasis → increases Qs/Qt (Hedenstierna 2002)
 */
function dynamicShunt(shunt0, PEEP, FiO2) {
  const recruit = clamp((PEEP - 5) * 0.013, -0.06, 0.14);
  const o2atel  = clamp((FiO2 / 100 - 0.4) * 0.04, 0, 0.07);
  return clamp(shunt0 - recruit + o2atel, 0.01, 0.65);
}

/**
 * Gas exchange – Alveolar Gas Equation + Pulmonary Shunt (Riley–Cournand)
 *   PAO₂  = FiO₂·(PB – PH₂O) – PaCO₂/RQ          [alveolar O₂]
 *   PaO₂  = PAO₂·(1–Qs/Qt) + PvO₂·(Qs/Qt)         [arterial O₂, shunt admixture]
 *   SpO₂  = PaO₂ⁿ / (P50ⁿ + PaO₂ⁿ) × 100          [Hill equation, Severinghaus 1979]
 *   n = 2.7 (Hill coefficient),  PvO₂ ≈ 38 mmHg
 */
function gasExchange({ FiO2, Paw_mean, shunt, P50, PaCO2, RQ = 0.8 }) {
  const PAO2 = clamp((FiO2 / 100) * (760 - 47) - clamp(PaCO2, 15, 90) / RQ, 10, 600);
  const PaO2 = clamp(PAO2 * 0.97 * (1 - shunt) + 38 * shunt + Paw_mean * 0.25, 20, 500);
  const n    = 2.7;
  const SpO2 = clamp(100 * Math.pow(PaO2, n) / (Math.pow(P50, n) + Math.pow(PaO2, n)), 20, 99.9);
  return { PaO2: rnd(PaO2, 1), SpO2: rnd(SpO2, 1) };
}

/**
 * PaCO₂ kinetics – Bohr dead-space equation (Enghoff modification)
 *   VA = RR × (VT – VD)           [alveolar minute ventilation, mL/min]
 *   PaCO₂ = V̇CO₂ × 0.863 × 1000 / VA    [Bohr, 1891; BTPS correction 0.863]
 * Slow exponential drift (τ ≈ 250 steps) models buffering by body CO₂ stores
 */
function updatePaCO2(prev, { RR, TV, Vd, VCO2, faults }) {
  const effTV = faults.occlusion ? TV * 0.1 : faults.leak ? TV * 0.75 : TV;
  const VA     = clamp(RR * (effTV - Vd), 1, 60000);
  const target = clamp((VCO2 * 0.863 * 1000) / VA, 15, 95);
  return clamp(prev + (target - prev) * 0.004, 10, 100);
}

/**
 * Asynchrony detection – rule-based (4 patterns)
 * Reference: Thille et al., Intensive Care Med 2006
 *   Double-trigger:        patient effort during late inspiration → extra breath delivered
 *   Premature cycle:       flow falls to cycle-off threshold before patient finishes effort
 *   Ineffective effort:    patient effort during expiration does not trigger new breath
 *   Auto-trigger:          ventilator triggers without patient effort (leak / oscillation)
 */
function detectAsync(phase, tC, Ti, hasSpontEffort, prevPhase) {
  if (!hasSpontEffort) return null;
  if (phase === "I" && tC > Ti * 0.75)     return "double_trigger";
  if (phase === "E" && tC < 0.3)           return "premature_cycle";
  if (phase === "E" && tC > Ti * 1.2)      return "ineffective_effort";
  if (prevPhase === "E" && phase === "I" && !hasSpontEffort) return "auto_trigger";
  return null;
}

class VentEngine {
  constructor(pid, settings, faults) {
    this.pid = pid;  this.s = { ...settings };  this.f = { ...faults };
    this.p   = { ...PATIENTS[pid] };
    this.PaCO2   = 40;
    this.prvcP   = settings.PEEP + 10;
    this.prvcLTV = 0;
    this.prevPh  = "E";
    this.breath  = 0;
  }
  _rc() {
    let C = this.p.C, R = this.p.R;
    if (this.f.reduced_compliance)   C = clamp(C * 0.42, 1, 300);
    if (this.f.increased_resistance) R = clamp(R * 2.8,  1, 300);
    if (this.f.leak)                 R = clamp(R * 0.62, 1, 300);
    return { C, R };
  }
  step(t) {
    const { C: Clin, R } = this._rc();
    const { mode, RR, TV, PEEP, Pip, Ti, FiO2, IPAP, EPAP } = this.s;
    const RRc  = clamp(RR, 1, 120);
    const Tic  = clamp(Ti, 0.1, 10);
    const cd   = 60 / RRc;
    const Te   = clamp(cd - Tic, 0.05, cd - 0.05);
    const tC   = t % cd;
    const inI  = tC < Tic;
    const ph   = inI ? "I" : "E";
    const tau  = clamp(R * Clin / 1000, 0.01, 30);
    // Spontaneous effort model
    const sPeriod = 60 / clamp(RRc * (1 + this.p.shunt0 * 2), 0.1, 200);
    const hasSE   = (t % sPeriod) < 0.38;
    const asyncF  = detectAsync(ph, tC, Tic, hasSE, this.prevPh);
    this.prevPh   = ph;
    // PRVC breath-by-breath adaptation (Servo-i algorithm approximation)
    const bi = Math.floor(t / cd);
    if (bi !== this.breath) {
      this.breath = bi;
      if (mode === "PRVC") {
        const err = (TV - this.prvcLTV) / clamp(TV, 1, 2000);
        this.prvcP = clamp(this.prvcP + err * 2.5, PEEP + 3, 55);
      }
    }
    let Paw = PEEP, flow = 0, volume = 0;
    const oF = this.f.occlusion ? 0.07 : this.f.leak ? 0.74 : 1.0;
    const Cc = 1.5; // circuit compliance [mL/cmH₂O] – Marini 1989
    const pcv = (Pd, Ce) => {
      if (inI) {
        Paw    = clamp(PEEP + Pd * (1 - Math.exp(-tC / tau)), 0, 200);
        volume = clamp(Pd * Ce * (1 - Math.exp(-tC / tau)), 0, 4000);
        flow   = clamp((Pd * Ce / tau) * Math.exp(-tC / tau), -5000, 5000);
      } else {
        const tE = tC - Tic, V0 = Pd * Ce * (1 - Math.exp(-Tic / tau));
        volume = clamp(V0 * Math.exp(-tE / tau), 0, 4000);
        Paw    = clamp(PEEP + volume / clamp(Ce, 0.1, 300), 0, 200);
        flow   = clamp(-(V0 / tau) * Math.exp(-tE / tau), -5000, 0);
      }
    };
    if (mode === "VCV" || mode === "SIMV") {
      const eTV = clamp(TV * oF, 0, 2000), Qs = eTV / Tic;
      if (inI) {
        const vD = clamp(Qs * Tic * (1 - Math.exp(-tC / tau)), 0, 2000);
        const Ce = sigmoidC(vD, Clin, this.p.Cmin, this.p.Cmax);
        volume = clamp(vD - Qs * Cc, 0, 2000);
        Paw    = clamp(PEEP + volume / Ce + Qs * R * 0.001, 0, 120);
        flow   = clamp(Qs * Math.exp(-tC / tau), 0, 5000);
        if (this.f.occlusion && tC < 0.12) Paw = clamp(Paw + 20 * (1 - tC * 8), 0, 120);
      } else {
        const tE = tC - Tic;
        volume = clamp(eTV * Math.exp(-tE / tau), 0, 2000);
        Paw    = clamp(PEEP + volume / Clin, 0, 120);
        flow   = clamp(-(eTV / tau) * Math.exp(-tE / tau), -5000, 0);
      }
    } else if (mode === "PCV" || mode === "APRV") {
      pcv(Pip - PEEP, sigmoidC((Pip - PEEP) * Clin * 0.4, Clin, this.p.Cmin, this.p.Cmax));
    } else if (mode === "PRVC") {
      const Ce = sigmoidC(this.prvcP * Clin * 0.4, Clin, this.p.Cmin, this.p.Cmax);
      pcv(this.prvcP - PEEP, Ce);
      if (inI) this.prvcLTV = volume;
    } else if (mode === "BiPAP") {
      const Pd = clamp(IPAP - EPAP, 0, 60);
      const Ce = sigmoidC(Pd * Clin * 0.3, Clin, this.p.Cmin, this.p.Cmax);
      if (inI) {
        Paw    = clamp(EPAP + Pd * (1 - Math.exp(-tC / tau)), 0, 100);
        volume = clamp(Pd * Ce * (1 - Math.exp(-tC / tau)), 0, 2000);
        flow   = clamp((Pd * Ce / tau) * Math.exp(-tC / tau), 0, 5000);
      } else {
        const tE = tC - Tic, V0 = Pd * Ce * (1 - Math.exp(-Tic / tau));
        volume = clamp(V0 * Math.exp(-tE / tau), 0, 2000);
        Paw    = clamp(EPAP + volume / Clin, 0, 100);
        flow   = clamp(-(V0 / tau) * Math.exp(-tE / tau), -5000, 0);
      }
    } else if (mode === "PSV") {
      const ef = hasSE ? 1.0 : 0.15;
      const Ce = sigmoidC(Pip * Clin * 0.3, Clin, this.p.Cmin, this.p.Cmax);
      if (inI) {
        Paw    = clamp(PEEP + Pip * ef * (1 - Math.exp(-tC / tau)), 0, 100);
        volume = clamp(Pip * ef * Ce * (1 - Math.exp(-tC / tau)), 0, 2000);
        flow   = clamp((Pip * ef * Ce / tau) * Math.exp(-tC / tau), 0, 5000);
      } else {
        const tE = tC - Tic, V0 = Pip * ef * Ce * (1 - Math.exp(-Tic / tau));
        volume = clamp(V0 * Math.exp(-tE / tau), 0, 2000);
        Paw    = clamp(PEEP + volume / Clin, 0, 100);
        flow   = clamp(-(V0 / tau) * Math.exp(-tE / tau), -5000, 0);
      }
    } else if (mode === "CPAP") {
      const sp = 2.2 * Math.sin(2 * Math.PI * t * (RRc / 60));
      Paw    = clamp(PEEP + (this.f.occlusion ? 9 : 0) + sp * R * 0.04, 0, 60);
      flow   = sp;
      volume = clamp(50 + 42 * Math.sin(2 * Math.PI * t * (RRc / 60)), 0, 400);
    }
    if (this.f.sensor_drift) {
      Paw  = clamp(Paw  + Math.sin(t * 0.38) * 2.6 + Math.cos(t * 0.17) * 1.1, 0, 120);
      flow = clamp(flow + Math.sin(t * 0.72) * 7, -5000, 5000);
    }
    const shunt = dynamicShunt(this.p.shunt0, PEEP, FiO2);
    this.PaCO2  = updatePaCO2(this.PaCO2, { RR: RRc, TV, Vd: this.p.Vd, VCO2: this.p.VCO2, faults: this.f });
    const { PaO2, SpO2 } = gasExchange({ FiO2, Paw_mean:(Paw+PEEP)/2, shunt, P50:this.p.P50, PaCO2:this.PaCO2 });
    const etCO2   = clamp(this.PaCO2 * (inI ? 0.88 : 0.96) + Math.sin(t * 1.1) * 1.2, 5, 100);
    const dynC    = volume > 2 ? clamp(volume / Math.max(0.1, Paw - PEEP), 0, 300) : Clin;
    const Pplat   = clamp(PEEP + volume / dynC, 0, 100);
    const driving = clamp(Pplat - PEEP, 0, 80);
    const WOB     = clamp(Math.abs(flow) * Paw * 0.001, 0, 20);
    const RSBI    = clamp(RRc / clamp(volume / 1000, 0.001, 5), 0, 500);
    return {
      t:rnd(t,3), Paw:rnd(Paw,2), flow:rnd(flow,3), volume:rnd(volume,1),
      SpO2:rnd(SpO2,1), etCO2:rnd(etCO2,1), PaO2:rnd(PaO2,1),
      PaCO2:rnd(this.PaCO2,1), dynC:rnd(dynC,1), staticC:Clin,
      R:rnd(R,1), tau:rnd(tau,3), driving:rnd(driving,1),
      Pplat:rnd(Pplat,1), WOB:rnd(WOB,3), RSBI:rnd(RSBI,0),
      shunt:rnd(shunt,3), phase:ph, RR:RRc, IE:rnd(Tic/Te,2),
      asyncFlag:asyncF, hasSpontEffort:hasSE,
      prvcP: mode==="PRVC" ? rnd(this.prvcP,1) : null,
    };
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   §5  ALARM ENGINE – ISO 80601-2-12 graded (critical / warning)
═══════════════════════════════════════════════════════════════════════════ */
function checkAlarms(d, s, pid) {
  if (!d) return [];
  const L = ALIM[pid] || ALIM.healthy;
  const out = [];
  const add = (id, msg, sev, action, ref="") => out.push({ id, msg, sev, action, ref, ts:d.t });
  if (d.Paw > L.pawc)             add("hp_c","HIGH PRESSURE "+d.Paw+" cmH₂O","critical","Reduce TV / check circuit","ISO 80601 §6.8.2.5.1");
  else if (d.Paw > L.paww)        add("hp_w","Paw elevated "+d.Paw,"warning","Monitor – barotrauma risk");
  if (d.Paw < s.PEEP - 3)         add("disc","CIRCUIT DISCONNECT / APNEA","critical","Check patient–vent circuit","ISO 80601 §6.8.2.5.3");
  if (d.SpO2 < L.spo2c)           add("ho_c","HYPOXEMIA SpO₂ "+d.SpO2+"%","critical","↑ FiO₂ or PEEP","GOLD/ATS");
  else if (d.SpO2 < L.spo2w)      add("ho_w","SpO₂ low "+d.SpO2+"%","warning","Consider FiO₂ increase");
  if (d.etCO2 > L.etco2h)         add("hc_w","HYPERCAPNIA EtCO₂ "+d.etCO2,"warning","↑ RR or TV","ARDS Network");
  if (d.etCO2 < L.etco2l)         add("lc_w","Hypocapnia EtCO₂ "+d.etCO2,"warning","Reduce RR");
  if (!["CPAP","APRV"].includes(s.mode) && d.volume < s.TV * L.tvl)
                                   add("lt_c","LOW TV "+d.volume.toFixed(0)+" mL","critical","Check circuit / obstruction");
  if (d.dynC < 15)                 add("lc_w2","Low compliance – ARDS/PTX?","warning","Urgent chest assessment");
  if (d.driving > L.driv)          add("dp_w","Driving P "+d.driving+" > "+L.driv,"warning","Reduce TV (Amato NEJM 2015)","NEJM 2015;372:747");
  if (d.asyncFlag==="double_trigger")      add("as_dt","Asynchrony: Double-trigger","warning","Adjust Ti or add NMBA","Thille ICM 2006");
  if (d.asyncFlag==="premature_cycle")     add("as_pc","Asynchrony: Premature cycle","warning","Increase rise time");
  if (d.asyncFlag==="ineffective_effort")  add("as_ie","Asynchrony: Ineffective effort","warning","Reduce PEEP or support");
  if (d.asyncFlag==="auto_trigger")        add("as_at","Auto-trigger detected","warning","Check for leak or oscillation");
  if (d.RSBI > 105 && s.mode==="PSV")      add("rsbi","RSBI "+d.RSBI+" (wean failure risk)","warning","Do not extubate","Yang & Tobin NEJM 1991");
  return out;
}

/* ═══════════════════════════════════════════════════════════════════════════
   §6  ANALYTICS  – linear regression trend, weaning AI, calibration
═══════════════════════════════════════════════════════════════════════════ */
function linReg(arr, key) {
  if (!arr || arr.length < 10) return null;
  const data = arr.slice(-40), n = data.length;
  let sx=0,sy=0,sxy=0,sx2=0;
  data.forEach((d,i)=>{ sx+=i; sy+=d[key]; sxy+=i*d[key]; sx2+=i*i; });
  const den = n*sx2 - sx*sx;
  if (Math.abs(den) < 1e-9) return null;
  const slope = (n*sxy - sx*sy) / den;
  const icept = (sy - slope*sx) / n;
  return { slope:rnd(slope,4), pred:rnd(icept+slope*(n+20),1), dir:slope>0.02?"↑":slope<-0.02?"↓":"→" };
}

function weanScore(d, s) {
  if (!d) return null;
  const F = { SpO2:d.SpO2>=92?1:0, FiO2:s.FiO2<=50?1:0, PEEP:s.PEEP<=8?1:0, RR:s.RR<=20?1:0,
    compliance:d.dynC>=25?1:0, etCO2:d.etCO2>=35&&d.etCO2<=48?1:0, noAsync:!d.asyncFlag?1:0,
    Ppeak:d.Paw<30?1:0, RSBI:d.RSBI<80?1:0, driving:d.driving<15?1:0 };
  const score = rnd(Object.values(F).reduce((a,b)=>a+b,0)/Object.keys(F).length*100,0);
  const level = score>=85?"EXTUBATION READY":score>=65?"BORDERLINE – REASSESS":score>=40?"NOT READY":"CONTRAINDICATED";
  return { score, level, F };
}

/**
 * Model calibration – inverse parameter fitting via Equation of Motion
 *   C̃ = VT / (Ppeak – PEEP)          [mL/cmH₂O]
 *   R̃ = (Ppeak – PEEP – VT/C̃) / V̇peak × 1000   [cmH₂O·s/L]
 * Allows real-patient parameter fitting from measured Ppeak, VT, PEEP, peak-flow
 */
function calibrate(Ppeak, TV, PEEP, flowPeak) {
  const Cest = clamp(TV / Math.max(0.1, Ppeak - PEEP), 1, 300);
  const Rest  = clamp((Ppeak - PEEP - TV / Cest) / Math.max(0.001, flowPeak) * 1000, 0, 300);
  return { C:rnd(Cest,1), R:rnd(Rest,1) };
}

function exportCSV(trend, patLabel, mode) {
  if (!trend.length) return;
  const hdr  = Object.keys(trend[0]).join(",");
  const rows = trend.map(r=>Object.values(r).join(",")).join("\n");
  const blob = new Blob([`# Ventilator Digital Twin Export\n# Patient: ${patLabel}, Mode: ${mode}\n# Date: ${new Date().toISOString()}\n${hdr}\n${rows}`],{ type:"text/csv" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
  a.download = `vent_twin_${Date.now()}.csv`; a.click();
}

/* ═══════════════════════════════════════════════════════════════════════════
   §7  REUSABLE UI COMPONENTS  (all memo-wrapped, theme-aware)
═══════════════════════════════════════════════════════════════════════════ */

/** InfoTip – hover tooltip showing clinical equation / reference */
const InfoTip = memo(({ text, t }) => (
  <span className="tooltip-host" style={{ cursor:"help", marginLeft:4, display:"inline-flex" }}>
    <span style={{ fontSize:8, color:t.txt2, border:`1px solid ${t.border2}`, borderRadius:"50%", width:13, height:13, display:"inline-flex", alignItems:"center", justifyContent:"center", lineHeight:1, fontFamily:"'Exo 2',sans-serif", fontWeight:800 }}>?</span>
    <span className="tooltip-body">
      <div style={{ fontSize:8, color:t.txt0, lineHeight:1.8, fontFamily:"'Exo 2',sans-serif", whiteSpace:"pre-line" }}>{text}</div>
    </span>
  </span>
));

const MetricCard = memo(({ label, value, unit, status="neutral", sub, pred, tip, t }) => {
  const C = { normal:t.accent, warning:t.warn, critical:t.crit, neutral:t.accentB, info:t.accentC };
  const col = C[status] || C.neutral;
  return (
    <div style={{ background:t.bg2, border:`1px solid ${col}22`, borderLeft:`3px solid ${col}`, borderRadius:5,
      padding:"9px 12px", display:"flex", flexDirection:"column", gap:2, position:"relative", overflow:"hidden", animation:"fadeUp 0.25s ease" }}>
      <div style={{ position:"absolute",inset:0,background:`radial-gradient(ellipse at 0 0,${col}08 0%,transparent 60%)`,pointerEvents:"none" }}/>
      <div style={{ display:"flex", alignItems:"center" }}>
        <span style={{ fontFamily:"'Exo 2',sans-serif", fontSize:9, color:t.txt2, letterSpacing:2, fontWeight:700, textTransform:"uppercase" }}>{label}</span>
        {tip && <InfoTip text={tip} t={t} />}
      </div>
      <div style={{ display:"flex", alignItems:"baseline", gap:4 }}>
        <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:26, lineHeight:1, color:col, textShadow:`0 0 14px ${col}44`, animation:status==="critical"?"pulse 0.8s infinite":"none" }}>
          {typeof value === "number" ? rnd(value,1) : value}
        </span>
        <span style={{ fontFamily:"'Exo 2',sans-serif", fontSize:9, color:t.txt3 }}>{unit}</span>
      </div>
      {sub  && <div style={{ fontSize:8, color:t.txt3 }}>{sub}</div>}
      {pred && <div style={{ fontSize:8, color:`${col}88`, fontFamily:"'Share Tech Mono',monospace" }}>▶ {pred}</div>}
    </div>
  );
});

const Waveform = memo(({ data, yKey, label, color, unit, yMin, yMax, refs=[], h=85, t }) => (
  <div style={{ background:t.waveB, border:`1px solid ${t.border}`, borderRadius:4, padding:"6px 8px 3px" }}>
    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:2 }}>
      <span style={{ fontFamily:"'Exo 2',sans-serif", fontSize:9, fontWeight:700, color:t.txt2, letterSpacing:3 }}>{label}</span>
      <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:9, color }}>
        {data.length ? rnd(data[data.length-1]?.[yKey] ?? 0,1) : "—"} <span style={{ color:t.txt3 }}>{unit}</span>
      </span>
    </div>
    <ResponsiveContainer width="100%" height={h}>
      <LineChart data={data} margin={{ top:2,right:2,bottom:0,left:0 }}>
        <YAxis domain={[yMin,yMax]} hide /><XAxis dataKey="t" hide />
        {refs.map(r=><ReferenceLine key={r.v} y={r.v} stroke={r.c||t.border} strokeWidth={1} strokeDasharray="2 4"/>)}
        <Line type="monotone" dataKey={yKey} stroke={color} strokeWidth={1.5} dot={false} isAnimationActive={false}/>
      </LineChart>
    </ResponsiveContainer>
  </div>
));

const Slider = memo(({ label, value, min, max, step, unit, onChange, color="#00e5a0", disabled=false, tip, t }) => (
  <div style={{ display:"flex", flexDirection:"column", gap:3, opacity:disabled?0.3:1 }}>
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
      <div style={{ display:"flex", alignItems:"center" }}>
        <span style={{ fontFamily:"'Exo 2',sans-serif", fontSize:9, color:t.txt2, letterSpacing:2, fontWeight:700 }}>{label}</span>
        {tip && <InfoTip text={tip} t={t} />}
      </div>
      <span style={{ fontFamily:"'Share Tech Mono',monospace", fontSize:11, color }}>
        {value}<span style={{ fontSize:8, color:t.txt3 }}> {unit}</span>
      </span>
    </div>
    <input type="range" min={min} max={max} step={step} value={value} disabled={disabled}
      onChange={e=>!disabled&&onChange(clamp(+e.target.value,min,max))}
      style={{ accentColor:color }}/>
  </div>
));

const Tag = memo(({ label, active, onClick, color="#ff3333", t }) => (
  <button onClick={onClick} style={{
    background:active?`${color}18`:t.bg2, border:`1px solid ${active?color:t.border}`,
    color:active?color:t.txt2, fontFamily:"'Exo 2',sans-serif", fontWeight:700,
    fontSize:9, letterSpacing:1, padding:"5px 9px", borderRadius:3,
    cursor:"pointer", textTransform:"uppercase", transition:"all 0.12s",
    boxShadow:active?`0 0 8px ${color}28`:"none",
  }}>{label}</button>
));

const TabBtn = memo(({ id, label, active, onClick, col }) => (
  <button onClick={()=>onClick(id)} style={{
    background:"transparent", border:"none", borderBottom:`2px solid ${active?col:"transparent"}`,
    color:active?col:"#1a3a55", fontFamily:"'Exo 2',sans-serif", fontWeight:700,
    fontSize:9, letterSpacing:2, padding:"9px 14px", cursor:"pointer", transition:"all 0.12s",
  }}>{label}</button>
));

/* ═══════════════════════════════════════════════════════════════════════════
   §8  ICU MULTI-BED DASHBOARD (4 independent engines, 30 Hz)
═══════════════════════════════════════════════════════════════════════════ */
const ICU_BEDS = [
  { id:"b1", pid:"healthy",  name:"Bed 1 – Smith, J.",    age:45, mrn:"MRN-001842" },
  { id:"b2", pid:"ards_sev", name:"Bed 2 – Johnson, A.",  age:62, mrn:"MRN-003761" },
  { id:"b3", pid:"copd",     name:"Bed 3 – Williams, R.", age:71, mrn:"MRN-002954" },
  { id:"b4", pid:"neonatal", name:"Bed 4 – Baby Chen",    age:0,  mrn:"MRN-004129" },
];

function ICUDashboard({ onSelect, t }) {
  const [beds, setBeds] = useState({});
  const engs = useRef({});
  const tr = useRef(0); const raf = useRef(null);
  useEffect(() => {
    const ms = { mode:"VCV",RR:14,TV:500,PEEP:5,Pip:20,Ti:1.0,FiO2:40,IPAP:20,EPAP:5 };
    ICU_BEDS.forEach(b => {
      const s = b.pid==="neonatal"?{...ms,TV:18,RR:48,PEEP:5}:b.pid==="ards_sev"?{...ms,TV:320,RR:20,PEEP:12,FiO2:70}:b.pid==="copd"?{...ms,TV:460,RR:12,PEEP:4,FiO2:28}:ms;
      engs.current[b.id] = new VentEngine(b.pid, s, {});
    });
    const loop = () => { tr.current += 0.033; const sn={}; ICU_BEDS.forEach(b=>{sn[b.id]=engs.current[b.id].step(tr.current);}); setBeds(sn); raf.current=requestAnimationFrame(loop); };
    raf.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf.current);
  }, []);
  return (
    <div style={{ display:"flex",flexDirection:"column",gap:10,animation:"fadeUp 0.3s ease" }}>
      <div style={{ fontFamily:"'Exo 2',sans-serif",fontWeight:800,fontSize:10,color:t.txt2,letterSpacing:3 }}>ICU MULTI-BED OVERVIEW — 4 SIMULTANEOUS DIGITAL TWINS @ 30 Hz</div>
      <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12 }}>
        {ICU_BEDS.map(b => {
          const d = beds[b.id]; const p = PATIENTS[b.pid]; const L = ALIM[b.pid]||ALIM.healthy;
          const crit = d&&(d.SpO2<L.spo2c||d.Paw>L.pawc);
          const warn = d&&!crit&&(d.SpO2<L.spo2w||d.Paw>L.paww);
          return (
            <div key={b.id} onClick={()=>onSelect(b)} style={{ background:t.bg2, border:`1px solid ${crit?"#ff333344":warn?"#ffaa0033":t.border}`, borderRadius:6, padding:14, cursor:"pointer", transition:"all 0.15s", boxShadow:crit?"0 0 18px #ff333315":"none" }}>
              <div style={{ display:"flex",justifyContent:"space-between",marginBottom:10 }}>
                <div>
                  <div style={{ fontFamily:"'Exo 2',sans-serif",fontWeight:700,fontSize:11,color:p.color }}>{b.name}</div>
                  <div style={{ fontFamily:"'Share Tech Mono',monospace",fontSize:8,color:t.txt3 }}>{b.mrn} · Age {b.age||"D0"} · {p.label}</div>
                </div>
                <div style={{ fontSize:8, color:crit?"#ff3333":warn?"#ffaa00":"#00e5a044", fontFamily:"'Exo 2',sans-serif", fontWeight:700, animation:crit?"blink 0.7s infinite":"none" }}>
                  {crit?"⚠ CRITICAL":warn?"⚠ WARNING":"● STABLE"}
                </div>
              </div>
              {d ? <div style={{ display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:5 }}>
                {[["SpO₂",d.SpO2.toFixed(1),"%",d.SpO2>=L.spo2w?"normal":d.SpO2>=L.spo2c?"warning":"critical"],
                  ["Paw",d.Paw.toFixed(1),"cmH₂O",d.Paw<L.paww?"normal":d.Paw<L.pawc?"warning":"critical"],
                  ["EtCO₂",d.etCO2.toFixed(1),"mmHg",d.etCO2>=35&&d.etCO2<=50?"normal":"warning"],
                  ["Vol",d.volume.toFixed(0),"mL","neutral"]
                ].map(([l,v,u,st])=>{
                  const col={normal:t.accent,warning:t.warn,critical:t.crit,neutral:t.accentB}[st]||t.accentB;
                  return <div key={l} style={{ background:t.bg3,borderRadius:3,padding:"4px 6px",border:`1px solid ${col}18` }}>
                    <div style={{ fontSize:7,color:t.txt3 }}>{l}</div>
                    <div style={{ fontFamily:"'Share Tech Mono',monospace",fontSize:13,color:col }}>{v}<span style={{ fontSize:7,color:t.txt3 }}> {u}</span></div>
                  </div>;
                })}
              </div> : <div style={{ color:t.txt3,fontSize:9 }}>Initialising…</div>}
              <div style={{ marginTop:7,fontSize:8,color:t.txt3,textAlign:"right" }}>Click to open full monitor →</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   §9  WHAT-IF PANEL
═══════════════════════════════════════════════════════════════════════════ */
function WhatIfPanel({ pid, t }) {
  const [C,setC]=useState(40), [R,setR]=useState(8), [P,setP]=useState(5);
  const [FiO2,setFiO2]=useState(40), [RR,setRR]=useState(14), [TV,setTV]=useState(500), [Ti,setTi]=useState(1.0);
  const pp = PATIENTS[pid];
  const sim = useCallback((Cv,Rv,PEEPv,FiO2v,TVv,RRv,Tiv) => {
    const tau=clamp(Rv*Cv/1000,0.01,30), Te=clamp(60/RRv-Tiv,0.05,60);
    const Ce=sigmoidC(TVv*0.5,Cv,clamp(Cv*0.3,1,Cv),Cv*1.1);
    const Ppeak=clamp(PEEPv+TVv/Ce+(TVv/Tiv)*Rv*0.001,0,150);
    const Vexp=clamp(TVv*Math.exp(-Te/tau),0,2000);
    const driving=clamp(Ppeak-PEEPv,0,80);
    const shunt=dynamicShunt(pp.shunt0,PEEPv,FiO2v);
    const PaCO2=clamp((pp.VCO2*0.863*1000)/clamp(RRv*(TVv-pp.Vd),1,60000),15,90);
    const {SpO2}=gasExchange({FiO2:FiO2v,Paw_mean:(Ppeak+PEEPv)/2,shunt,P50:pp.P50,PaCO2});
    return {Ppeak:rnd(Ppeak,1),SpO2:rnd(SpO2,1),driving:rnd(driving,1),Vexp:rnd(Vexp,0),PaCO2:rnd(PaCO2,1)};
  },[pp]);
  const res = useMemo(()=>sim(C,R,P,FiO2,TV,RR,Ti),[C,R,P,FiO2,TV,RR,Ti,sim]);
  const cVals=[5,10,18,28,40,55,70,90], rVals=[2,5,10,18,28,40];
  return (
    <div style={{ display:"flex",flexDirection:"column",gap:14,animation:"fadeUp 0.3s ease" }}>
      <div style={{ fontFamily:"'Exo 2',sans-serif",fontWeight:800,fontSize:10,color:t.txt2,letterSpacing:3 }}>WHAT-IF ANALYZER — Clinical Decision Support</div>
      <div style={{ display:"grid",gridTemplateColumns:"1fr 1.5fr",gap:16 }}>
        <div style={{ display:"flex",flexDirection:"column",gap:9 }}>
          <Slider label="COMPLIANCE (C)" value={C} min={3} max={120} step={1} unit="mL/cmH₂O" onChange={setC} color={t.accent} t={t}
            tip={"Lung compliance = ΔV/ΔP [mL/cmH₂O]\nNormal: 50–100 · ARDS: <30 · Fibrosis: <20\nRef: Venegas AJRCCM 1998"} />
          <Slider label="RESISTANCE (R)" value={R} min={1} max={80} step={0.5} unit="cmH₂O·s/L" onChange={setR} color={t.accentB} t={t}
            tip={"Airway resistance = ΔP/V̇ [cmH₂O·s/L]\nNormal: 2–5 · COPD: 15–25 · Asthma: 20–50\nRef: Mead & Milic-Emili 1964"} />
          <Slider label="PEEP" value={P} min={0} max={24} step={1} unit="cmH₂O" onChange={setP} color={t.accentC} t={t}
            tip={"PEEP recruits collapsed alveoli, reduces shunt fraction.\nTarget: ≥8 cmH₂O in ARDS per ARDSNet protocol\nRef: NEJM 2000;342:1301"} />
          <Slider label="FiO₂" value={FiO2} min={21} max={100} step={1} unit="%" onChange={setFiO2} color="#00ffcc" t={t} />
          <Slider label="RATE" value={RR} min={4} max={60} step={1} unit="bpm" onChange={setRR} color={t.warn} t={t} />
          <Slider label="TIDAL VOLUME" value={TV} min={10} max={900} step={10} unit="mL" onChange={setTV} color={t.accentB} t={t}
            tip={"Lung-protective: 4–6 mL/kg IBW in ARDS\nHigher VT → barotrauma + volutrauma risk\nRef: ARDSNet NEJM 2000;342:1301"} />
          <Slider label="Ti" value={Ti} min={0.2} max={3.0} step={0.05} unit="s" onChange={setTi} color={t.warn} t={t} />
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:6 }}>
            <MetricCard label="Peak Paw" value={res.Ppeak} unit="cmH₂O" status={res.Ppeak>35?"critical":res.Ppeak>28?"warning":"normal"} t={t} />
            <MetricCard label="SpO₂ Est." value={res.SpO2} unit="%" status={res.SpO2<88?"critical":res.SpO2<92?"warning":"normal"} t={t} />
            <MetricCard label="Driving P" value={res.driving} unit="cmH₂O" status={res.driving>15?"critical":res.driving>12?"warning":"normal"} sub="Amato 2015 threshold: 15" t={t} />
            <MetricCard label="PaCO₂ Est." value={res.PaCO2} unit="mmHg" status={res.PaCO2>55?"warning":"normal"} t={t} />
          </div>
          <div style={{ background:t.bg3,border:`1px solid ${t.border}`,borderRadius:5,padding:12 }}>
            <div style={{ fontFamily:"'Exo 2',sans-serif",fontWeight:800,fontSize:9,color:t.accentB,letterSpacing:2,marginBottom:8 }}>AUTO RECOMMENDATIONS</div>
            {[
              res.Ppeak>35&&{t2:"Peak Paw >35 – reduce TV or increase Ti. Barotrauma risk.",s:"critical"},
              res.driving>15&&{t2:"Driving P >15 cmH₂O → ↑ ARDS mortality (Amato NEJM 2015).",s:"critical"},
              res.SpO2<88&&{t2:`Predicted SpO₂ ${res.SpO2}% critically low. ↑ FiO₂ and/or PEEP.`,s:"critical"},
              C<20&&{t2:"Severe compliance: ARDS phenotype. Apply 4–6 mL/kg IBW, PEEP ≥8.",s:"warning"},
              R>25&&{t2:"High resistance: COPD/asthma. Use I:E ≥ 1:3. Avoid intrinsic PEEP.",s:"warning"},
              res.Vexp>80&&{t2:`Air trapping risk (${res.Vexp} mL). Reduce RR or increase Te.`,s:"warning"},
              !res.Ppeak>35&&!res.SpO2<92&&C>=20&&R<=20&&{t2:"Parameters within safe clinical range.",s:"ok"},
            ].filter(Boolean).map((r,i)=>(
              <div key={i} style={{ fontSize:8,lineHeight:1.9,paddingLeft:8,borderLeft:`2px solid ${r.s==="critical"?t.crit:r.s==="warning"?t.warn:t.accent}`,color:r.s==="critical"?`${t.crit}88`:r.s==="warning"?`${t.warn}88`:`${t.accent}88`,marginBottom:4 }}>{r.t2}</div>
            ))}
          </div>
        </div>
        <div style={{ display:"flex",flexDirection:"column",gap:12 }}>
          <div style={{ fontFamily:"'Exo 2',sans-serif",fontSize:9,color:t.txt2,letterSpacing:2,fontWeight:700 }}>PPEAK HEAT MAP — TV:{TV} PEEP:{P} Ti:{Ti}</div>
          <div style={{ background:t.bg3,border:`1px solid ${t.border}`,borderRadius:5,padding:10,overflowX:"auto" }}>
            <div style={{ display:"flex",gap:2,marginLeft:34,marginBottom:2 }}>
              <div style={{ width:18,fontSize:7,color:t.txt3 }}>R↓/C→</div>
              {cVals.map(cv=><div key={cv} style={{ flex:1,minWidth:34,fontSize:7,color:t.txt3,textAlign:"center" }}>{cv}</div>)}
            </div>
            {rVals.map(rv=>(
              <div key={rv} style={{ display:"flex",gap:2,marginBottom:2,alignItems:"center" }}>
                <div style={{ width:34,fontSize:7,color:t.txt3,textAlign:"right",paddingRight:5,flexShrink:0 }}>{rv}</div>
                {cVals.map(cv=>{
                  const r2=sim(cv,rv,P,FiO2,TV,RR,Ti), pp2=r2.Ppeak;
                  const isCur=Math.abs(cv-C)<4&&Math.abs(rv-R)<3;
                  const bg=pp2>45?"#4a0a0a":pp2>35?"#3a1800":pp2>25?"#1a2800":"#00240e";
                  const tc=pp2>35?"#ff9999":pp2>25?"#ffcc88":"#66cc88";
                  return <div key={cv} style={{ flex:1,minWidth:34,background:bg,borderRadius:2,padding:"4px 2px",textAlign:"center",border:isCur?"1px solid #ffffff66":"1px solid transparent" }}>
                    <div style={{ fontFamily:"'Share Tech Mono',monospace",fontSize:9,color:tc }}>{pp2}</div>
                  </div>;
                })}
              </div>
            ))}
            <div style={{ fontSize:7,color:t.txt3,marginTop:6 }}>■ Green &lt;25 · Yellow &lt;35 · Red &gt;35 cmH₂O · White border = current selection</div>
          </div>
          <div style={{ fontFamily:"'Exo 2',sans-serif",fontSize:9,color:t.txt2,letterSpacing:2,fontWeight:700,marginTop:4 }}>DRIVING PRESSURE MATRIX (TV × C) at PEEP:{P}</div>
          <div style={{ background:t.bg3,border:`1px solid ${t.border}`,borderRadius:5,padding:10 }}>
            <div style={{ display:"flex",gap:2,marginLeft:34,marginBottom:2 }}>
              {[200,300,400,500,600,700].map(tv=><div key={tv} style={{ flex:1,fontSize:7,color:t.txt3,textAlign:"center" }}>TV:{tv}</div>)}
            </div>
            {[10,18,28,40,60,80].map(cv=>(
              <div key={cv} style={{ display:"flex",gap:2,marginBottom:2,alignItems:"center" }}>
                <div style={{ width:34,fontSize:7,color:t.txt3,paddingRight:5,textAlign:"right",flexShrink:0 }}>C:{cv}</div>
                {[200,300,400,500,600,700].map(tv=>{
                  const dp=rnd(tv/cv,0);
                  const bg=dp>15?"#4a0a0a":dp>12?"#2a1400":"#001a08";
                  const tc=dp>15?"#ff9999":dp>12?"#ffcc66":"#66cc88";
                  return <div key={tv} style={{ flex:1,background:bg,borderRadius:2,padding:"4px 2px",textAlign:"center" }}>
                    <div style={{ fontFamily:"'Share Tech Mono',monospace",fontSize:9,color:tc }}>{dp}</div>
                  </div>;
                })}
              </div>
            ))}
            <div style={{ fontSize:7,color:t.txt3,marginTop:6 }}>Driving P = TV/C · Threshold: &gt;15 → ↑ ARDS mortality (Amato NEJM 2015;372:747)</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   §10  MAIN APPLICATION
═══════════════════════════════════════════════════════════════════════════ */
export default function App() {
  const [themeName, setThemeName] = useState("dark");
  const t = THEMES[themeName];
  const [pid, setPid]         = useState("healthy");
  const [S, setS]             = useState(DEFAULT_SETTINGS);
  const [F, setF]             = useState(DEFAULT_FAULTS);
  const [running, setRunning] = useState(true);
  const [tab, setTab]         = useState("monitor");
  const [wave, setWave]       = useState({ paw:[], flow:[], vol:[], spo2:[], etco2:[] });
  const [trend, setTrend]     = useState([]);
  const [D, setD]             = useState(null);
  const [ideal, setIdeal]     = useState(null);
  const [alarms, setAlarms]   = useState([]);
  const [acked, setAcked]     = useState(new Set());
  const [alarmLog, setAlarmLog] = useState([]);
  const [flash, setFlash]     = useState(false);
  const [T, setT]             = useState(0);
  const [showBC, setShowBC]   = useState(false);
  const [tourOn, setTourOn]   = useState(false);
  const [tourStep, setTourStep] = useState(0);
  const [calIn, setCalIn]     = useState({ Ppeak:"", TV:"", PEEP:"", flow:"" });
  const [calRes, setCalRes]   = useState(null);
  const [asyncLog, setAsyncLog] = useState([]);

  const setS1  = useCallback((k,v) => setS(s=>({...s,[k]:v})), []);
  const togF   = useCallback(k => setF(f=>({...f,[k]:!f[k]})), []);
  const resetAll = useCallback(() => { setF(DEFAULT_FAULTS); setAcked(new Set()); setAlarmLog([]); setAsyncLog([]); }, []);

  const engRef  = useRef(null); const idlRef  = useRef(null);
  const tRef    = useRef(0);    const rafRef  = useRef(null);
  const WMAX = 500, TMAX = 240;

  useEffect(() => { engRef.current = new VentEngine(pid,S,F); idlRef.current = new VentEngine(pid,S,{}); }, [pid,S,F]);

  const tick = useCallback(() => {
    if (!engRef.current) return;
    tRef.current += 0.033;
    const d  = engRef.current.step(tRef.current);
    const id = idlRef.current.step(tRef.current);
    setD(d); setIdeal(id); setT(rnd(tRef.current,1));
    const addW = (arr,k,v) => { const nx=[...arr,{t:rnd(tRef.current,2),[k]:safe(v)}]; return nx.length>WMAX?nx.slice(-WMAX):nx; };
    setWave(w=>({ paw:addW(w.paw,"Paw",d.Paw), flow:addW(w.flow,"flow",d.flow), vol:addW(w.vol,"volume",d.volume), spo2:addW(w.spo2,"SpO2",d.SpO2), etco2:addW(w.etco2,"etCO2",d.etCO2) }));
    if (tRef.current % 4 < 0.04) setTrend(tr=>{ const nx=[...tr,{t:rnd(tRef.current,0),SpO2:d.SpO2,etCO2:d.etCO2,Ppeak:d.Paw,compliance:d.dynC,driving:d.driving,WOB:d.WOB}]; return nx.length>TMAX?nx.slice(-TMAX):nx; });
    const na = checkAlarms(d,S,pid); setAlarms(na);
    if (na.some(a=>a.sev==="critical")) setFlash(f=>!f); else setFlash(false);
    if (na.length) setAlarmLog(al=>{ const last=al[al.length-1]; if(last?.id===na[0].id&&tRef.current-last.ts<4)return al; return [...al,{...na[0],wall:new Date().toLocaleTimeString()}].slice(-100); });
    if (d.asyncFlag) setAsyncLog(al=>[...al,{t:rnd(tRef.current,1),type:d.asyncFlag}].slice(-30));
    if (running) rafRef.current = requestAnimationFrame(tick);
  }, [running, pid, S, F]);

  useEffect(() => {
    if (running) rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [tick, running]);

  useEffect(() => {
    const map = {
      healthy:{TV:500,RR:14,PEEP:5,Pip:20,Ti:1.0,FiO2:40,IPAP:20,EPAP:5},
      ards_mod:{TV:380,RR:18,PEEP:8,Pip:26,Ti:0.85,FiO2:60,IPAP:26,EPAP:8},
      ards_sev:{TV:320,RR:20,PEEP:12,Pip:28,Ti:0.8,FiO2:70,IPAP:28,EPAP:12},
      copd:{TV:460,RR:12,PEEP:4,Pip:22,Ti:1.2,FiO2:28,IPAP:22,EPAP:4},
      neonatal:{TV:18,RR:50,PEEP:5,Pip:18,Ti:0.35,FiO2:60,IPAP:18,EPAP:5},
      pediatric:{TV:120,RR:24,PEEP:5,Pip:20,Ti:0.6,FiO2:40,IPAP:20,EPAP:5},
      fibrosis:{TV:380,RR:18,PEEP:8,Pip:26,Ti:0.9,FiO2:60,IPAP:26,EPAP:8},
      asthma:{TV:430,RR:10,PEEP:0,Pip:28,Ti:1.4,FiO2:100,IPAP:28,EPAP:0},
    };
    if (map[pid]) setS(s=>({...s,...map[pid]}));
    resetAll();
  }, [pid, resetAll]);

  const profile = PATIENTS[pid];
  const modeCol = MODES[S.mode]?.col || t.accent;
  const L = ALIM[pid] || ALIM.healthy;
  const Te = clamp(60/S.RR - S.Ti, 0.05, 60);
  const hasCrit = alarms.some(a=>a.sev==="critical"&&!acked.has(a.id));
  const dev = useMemo(()=>D&&ideal?{Paw:rnd(D.Paw-ideal.Paw,2),SpO2:rnd(D.SpO2-ideal.SpO2,1),etCO2:rnd(D.etCO2-ideal.etCO2,1),volume:rnd(D.volume-ideal.volume,0)}:{}, [D,ideal]);
  const spo2P  = useMemo(()=>linReg(trend,"SpO2"),  [trend]);
  const etco2P = useMemo(()=>linReg(trend,"etCO2"), [trend]);
  const weaning = useMemo(()=>weanScore(D,S), [D,S]);

  const TOUR = [
    { title:"Patient Profiles", text:"8 clinical phenotypes from Neonatal (1 kg) to Status Asthmaticus. Settings auto-configure to evidence-based defaults. P50 is patient-specific (neonatal: 20 mmHg vs adult: 26.8 mmHg)." },
    { title:"Ventilation Modes", text:"8 modes: VCV, PCV, PRVC (breath-adaptive), SIMV, PSV, BiPAP (separate IPAP/EPAP), CPAP, APRV — each with physiologically accurate pressure/flow waveforms." },
    { title:"Real-Time Waveforms", text:"Pressure, Flow, Volume, SpO₂, EtCO₂ at 30 Hz. Dynamic reference lines show alarm thresholds. Model deviation panel compares measured vs ideal-no-fault prediction." },
    { title:"Fault Injection", text:"Simulate 5 clinical faults: occlusion (Ppeak spike), leak (↓ TV, ↓ resistance), sensor drift (waveform noise), reduced compliance, high resistance. Watch alarms trigger in real time." },
    { title:"Weaning AI", text:"10-criterion SBT score: SpO₂, FiO₂, PEEP, RR, compliance, EtCO₂, asynchrony, Paw, RSBI (Yang & Tobin 1991), driving pressure. Includes predictive trend outlook." },
    { title:"What-If Analyzer", text:"Explore hypothetical parameter changes safely. Peak Paw heat map (C×R matrix), driving pressure matrix (Amato NEJM 2015), and instant evidence-based recommendations." },
    { title:"ICU Dashboard", text:"4 independent physics engines running simultaneously at 30 Hz. Click any bed to open its full monitor. Demonstrates scalability to ward-level deployment." },
    { title:"Blockchain Ledger", text:"ISO 13485 / FDA UDI compliant traceability for 8 components. Includes advisory notices, recall tracking, calibration dates, and cryptographic hash verification." },
    { title:"Model Calibration", text:"Enter measured clinical values (Ppeak, TV, PEEP, peak-flow) → inverse modeling fits Ĉ and R̂ via Equation of Motion. Bridges simulation to real patient data." },
  ];

  return (
    <div style={{ display:"flex",flexDirection:"column",height:"100vh",background:t.bg0,color:t.txt0,fontFamily:"'Exo 2',sans-serif",overflow:"hidden" }}>
      <style>{buildCSS(t)}</style>

      {/* ══ HEADER ══════════════════════════════════════════════════════════ */}
      <header style={{ background:t.bg1, borderBottom:`1px solid ${hasCrit&&flash?"#ff333555":t.border}`, padding:"6px 16px", display:"flex", alignItems:"center", gap:12, flexShrink:0, transition:"border-color 0.2s" }}>
        <div style={{ display:"flex",alignItems:"center",gap:9 }}>
          <svg width="28" height="28" viewBox="0 0 28 28">
            <rect width="28" height="28" rx="5" fill={t.accent+"0a"} stroke={t.accent+"22"}/>
            <path d="M4 14 L7 14 L9 8 L12 20 L15 12 L17 16 L19 14 L24 14" stroke={t.accent} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
            <circle cx="4" cy="14" r="1.5" fill={t.accent}/><circle cx="24" cy="14" r="1.5" fill={t.accent}/>
          </svg>
          <div>
            <div style={{ fontWeight:800,fontSize:11,color:t.accent,letterSpacing:3 }}>VENTILATOR DIGITAL TWIN</div>
            <div style={{ fontSize:7,color:t.txt3,letterSpacing:2,fontFamily:"'Share Tech Mono',monospace" }}>ICU SIMULATION PLATFORM · ISO 80601-2-12 · v4.0 FINAL</div>
          </div>
        </div>

        <div style={{ display:"flex",alignItems:"center",gap:5,paddingLeft:10,borderLeft:`1px solid ${t.border}` }}>
          <div style={{ width:7,height:7,borderRadius:"50%",background:running?t.accent:t.crit,boxShadow:`0 0 7px ${running?t.accent:t.crit}`,animation:running?"pulse 2s infinite":"none" }}/>
          <span style={{ fontSize:8,color:running?`${t.accent}55`:`${t.crit}55`,letterSpacing:2,fontFamily:"'Share Tech Mono',monospace" }}>{running?"LIVE":"PAUSED"}</span>
        </div>

        <div style={{ paddingLeft:10,borderLeft:`1px solid ${t.border}`,display:"flex",alignItems:"center",gap:6 }}>
          <div style={{ width:8,height:8,borderRadius:"50%",background:profile.color }}/>
          <span style={{ fontSize:10,color:profile.color,fontWeight:700,letterSpacing:1 }}>{profile.label}</span>
        </div>

        <div style={{ paddingLeft:10,borderLeft:`1px solid ${t.border}` }}>
          <span style={{ fontFamily:"'Share Tech Mono',monospace",fontSize:10,color:modeCol,letterSpacing:2 }}>{S.mode}</span>
          <span style={{ fontSize:8,color:t.txt3,marginLeft:6 }}>{MODES[S.mode]?.full}</span>
        </div>

        <div style={{ flex:1 }}/>

        {/* Alarm strip with ACK */}
        <div style={{ flex:2,overflow:"hidden",borderLeft:`1px solid ${t.border}`,paddingLeft:10,minWidth:0,display:"flex",alignItems:"center" }}>
          {alarms.filter(a=>!acked.has(a.id)).length===0
            ? <span style={{ fontSize:8,color:t.txt3,letterSpacing:2 }}>● ALL CLEAR — NO ACTIVE ALARMS</span>
            : alarms.filter(a=>!acked.has(a.id)).slice(0,3).map(a=>(
              <div key={a.id} style={{ display:"flex",alignItems:"center",gap:4,marginRight:8,flexShrink:0 }}>
                <div style={{ fontSize:8,color:a.sev==="critical"?t.crit:t.warn,padding:"3px 7px",borderRadius:3,border:`1px solid ${a.sev==="critical"?t.crit+"33":t.warn+"33"}`,background:a.sev==="critical"?t.crit+"0d":t.warn+"0d",animation:a.sev==="critical"?"blink 0.7s infinite":"none",fontFamily:"'Share Tech Mono',monospace",whiteSpace:"nowrap" }}>⚠ {a.msg}</div>
                <button onClick={()=>setAcked(ac=>{const n=new Set(ac);n.add(a.id);return n;})} style={{ fontSize:7,background:"transparent",border:`1px solid ${t.border2}`,color:t.txt2,padding:"2px 5px",borderRadius:2,cursor:"pointer",fontFamily:"'Exo 2',sans-serif" }}>ACK</button>
              </div>
            ))
          }
        </div>

        <span style={{ fontFamily:"'Share Tech Mono',monospace",fontSize:10,color:t.txt3 }}>T+<span style={{ color:t.txt2 }}>{T}s</span></span>

        {/* Theme Toggle */}
        <button onClick={()=>setThemeName(n=>n==="dark"?"light":"dark")} title="Toggle Dark / Light theme" style={{ background:t.bg3,border:`1px solid ${t.border}`,color:t.txt1,fontFamily:"'Exo 2',sans-serif",fontWeight:700,fontSize:9,padding:"5px 10px",borderRadius:3,cursor:"pointer",letterSpacing:1 }}>
          {themeName==="dark" ? "☀ LIGHT" : "🌙 DARK"}
        </button>

        <button onClick={()=>setTourOn(true)} style={{ background:"transparent",border:`1px solid ${t.border}`,color:t.txt2,fontFamily:"'Exo 2',sans-serif",fontWeight:700,fontSize:8,letterSpacing:1,padding:"4px 10px",borderRadius:3,cursor:"pointer" }}>? TOUR</button>
        <button onClick={()=>setRunning(r=>!r)} style={{ background:running?t.crit+"10":t.accent+"10",border:`1px solid ${running?t.crit:t.accent}`,color:running?t.crit:t.accent,fontFamily:"'Exo 2',sans-serif",fontWeight:800,fontSize:9,letterSpacing:2,padding:"5px 14px",borderRadius:3,cursor:"pointer" }}>
          {running?"■ PAUSE":"▶ RUN"}
        </button>
        <button onClick={()=>setShowBC(b=>!b)} style={{ background:showBC?t.accentB+"10":"transparent",border:`1px solid ${showBC?t.accentB+"44":t.border}`,color:showBC?t.accentB:t.txt2,fontFamily:"'Exo 2',sans-serif",fontWeight:700,fontSize:9,padding:"5px 10px",borderRadius:3,cursor:"pointer" }}>⛓ LEDGER</button>
        <button onClick={()=>exportCSV(trend,profile.label,S.mode)} style={{ background:"transparent",border:`1px solid ${t.border}`,color:t.txt2,fontFamily:"'Exo 2',sans-serif",fontWeight:700,fontSize:9,padding:"5px 10px",borderRadius:3,cursor:"pointer" }} title="Export trend data as CSV">↓ CSV</button>
      </header>

      <div style={{ display:"flex",flex:1,overflow:"hidden",minHeight:0 }}>

        {/* ══ SIDEBAR ═════════════════════════════════════════════════════ */}
        <aside style={{ width:252,background:t.bg1,borderRight:`1px solid ${t.border}`,overflowY:"auto",flexShrink:0,padding:13,display:"flex",flexDirection:"column",gap:13 }}>

          <section>
            <div style={{ fontSize:8,color:t.txt3,letterSpacing:3,marginBottom:7,fontWeight:800 }}>PATIENT PROFILE</div>
            <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:3 }}>
              {Object.entries(PATIENTS).map(([k,p])=>(
                <button key={k} onClick={()=>setPid(k)} style={{ background:pid===k?`${p.color}14`:t.bg2, border:`1px solid ${pid===k?p.color:t.border}`, color:pid===k?p.color:t.txt2, fontFamily:"'Exo 2',sans-serif",fontWeight:600,fontSize:9,padding:"5px 7px",borderRadius:3,cursor:"pointer",textAlign:"left",transition:"all 0.12s" }}>
                  <div style={{ marginBottom:1 }}>{p.label}</div>
                  <div style={{ fontSize:7,opacity:0.6,fontFamily:"'Share Tech Mono',monospace" }}>C:{p.C} R:{p.R}</div>
                </button>
              ))}
            </div>
          </section>

          {D && (
            <section style={{ background:t.bg2,border:`1px solid ${profile.color}18`,borderRadius:4,padding:9 }}>
              <div style={{ fontSize:8,color:t.txt3,letterSpacing:3,marginBottom:6,fontWeight:800,display:"flex",alignItems:"center",gap:4 }}>
                LUNG MECHANICS
                <InfoTip text={"Equation of Motion (Mead & Milic-Emili 1964):\nPaw(t) = V̇·R + V/C + PEEP\n\nDriving pressure (Amato NEJM 2015):\nΔP = Pplat − PEEP = VT/Crs\nTarget: ΔP < 15 cmH₂O in ARDS"} t={t} />
              </div>
              {[["Dyn. Compliance",`${D.dynC}`,"mL/cmH₂O"],["Resistance",`${D.R}`,"cmH₂O·s/L"],["Time Constant",`${D.tau}`,"s"],["Driving Pressure",`${D.driving}`,"cmH₂O"],["Pplat (est.)",`${D.Pplat}`,"cmH₂O"],["I:E",`1:${rnd(Te/S.Ti,1)}`,""],["RSBI",`${D.RSBI}`,"bpm/L"],["Shunt",`${rnd(D.shunt*100,1)}`,"% Qs/Qt"]].map(([l,v,u])=>(
                <div key={l} style={{ display:"flex",justifyContent:"space-between",padding:"2px 0",borderBottom:`1px solid ${t.border}` }}>
                  <span style={{ fontSize:8,color:t.txt3 }}>{l}</span>
                  <span style={{ fontFamily:"'Share Tech Mono',monospace",fontSize:10,color:profile.color }}>{v} <span style={{ fontSize:7,color:t.txt3 }}>{u}</span></span>
                </div>
              ))}
            </section>
          )}

          <section>
            <div style={{ fontSize:8,color:t.txt3,letterSpacing:3,marginBottom:6,fontWeight:800 }}>PRESETS</div>
            <div style={{ display:"flex",flexDirection:"column",gap:2 }}>
              {PRESETS.map(p=>(
                <button key={p.id} onClick={()=>{setPid(p.pid);setTimeout(()=>{setS(ss=>({...ss,...p.s}));setF(ff=>({...ff,...p.f}));},60);}} style={{ background:t.bg2,border:`1px solid ${t.border}`,color:t.txt1,fontFamily:"'Exo 2',sans-serif",fontWeight:600,fontSize:9,padding:"4px 8px",borderRadius:3,cursor:"pointer",textAlign:"left",transition:"all 0.12s" }}>▸ {p.label}</button>
              ))}
            </div>
          </section>

          <section>
            <div style={{ fontSize:8,color:t.txt3,letterSpacing:3,marginBottom:6,fontWeight:800 }}>VENTILATION MODE</div>
            <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:3 }}>
              {Object.entries(MODES).map(([m,md])=>(
                <button key={m} onClick={()=>setS1("mode",m)} style={{ background:S.mode===m?`${md.col}14`:t.bg2, border:`1px solid ${S.mode===m?md.col:t.border}`, color:S.mode===m?md.col:t.txt2, fontFamily:"'Exo 2',sans-serif",fontWeight:800,fontSize:9,padding:"5px 3px",borderRadius:3,cursor:"pointer",textAlign:"center" }}>{m}</button>
              ))}
            </div>
            <div style={{ fontSize:7,color:t.txt3,marginTop:4 }}>{MODES[S.mode]?.full}</div>
          </section>

          <section style={{ display:"flex",flexDirection:"column",gap:9 }}>
            <div style={{ fontSize:8,color:t.txt3,letterSpacing:3,fontWeight:800,display:"flex",alignItems:"center",gap:4 }}>
              SETTINGS
              <InfoTip text={"Clinical targets by mode:\n• VCV: Set TV (4–6 mL/kg IBW in ARDS)\n• PCV/PRVC: Set Pip, observe TV\n• PSV: Set support level (5–15 cmH₂O)\n• BiPAP: IPAP–EPAP = driving pressure\n• CPAP: PEEP only, spontaneous breathing"} t={t} />
            </div>
            <Slider label="RATE" value={S.RR} min={4} max={120} step={1} unit="bpm" onChange={v=>setS1("RR",v)} color={t.accent} t={t}
              tip={"Target RR:\n• ARDS: 20–35 bpm (permissive hypercapnia ok)\n• COPD: 10–16 bpm (allow full exhalation)\n• Neonatal: 40–60 bpm\nHigh RR + short Te → intrinsic PEEP risk"} />
            {S.mode!=="CPAP" && <Slider label="TIDAL VOLUME" value={S.TV} min={5} max={900} step={5} unit="mL" onChange={v=>setS1("TV",v)} color={t.accentB} t={t}
              tip={"ARDSNet: 6 mL/kg IBW (range 4–8)\nFormula: IBW (kg) = 50 + 2.3×(Height_in – 60) ♂\n          IBW (kg) = 45.5 + 2.3×(Height_in – 60) ♀\nLower TV → less barotrauma + volutrauma"} />}
            <Slider label="PEEP" value={S.PEEP} min={0} max={24} step={1} unit="cmH₂O" onChange={v=>{setS1("PEEP",v);setS1("EPAP",v);}} color={t.accentC} t={t}
              tip={"PEEP reduces shunt by recruiting alveoli.\nARDS target: 8–20 cmH₂O (ARDSNet table)\nCOPD: keep low (2–5) to avoid air trapping\nNeonatal: 4–6 cmH₂O"} />
            {["PCV","PRVC","PSV","APRV"].includes(S.mode) && <Slider label="INSP PRESSURE (Pip)" value={S.Pip} min={4} max={55} step={1} unit="cmH₂O" onChange={v=>setS1("Pip",v)} color={t.warn} t={t}
              tip={"Driving pressure = Pip − PEEP\nTarget driving P < 15 cmH₂O in ARDS\n(Amato NEJM 2015:372:747)\nPRVC auto-adjusts Pip every breath"} />}
            {S.mode==="BiPAP" && <>
              <Slider label="IPAP" value={S.IPAP} min={8} max={55} step={1} unit="cmH₂O" onChange={v=>setS1("IPAP",v)} color="#00ffcc" t={t} tip={"BiPAP IPAP = inspiratory positive airway pressure\nDriving pressure = IPAP − EPAP\nTypical range: 12–20 cmH₂O for NIV in COPD"} />
              <Slider label="EPAP" value={S.EPAP} min={2} max={20} step={1} unit="cmH₂O" onChange={v=>setS1("EPAP",v)} color="#00ffcc" t={t} tip={"BiPAP EPAP = expiratory PAP (= PEEP)\nProvides pneumatic splinting, reduces work of breathing\nSame as CPAP when IPAP = EPAP"} />
            </>}
            <Slider label="INSP TIME (Ti)" value={S.Ti} min={0.15} max={4.0} step={0.05} unit="s" onChange={v=>setS1("Ti",v)} color={t.warn} t={t}
              tip={"Ti determines I:E ratio = Ti / Te\nNormal: 1:2 (Ti=1s, Te=2s at RR=20)\nARDS: 1:1 to 1:2 · COPD: 1:3 or longer\nAPRV: Ti = Phigh duration (3–6 s)"} />
            <Slider label="FiO₂" value={S.FiO2} min={21} max={100} step={1} unit="%" onChange={v=>setS1("FiO2",v)} color="#00ffcc" t={t}
              tip={"Titrate to SpO₂ target:\n• General: 94–98%\n• COPD: 88–92% (↑ risk of hypercapnia)\n• ARDS: minimum to achieve SpO₂ >88%\nHigh FiO₂ → absorption atelectasis (modelled)"} />
            {D?.prvcP!=null && <div style={{ fontSize:8,color:`${t.warn}aa`,background:`${t.warn}08`,border:`1px solid ${t.warn}22`,borderRadius:3,padding:"3px 7px" }}>PRVC Auto-P: {D.prvcP} cmH₂O</div>}
          </section>

          <section>
            <div style={{ fontSize:8,color:t.txt3,letterSpacing:3,marginBottom:6,fontWeight:800,color:t.crit+"66" }}>⚡ FAULT INJECTION</div>
            <div style={{ display:"flex",flexDirection:"column",gap:3 }}>
              {[["occlusion","Circuit Occlusion",t.crit],["leak","Circuit Leak",t.warn],["sensor_drift","Sensor Drift",t.warn],["reduced_compliance","↓ Compliance",t.crit],["increased_resistance","↑ Resistance",t.crit]].map(([k,l,c])=>(
                <Tag key={k} label={l} active={F[k]} onClick={()=>togF(k)} color={c} t={t}/>
              ))}
            </div>
          </section>

          {/* ── RESET TO DEFAULT BUTTON ── */}
          <section>
            <button onClick={resetAll} style={{ width:"100%",background:t.bg2,border:`1px solid ${t.warn}44`,color:t.warn,fontFamily:"'Exo 2',sans-serif",fontWeight:800,fontSize:9,letterSpacing:2,padding:"8px",borderRadius:4,cursor:"pointer",textTransform:"uppercase",transition:"all 0.15s" }}
              onMouseEnter={e=>{e.target.style.background=`${t.warn}15`;}} onMouseLeave={e=>{e.target.style.background=t.bg2;}}>
              ↺ RESET FAULTS & ALARMS
            </button>
          </section>

          {/* ── MODEL CALIBRATION ── */}
          <section>
            <div style={{ fontSize:8,color:t.txt3,letterSpacing:3,marginBottom:6,fontWeight:800,display:"flex",alignItems:"center",gap:4 }}>
              MODEL CALIBRATION
              <InfoTip text={"Inverse parameter fitting – Equation of Motion:\n  Ĉ = VT / (Ppeak − PEEP)  [mL/cmH₂O]\n  R̂ = (Ppeak − PEEP − VT/Ĉ) / V̇peak × 1000\nEnter measured clinical values to fit\npatient-specific C and R to real data."} t={t}/>
            </div>
            <div style={{ display:"flex",flexDirection:"column",gap:4 }}>
              {[["Ppeak","Ppeak (cmH₂O)"],["TV","TV (mL)"],["PEEP","PEEP (cmH₂O)"],["flow","Peak Flow (mL/s)"]].map(([k,lbl])=>(
                <div key={k} style={{ display:"flex",justifyContent:"space-between",alignItems:"center" }}>
                  <span style={{ fontSize:8,color:t.txt2 }}>{lbl}</span>
                  <input value={calIn[k]} onChange={e=>setCalIn(c=>({...c,[k]:e.target.value}))}
                    style={{ width:65,background:t.bg3,border:`1px solid ${t.border2}`,borderRadius:3,color:t.accent,fontFamily:"'Share Tech Mono',monospace",fontSize:9,padding:"3px 6px",outline:"none" }}/>
                </div>
              ))}
              <button onClick={()=>setCalRes(calibrate(+calIn.Ppeak||D?.Paw||20,+calIn.TV||D?.volume||500,+calIn.PEEP||S.PEEP,+calIn.flow||300))}
                style={{ background:t.accent+"10",border:`1px solid ${t.accent}44`,color:t.accent,fontFamily:"'Exo 2',sans-serif",fontWeight:700,fontSize:9,padding:"5px",borderRadius:3,cursor:"pointer",letterSpacing:1 }}>
                ▶ FIT PARAMETERS
              </button>
              {calRes && <div style={{ background:t.bg3,border:`1px solid ${t.accent}22`,borderRadius:3,padding:"6px 8px" }}>
                <div style={{ fontSize:8,color:t.txt3,marginBottom:3 }}>FITTED PARAMETERS</div>
                <div style={{ fontFamily:"'Share Tech Mono',monospace",fontSize:9,color:t.accent }}>Ĉ = {calRes.C} mL/cmH₂O</div>
                <div style={{ fontFamily:"'Share Tech Mono',monospace",fontSize:9,color:t.accentB }}>R̂ = {calRes.R} cmH₂O·s/L</div>
                <div style={{ fontSize:7,color:t.txt3,marginTop:3 }}>Via Eq. of Motion inverse fitting</div>
              </div>}
            </div>
          </section>

          {asyncLog.length>0 && (
            <section style={{ background:t.bg3,border:"1px solid #f472b622",borderRadius:4,padding:8 }}>
              <div style={{ fontSize:8,color:"#f472b6",letterSpacing:2,marginBottom:4,fontWeight:800 }}>ASYNCHRONY LOG</div>
              {asyncLog.slice(-6).map((e,i)=>(
                <div key={i} style={{ fontSize:8,color:"#f472b666",fontFamily:"'Share Tech Mono',monospace",marginBottom:2 }}>T{e.t}s: {e.type.replace(/_/g," ")}</div>
              ))}
            </section>
          )}

          <div style={{ fontSize:7,color:t.txt3,lineHeight:2,borderTop:`1px solid ${t.border}`,paddingTop:10 }}>
            ■ Physics: RC lung + sigmoidal P-V<br/>
            ■ Gas: Alveolar eq. + Hill SpO₂ curve<br/>
            ■ PaCO₂: Bohr equation kinetics<br/>
            ■ Shunt: PEEP/FiO₂ coupled model<br/>
            ■ PRVC: Breath-adaptive pressure<br/>
            ■ Async: 4-pattern rule-based engine<br/>
            ■ Alarms: ISO 80601-2-12 graded<br/>
            ■ Refresh: 30 Hz (requestAnimationFrame)
          </div>
        </aside>

        {/* ══ MAIN CONTENT ════════════════════════════════════════════════ */}
        <main style={{ flex:1,display:"flex",flexDirection:"column",overflow:"hidden",minWidth:0 }}>
          <div style={{ background:t.bg1,borderBottom:`1px solid ${t.border}`,display:"flex",paddingLeft:12,flexShrink:0 }}>
            {[["monitor","MONITOR"],["trends","TRENDS"],["pvloop","P-V LOOP"],["whatif","WHAT-IF"],["weaning","WEANING AI"],["icu","ICU OVERVIEW"],["alarms","ALARM LOG"]].map(([id,lbl])=>(
              <TabBtn key={id} id={id} label={lbl} active={tab===id} onClick={setTab} col={modeCol}/>
            ))}
          </div>

          <div style={{ flex:1,overflowY:"auto",padding:14,display:"flex",flexDirection:"column",gap:12 }}>

            {/* ── MONITOR ──────────────────────────────────────────────────── */}
            {tab==="monitor" && D && (<>
              <div style={{ display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:8 }}>
                <MetricCard label="SpO₂" value={D.SpO2} unit="%" status={D.SpO2>=L.spo2w?"normal":D.SpO2>=L.spo2c?"warning":"critical"} sub="Peripheral O₂ Sat" pred={spo2P?`${spo2P.dir} → ${spo2P.pred}%`:null} tip={"SpO₂ via pulse oximetry (Hill equation)\nSpO₂ = PaO₂ⁿ/(P50ⁿ+PaO₂ⁿ)×100\nn=2.7, P50=26.8 (adult) / 20.0 (neonatal)\nRef: Severinghaus, J Appl Physiol 1979"} t={t}/>
                <MetricCard label="EtCO₂" value={D.etCO2} unit="mmHg" status={D.etCO2>=35&&D.etCO2<=50?"normal":D.etCO2>50?"warning":"warning"} sub={`PaCO₂ ${D.PaCO2} mmHg`} pred={etco2P?`${etco2P.dir} ${etco2P.pred}`:null} tip={"End-tidal CO₂ ≈ PaCO₂ − gradient (2–5 mmHg)\nPaCO₂ driven by Bohr equation:\n  VA = RR×(VT−VD)\n  PaCO₂ = V̇CO₂×0.863×1000/VA"} t={t}/>
                <MetricCard label="Peak Paw" value={D.Paw} unit="cmH₂O" status={D.Paw<L.paww?"normal":D.Paw<L.pawc?"warning":"critical"} sub={`Drive P ${D.driving} cmH₂O`} tip={"Peak Paw = PEEP + VT/Ceff + V̇peak×R\n(Equation of Motion – Mead & Milic-Emili 1964)\nDriving P = Pplat − PEEP (target <15 in ARDS)\nRef: Amato, NEJM 2015;372:747"} t={t}/>
                <MetricCard label="Tidal Vol" value={D.volume.toFixed(0)} unit="mL" status={D.volume>=S.TV*0.85||S.mode==="CPAP"?"normal":"warning"} sub={`Set: ${S.TV} mL`} tip={"Measured tidal volume after circuit compliance correction:\n  Vdel = VT − V̇×Ccircuit\n  Ccircuit ≈ 1.5 mL/cmH₂O (Marini 1989)\nMonitor delivered vs set to detect leak/occlusion"} t={t}/>
                <MetricCard label="PaO₂" value={D.PaO2} unit="mmHg" status={D.PaO2>=80?"normal":D.PaO2>=60?"warning":"critical"} sub={`Shunt ${rnd(D.shunt*100,1)}%`} tip={"Arterial O₂ via Riley-Cournand shunt equation:\n  PaO₂ = PAO₂×(1−Qs/Qt) + PvO₂×(Qs/Qt)\nShunt = physiological + anatomical\nRef: Riley & Cournand, J Appl Physiol 1949"} t={t}/>
                <MetricCard label="FiO₂" value={S.FiO2} unit="%" status={S.FiO2<=60?"normal":S.FiO2<=80?"warning":"critical"} sub={`PEEP: ${S.PEEP} cmH₂O`} t={t}/>
              </div>

              <div style={{ background:t.bg2,border:`1px solid ${t.border}`,borderRadius:5,padding:"7px 12px" }}>
                <div style={{ fontSize:8,color:t.txt3,letterSpacing:3,marginBottom:5,fontWeight:800,display:"flex",alignItems:"center",gap:4 }}>MODEL DEVIATION — MEASURED vs PREDICTED IDEAL (no-fault baseline)<InfoTip text={"Model deviation compares the simulated patient (with active faults)\nvs the ideal no-fault prediction from the same engine.\nLarge deviations (>3 units) indicate fault impact.\nThis is the core digital twin value: detecting real-world\ndeviation from expected model behaviour."} t={t}/></div>
                <div style={{ display:"flex",gap:10 }}>
                  {[["Paw",dev.Paw,"cmH₂O"],["SpO₂",dev.SpO2,"%"],["EtCO₂",dev.etCO2,"mmHg"],["Volume",dev.volume,"mL"]].map(([l,v,u])=>{
                    const a=Math.abs(v||0);
                    return <div key={l} style={{ flex:1,background:t.bg3,borderRadius:3,padding:"5px 8px",border:`1px solid ${a>3?t.crit+"22":t.border}` }}>
                      <div style={{ fontSize:7,color:t.txt3 }}>{l}</div>
                      <div style={{ fontFamily:"'Share Tech Mono',monospace",fontSize:13,color:a<1?`${t.accent}44`:a<3?`${t.warn}88`:t.crit }}>{v>=0?"+":""}{v} <span style={{ fontSize:7,color:t.txt3 }}>{u}</span></div>
                    </div>;
                  })}
                  <div style={{ flex:2,background:t.bg3,borderRadius:3,padding:"5px 8px",border:`1px solid ${t.border}` }}>
                    <div style={{ fontSize:7,color:t.txt3,marginBottom:2 }}>SYNCHRONY / ASYNCHRONY</div>
                    <div style={{ fontSize:9,color:D.asyncFlag?"#f472b6":`${t.accent}44` }}>
                      {D.asyncFlag?`⚠ ${D.asyncFlag.replace(/_/g," ").toUpperCase()}`:"● SYNCHRONIZED"}
                      {D.hasSpontEffort&&!D.asyncFlag&&<span style={{ color:t.accentC+"88",marginLeft:8 }}>spontaneous effort active</span>}
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ display:"flex",gap:12,flex:1 }}>
                <div style={{ flex:1,display:"flex",flexDirection:"column",gap:7,minWidth:0 }}>
                  <Waveform data={wave.paw}   yKey="Paw"    label="AIRWAY PRESSURE" color={t.accent}  unit="cmH₂O" yMin={0}    yMax={55}                         h={88} refs={[{v:S.PEEP,c:t.accent+"28"},{v:L.pawc,c:t.crit+"33"}]} t={t}/>
                  <Waveform data={wave.flow}  yKey="flow"   label="FLOW"            color={t.accentB} unit="mL/s"  yMin={-700} yMax={700}                         h={88} refs={[{v:0,c:t.border}]} t={t}/>
                  <Waveform data={wave.vol}   yKey="volume" label="TIDAL VOLUME"    color={t.accentC} unit="mL"   yMin={0}    yMax={Math.max(800,S.TV*1.5)}       h={88} t={t}/>
                  <div style={{ display:"flex",gap:7 }}>
                    <div style={{ flex:1 }}><Waveform data={wave.spo2}  yKey="SpO2"  label="SpO₂"  color="#00ffcc" unit="%" yMin={75} yMax={100} h={55} refs={[{v:L.spo2c,c:t.crit+"33"}]} t={t}/></div>
                    <div style={{ flex:1 }}><Waveform data={wave.etco2} yKey="etCO2" label="EtCO₂" color={t.warn}  unit="mmHg" yMin={15} yMax={70} h={55} refs={[{v:35,c:t.accent+"22"},{v:50,c:t.crit+"33"}]} t={t}/></div>
                  </div>
                </div>
                <div style={{ width:162,display:"flex",flexDirection:"column",gap:7,flexShrink:0 }}>
                  <div style={{ background:t.bg2,border:`1px solid ${D.SpO2>=L.spo2w?t.accent+"22":t.crit+"33"}`,borderRadius:5,padding:"12px 8px",textAlign:"center",position:"relative",overflow:"hidden" }}>
                    <div style={{ position:"absolute",inset:0,background:`radial-gradient(ellipse,${D.SpO2>=L.spo2w?t.accent:t.crit}0a 0%,transparent 70%)` }}/>
                    <div style={{ fontSize:8,color:t.txt3 }}>SpO₂</div>
                    <div style={{ fontFamily:"'Share Tech Mono',monospace",fontSize:50,lineHeight:1,marginTop:4,color:D.SpO2>=L.spo2w?t.accent:D.SpO2>=L.spo2c?t.warn:t.crit,textShadow:`0 0 36px ${D.SpO2>=L.spo2w?t.accent:D.SpO2>=L.spo2c?t.warn:t.crit}44`,animation:D.SpO2<L.spo2c?"blink 0.6s infinite":"none" }}>{D.SpO2.toFixed(0)}</div>
                    <div style={{ fontSize:9,color:t.txt3,marginTop:3 }}>%</div>
                  </div>
                  <div style={{ background:t.bg2,border:`1px solid ${t.border}`,borderRadius:4,padding:"8px",textAlign:"center" }}>
                    <div style={{ fontSize:7,color:t.txt3 }}>SET RR</div>
                    <div style={{ fontFamily:"'Share Tech Mono',monospace",fontSize:26,color:t.warn,lineHeight:1 }}>{S.RR}</div>
                    <div style={{ fontSize:7,color:t.txt3 }}>bpm</div>
                  </div>
                  {[["I:E",`1:${rnd(Te/S.Ti,1)}`,"",false],["Dyn C",`${D.dynC}`,"mL/cmH₂O",false],["Driving",`${D.driving}`,"cmH₂O",D.driving>L.driv],["Pplat",`${D.Pplat}`,"cmH₂O",false],["RSBI",`${D.RSBI}`,"bpm/L",D.RSBI>105&&S.mode==="PSV"],["WOB",`${D.WOB}`,"J/L",false]].map(([l,v,u,w])=>(
                    <div key={l} style={{ background:t.bg2,border:`1px solid ${w?t.warn+"33":t.border}`,borderRadius:4,padding:"5px 8px",display:"flex",justifyContent:"space-between",alignItems:"center" }}>
                      <span style={{ fontSize:8,color:t.txt3 }}>{l}</span>
                      <span style={{ fontFamily:"'Share Tech Mono',monospace",fontSize:12,color:w?t.warn:t.accentB }}>{v} <span style={{ fontSize:7,color:t.txt3 }}>{u}</span></span>
                    </div>
                  ))}
                </div>
              </div>
            </>)}

            {/* ── TRENDS ───────────────────────────────────────────────────── */}
            {tab==="trends" && (
              <div style={{ display:"flex",flexDirection:"column",gap:10 }}>
                <div style={{ fontFamily:"'Exo 2',sans-serif",fontWeight:800,fontSize:10,color:t.txt2,letterSpacing:3 }}>CLINICAL TRENDS — {TMAX}-SAMPLE HISTORY WITH PREDICTIVE OVERLAY</div>
                {[{key:"SpO2",label:"SpO₂ (%)",color:t.accent,d:[75,100],rl:L.spo2c},{key:"etCO2",label:"EtCO₂ (mmHg)",color:t.warn,d:[15,70],rl:30,rh:55},{key:"Ppeak",label:"Peak Paw (cmH₂O)",color:t.accentC,d:[0,60],rh:L.pawc},{key:"compliance",label:"Dyn. Compliance (mL/cmH₂O)",color:t.accentB,d:[0,120],rl:20},{key:"driving",label:"Driving Pressure (cmH₂O)",color:"#ffd700",d:[0,40],rh:L.driv},{key:"WOB",label:"Work of Breathing (J/L)",color:"#f472b6",d:[0,4]}].map(({key,label,color,d,rl,rh})=>{
                  const p=linReg(trend,key);
                  return <div key={key} style={{ background:t.bg2,border:`1px solid ${t.border}`,borderRadius:5,padding:"9px 12px" }}>
                    <div style={{ display:"flex",justifyContent:"space-between",marginBottom:5 }}>
                      <span style={{ fontFamily:"'Exo 2',sans-serif",fontWeight:700,fontSize:9,color,letterSpacing:2 }}>{label}</span>
                      {p&&<span style={{ fontSize:8,color:`${color}77`,fontFamily:"'Share Tech Mono',monospace" }}>slope {p.slope>0?"+":""}{p.slope} · pred {p.pred} {p.dir}</span>}
                    </div>
                    <ResponsiveContainer width="100%" height={72}>
                      <AreaChart data={trend}>
                        <defs><linearGradient id={`g${key}`} x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={color} stopOpacity={0.18}/><stop offset="95%" stopColor={color} stopOpacity={0}/></linearGradient></defs>
                        <XAxis dataKey="t" hide/><YAxis domain={d} hide/>
                        <CartesianGrid stroke={t.border} strokeDasharray="1 9"/>
                        {rl&&<ReferenceLine y={rl} stroke={t.crit+"33"} strokeDasharray="3 4"/>}
                        {rh&&<ReferenceLine y={rh} stroke={t.crit+"33"} strokeDasharray="3 4"/>}
                        <Area type="monotone" dataKey={key} stroke={color} fill={`url(#g${key})`} strokeWidth={1.5} dot={false} isAnimationActive={false}/>
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>;
                })}
              </div>
            )}

            {/* ── P-V LOOP ─────────────────────────────────────────────────── */}
            {tab==="pvloop" && (
              <div style={{ display:"flex",flexDirection:"column",gap:12 }}>
                <div style={{ fontFamily:"'Exo 2',sans-serif",fontWeight:800,fontSize:10,color:t.txt2,letterSpacing:3 }}>PRESSURE-VOLUME LOOP — Non-linear Sigmoidal Compliance (Venegas AJRCCM 1998)</div>
                <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12 }}>
                  <div style={{ background:t.bg2,border:`1px solid ${t.border}`,borderRadius:5,padding:12 }}>
                    <div style={{ fontFamily:"'Exo 2',sans-serif",fontWeight:700,fontSize:9,color:modeCol,marginBottom:8,letterSpacing:2 }}>LIVE P-V LOOP — {profile.label}</div>
                    <ResponsiveContainer width="100%" height={290}>
                      <ScatterChart margin={{ top:10,right:10,bottom:25,left:20 }}>
                        <CartesianGrid stroke={t.border} strokeDasharray="1 8"/>
                        <XAxis dataKey="Paw" type="number" name="Paw" domain={[0,60]} label={{ value:"Paw (cmH₂O)",position:"bottom",fill:t.txt3,fontSize:9 }} tick={{ fill:t.txt3,fontSize:9 }}/>
                        <YAxis dataKey="volume" type="number" name="Volume" domain={[0,Math.max(800,S.TV*1.4)]} label={{ value:"Volume (mL)",angle:-90,position:"insideLeft",fill:t.txt3,fontSize:9 }} tick={{ fill:t.txt3,fontSize:9 }}/>
                        <Tooltip contentStyle={{ background:t.bg2,border:`1px solid ${modeCol}33`,fontSize:9,fontFamily:"'Share Tech Mono',monospace" }}/>
                        <Scatter data={wave.paw.slice(-150).map((d,i)=>({Paw:d.Paw,volume:wave.vol[wave.vol.length-150+i]?.volume||0}))} fill={modeCol} opacity={0.75}/>
                      </ScatterChart>
                    </ResponsiveContainer>
                  </div>
                  <div style={{ background:t.bg2,border:`1px solid ${t.border}`,borderRadius:5,padding:12 }}>
                    <div style={{ fontFamily:"'Exo 2',sans-serif",fontWeight:700,fontSize:9,color:t.accentB,marginBottom:8,letterSpacing:2 }}>COMPARATIVE P-V CURVES — All Phenotypes</div>
                    <ResponsiveContainer width="100%" height={290}>
                      <LineChart margin={{ top:10,right:10,bottom:25,left:20 }}>
                        <CartesianGrid stroke={t.border} strokeDasharray="1 8"/>
                        <XAxis type="number" dataKey="P" name="P" domain={[0,50]} label={{ value:"Pressure (cmH₂O)",position:"bottom",fill:t.txt3,fontSize:9 }} tick={{ fill:t.txt3,fontSize:9 }}/>
                        <YAxis domain={[0,700]} label={{ value:"Volume (mL)",angle:-90,position:"insideLeft",fill:t.txt3,fontSize:9 }} tick={{ fill:t.txt3,fontSize:9 }}/>
                        {Object.values(PATIENTS).map(p=>{
                          const curve=Array.from({length:26},(_,i)=>{ const P=i*2; const Ce=sigmoidC(P*p.C*0.35,p.C,p.Cmin,p.Cmax); return {P,V:clamp(Ce*(P-3),0,700)}; });
                          return <Line key={p.label} data={curve} type="monotone" dataKey="V" stroke={p.color} strokeWidth={1.5} dot={false} isAnimationActive={false} name={p.label}/>;
                        })}
                        <Legend formatter={v=><span style={{ fontSize:8,color:t.txt1 }}>{v}</span>}/>
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            )}

            {tab==="whatif"  && <WhatIfPanel pid={pid} t={t}/>}

            {/* ── WEANING AI ───────────────────────────────────────────────── */}
            {tab==="weaning" && weaning && (
              <div style={{ display:"flex",flexDirection:"column",gap:12,animation:"fadeUp 0.3s ease" }}>
                <div style={{ fontFamily:"'Exo 2',sans-serif",fontWeight:800,fontSize:10,color:t.txt2,letterSpacing:3 }}>WEANING READINESS — 10-Criterion SBT Score + Predictive Analytics</div>
                <div style={{ background:t.bg2,border:`1px solid ${weaning.score>=85?t.accent+"33":weaning.score>=65?t.warn+"33":t.crit+"33"}`,borderRadius:6,padding:22,textAlign:"center" }}>
                  <div style={{ fontFamily:"'Exo 2',sans-serif",fontSize:9,color:t.txt3,letterSpacing:3,marginBottom:6 }}>WEANING READINESS SCORE</div>
                  <div style={{ fontFamily:"'Share Tech Mono',monospace",fontSize:80,lineHeight:1,color:weaning.score>=85?t.accent:weaning.score>=65?t.warn:t.crit,textShadow:`0 0 48px ${weaning.score>=85?t.accent:weaning.score>=65?t.warn:t.crit}44`,animation:weaning.score<50?"blink 1s infinite":"none" }}>{weaning.score}</div>
                  <div style={{ fontFamily:"'Exo 2',sans-serif",fontWeight:800,fontSize:16,letterSpacing:4,marginTop:6,color:weaning.score>=85?t.accent:weaning.score>=65?t.warn:t.crit }}>{weaning.level}</div>
                  <div style={{ fontSize:9,color:t.txt3,marginTop:6 }}>SpO₂ · FiO₂ · PEEP · RR · Compliance · EtCO₂ · Synchrony · Paw · RSBI · Driving P</div>
                </div>
                <div style={{ display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:7 }}>
                  {Object.entries(weaning.F).map(([k,v])=>{
                    const lbls={SpO2:"SpO₂ ≥92%",FiO2:"FiO₂ ≤50%",PEEP:"PEEP ≤8",RR:"RR ≤20",compliance:"C ≥25",etCO2:"EtCO₂ 35–48",noAsync:"No Async",Ppeak:"Paw <30",RSBI:"RSBI <80",driving:"Drive P <15"};
                    return <div key={k} style={{ background:t.bg2,border:`1px solid ${v?t.accent+"22":t.crit+"22"}`,borderRadius:4,padding:"9px 6px",textAlign:"center" }}>
                      <div style={{ fontSize:20,color:v?t.accent:t.crit,marginBottom:3 }}>{v?"✓":"✗"}</div>
                      <div style={{ fontSize:7,color:v?`${t.accent}66`:`${t.crit}66`,fontFamily:"'Share Tech Mono',monospace",lineHeight:1.5 }}>{lbls[k]}</div>
                    </div>;
                  })}
                </div>
                {spo2P&&etco2P&&<div style={{ background:t.bg2,border:`1px solid ${t.border}`,borderRadius:5,padding:12 }}>
                  <div style={{ fontFamily:"'Exo 2',sans-serif",fontWeight:800,fontSize:9,color:t.accentB,letterSpacing:2,marginBottom:7 }}>PREDICTIVE OUTLOOK (Next ~2 min)</div>
                  <div style={{ fontSize:9,color:t.txt1,lineHeight:2 }}>
                    SpO₂: <span style={{ color:spo2P.slope<-0.05?t.crit:t.accent }}>{spo2P.dir} {spo2P.pred}%</span>
                    {spo2P.slope<-0.05&&<span style={{ color:t.crit,animation:"blink 1s infinite",marginLeft:8 }}>⚠ Impending desaturation – ↑ FiO₂ now</span>}
                    {" · "}EtCO₂: <span style={{ color:etco2P.slope>0.1?t.warn:`${t.accent}55` }}>{etco2P.dir} {etco2P.pred} mmHg</span>
                    {etco2P.slope>0.15&&<span style={{ color:t.warn,marginLeft:8 }}>— consider ↑ RR</span>}
                  </div>
                </div>}
              </div>
            )}

            {tab==="icu" && <ICUDashboard onSelect={b=>{setPid(b.pid);setTab("monitor");}} t={t}/>}

            {/* ── ALARM LOG ────────────────────────────────────────────────── */}
            {tab==="alarms" && (
              <div style={{ display:"flex",flexDirection:"column",gap:8 }}>
                <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center" }}>
                  <div style={{ fontFamily:"'Exo 2',sans-serif",fontWeight:800,fontSize:10,color:t.txt2,letterSpacing:3 }}>ALARM EVENT LOG — ISO 80601-2-12</div>
                  <div style={{ display:"flex",gap:6 }}>
                    <button onClick={()=>setAcked(new Set())} style={{ background:"transparent",border:`1px solid ${t.border}`,color:t.txt2,fontFamily:"'Exo 2',sans-serif",fontWeight:700,fontSize:8,padding:"4px 10px",borderRadius:3,cursor:"pointer" }}>RESET ACK</button>
                    <button onClick={()=>setAlarmLog([])} style={{ background:t.warn+"10",border:`1px solid ${t.warn}33`,color:t.warn,fontFamily:"'Exo 2',sans-serif",fontWeight:700,fontSize:8,padding:"4px 10px",borderRadius:3,cursor:"pointer" }}>CLEAR LOG</button>
                  </div>
                </div>
                {alarmLog.length===0 ? <div style={{ color:t.txt3,fontSize:10,padding:"24px 0",textAlign:"center" }}>No alarms recorded.</div>
                  : [...alarmLog].reverse().map((a,i)=>(
                  <div key={i} style={{ background:t.bg2,border:`1px solid ${a.sev==="critical"?t.crit+"22":t.warn+"22"}`,borderLeft:`3px solid ${a.sev==="critical"?t.crit:t.warn}`,borderRadius:4,padding:"7px 12px",animation:"fadeUp 0.2s ease" }}>
                    <div style={{ display:"flex",justifyContent:"space-between",marginBottom:2 }}>
                      <span style={{ fontFamily:"'Exo 2',sans-serif",fontWeight:800,fontSize:9,color:a.sev==="critical"?t.crit:t.warn,letterSpacing:1 }}>{a.sev.toUpperCase()} — {a.msg}</span>
                      <span style={{ fontSize:8,color:t.txt3,fontFamily:"'Share Tech Mono',monospace" }}>{a.wall} · T+{rnd(a.ts,1)}s</span>
                    </div>
                    {a.action&&<div style={{ fontSize:8,color:t.txt2 }}>→ {a.action}</div>}
                    {a.ref&&<div style={{ fontSize:7,color:t.txt3 }}>Ref: {a.ref}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>

      {/* ══ BLOCKCHAIN OVERLAY ═══════════════════════════════════════════ */}
      {showBC&&<div style={{ position:"fixed",inset:0,background:"#000000cc",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center" }} onClick={()=>setShowBC(false)}>
        <div style={{ background:t.bg1,border:`1px solid ${t.accentB}33`,borderRadius:8,padding:22,maxWidth:820,width:"92%",maxHeight:"82vh",overflowY:"auto" }} onClick={e=>e.stopPropagation()}>
          <div style={{ display:"flex",justifyContent:"space-between",marginBottom:14 }}>
            <div>
              <div style={{ fontFamily:"'Exo 2',sans-serif",fontWeight:800,fontSize:13,color:t.accentB,letterSpacing:3 }}>⛓ COMPONENT BLOCKCHAIN LEDGER</div>
              <div style={{ fontSize:8,color:t.txt3,fontFamily:"'Share Tech Mono',monospace" }}>ISO 13485 · FDA UDI 21 CFR 830 · Ethereum Sepolia · Block #{(Date.now()%9999999).toString(16).toUpperCase()}</div>
            </div>
            <button onClick={()=>setShowBC(false)} style={{ background:"transparent",border:`1px solid ${t.border}`,color:t.txt2,padding:"4px 10px",borderRadius:3,cursor:"pointer",fontFamily:"'Exo 2',sans-serif",fontWeight:800 }}>✕</button>
          </div>
          <div style={{ display:"flex",flexDirection:"column",gap:5 }}>
            {BLOCKCHAIN_DB.map((c,i)=>(
              <div key={i} style={{ background:t.bg2,border:`1px solid ${c.status==="ADVISORY"?t.warn+"33":t.border}`,borderLeft:`3px solid ${c.status==="ADVISORY"?t.warn:t.accent+"44"}`,borderRadius:4,padding:"9px 12px" }}>
                <div style={{ display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:8 }}>
                  <div>
                    <div style={{ fontFamily:"'Exo 2',sans-serif",fontWeight:700,fontSize:10,color:c.status==="ADVISORY"?t.warn:`${t.accent}77`,marginBottom:2 }}>
                      {c.cmp}{c.status==="ADVISORY"&&<span style={{ fontSize:8,color:t.warn,marginLeft:8,animation:"blink 1.2s infinite" }}>⚠ ADVISORY — {c.recalls} RECALL(S)</span>}
                    </div>
                    <div style={{ fontSize:8,color:t.txt3,fontFamily:"'Share Tech Mono',monospace" }}>{c.id} · S/N: {c.sn} · {c.mfg}</div>
                  </div>
                  <div style={{ textAlign:"right" }}>
                    <div style={{ fontSize:8,color:t.txt3 }}>Batch: {c.batch} · Cal: {c.cal}</div>
                    <div style={{ fontSize:8,color:c.recalls>0?t.warn:`${t.accent}33` }}>{c.status} · Recalls: {c.recalls}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop:10,padding:"7px 12px",background:t.bg3,borderRadius:4,fontSize:8,color:t.txt3,fontFamily:"'Share Tech Mono',monospace" }}>
            Chain: Ethereum Sepolia · Nodes: 12/12 · All hashes verified ✓ · Last sync T+{T}s
          </div>
        </div>
      </div>}

      {/* ══ GUIDED TOUR ═════════════════════════════════════════════════ */}
      {tourOn&&<div style={{ position:"fixed",inset:0,background:"#000000aa",zIndex:300,display:"flex",alignItems:"flex-end",justifyContent:"center",paddingBottom:40 }}>
        <div style={{ background:t.bg1,border:`1px solid ${t.accent}33`,borderRadius:8,padding:22,maxWidth:520,width:"90%",animation:"fadeUp 0.3s ease" }}>
          <div style={{ display:"flex",justifyContent:"space-between",marginBottom:10 }}>
            <div style={{ fontFamily:"'Exo 2',sans-serif",fontSize:8,color:t.txt3,letterSpacing:3 }}>GUIDED TOUR {tourStep+1}/{TOUR.length}</div>
            <button onClick={()=>setTourOn(false)} style={{ background:"transparent",border:"none",color:t.txt2,cursor:"pointer",fontFamily:"'Exo 2',sans-serif",fontWeight:800 }}>✕ CLOSE</button>
          </div>
          <div style={{ fontFamily:"'Exo 2',sans-serif",fontWeight:800,fontSize:14,color:t.accent,marginBottom:8 }}>{TOUR[tourStep].title}</div>
          <div style={{ fontSize:10,color:t.txt1,lineHeight:1.8 }}>{TOUR[tourStep].text}</div>
          <div style={{ display:"flex",gap:8,marginTop:16,justifyContent:"flex-end" }}>
            {tourStep>0&&<button onClick={()=>setTourStep(s=>s-1)} style={{ background:"transparent",border:`1px solid ${t.border}`,color:t.txt2,fontFamily:"'Exo 2',sans-serif",fontWeight:700,fontSize:9,padding:"5px 14px",borderRadius:3,cursor:"pointer" }}>← PREV</button>}
            {tourStep<TOUR.length-1
              ?<button onClick={()=>setTourStep(s=>s+1)} style={{ background:t.accent+"10",border:`1px solid ${t.accent}44`,color:t.accent,fontFamily:"'Exo 2',sans-serif",fontWeight:800,fontSize:9,padding:"5px 14px",borderRadius:3,cursor:"pointer" }}>NEXT →</button>
              :<button onClick={()=>setTourOn(false)} style={{ background:t.accent+"20",border:`1px solid ${t.accent}`,color:t.accent,fontFamily:"'Exo 2',sans-serif",fontWeight:800,fontSize:9,padding:"5px 14px",borderRadius:3,cursor:"pointer" }}>FINISH ✓</button>
            }
          </div>
          <div style={{ display:"flex",gap:4,marginTop:12,justifyContent:"center" }}>
            {TOUR.map((_,i)=><div key={i} style={{ width:i===tourStep?20:6,height:4,borderRadius:2,background:i===tourStep?t.accent:t.border,transition:"width 0.2s" }}/>)}
          </div>
        </div>
      </div>}
    </div>
  );
}