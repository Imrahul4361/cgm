# Ventilator Digital Twin

A real‑time, high‑fidelity digital twin simulation of a mechanical ventilator. This React‑based simulator models the respiratory mechanics of multiple patient profiles (healthy adult, neonatal, ARDS, COPD, etc.), implements a complete pneumatic circuit, and includes advanced digital twin features such as fault injection, what‑if analysis, model deviation tracking, and a blockchain‑based component ledger. The interface is designed to mimic a premium medical instrument with a dark obsidian theme.

![Ventilator Digital Twin Screenshot](screenshot.png) *(replace with actual screenshot)*

---

## ✨ Features

- **Physiological Lung Models**: Real‑time RC lung mechanics for Healthy Adult and Neonatal patients (expandable to ARDS, COPD, etc.).
- **Complete Ventilator Circuit**:
  - Pneumatic subsystem: O₂/air sources, pressure regulators, gas blender, mechanical relief valve.
  - Patient circuit: inspiratory/expiratory limbs with valves, flow sensors, PEEP valve, one‑way valve, filter.
  - Electronic Control Unit (ECU) with main control loop, PID/state‑space ventilation modes, safety monitor (watchdog, brown‑out, independent alarms).
  - User interface: touchscreen HMI (IEC 62366‑1 compliant), real‑time waveform display, alarm LEDs and speaker.
  - Power subsystem: medical‑grade PSU, battery backup, isolation, leakage monitoring.
- **Co‑Simulation Engine**: FMI/FMU‑ready for integration with external simulators (e.g., Simulink, Modelica).
- **Analysis Engine**:
  - What‑if scenario analysis
  - Fault prediction (based on trend analysis)
  - Telemetry analytics and calibration management
- **Digital Twin Features**:
  - Model deviation (compare measured vs. ideal behaviour)
  - Fault injection (circuit occlusion, leak, sensor drift, etc.)
  - Federated learning simulation (EMA‑based Bayesian update of model parameters)
  - Forward prediction using the full physiological model
- **Clinical Standards Compliance**:
  - ISO 80601‑2‑12 (ventilator performance)
  - IEC 62304 (software lifecycle)
  - ISO 14971 (risk management)
  - IEC 62366‑1 (usability)
  - ISO 81001‑5 (cybersecurity)
- **Advanced UI/UX**:
  - Obsidian Medical design language – dark glass aesthetic, custom fonts (Syne, Fraunces, DM Mono)
  - Real‑time graphs with alarm thresholds, trend arrows, status badges
  - Metric cards with tooltips explaining clinical meaning
  - Tabbed interface: Monitor, Analytics, AGP, What‑If, Alarm Log
  - Time‑range selection for Ambulatory Glucose Profile (AGP)
  - Blockchain component ledger (simulated ISO 13485 / FDA UDI traceability)
- **Extras**:
  - CSV export of trend data
  - Guided tour (via `InfoTip` components)
  - Preset scenarios for quick testing
  - Dark/light theme toggle

---

## 🛠️ Technologies Used

- **Frontend**: React 18, Recharts (for charts), CSS‑in‑JS (inline styles with global CSS injection)
- **State Management**: React Hooks (`useState`, `useReducer`, `useContext` for theme)
- **Animation**: CSS keyframes, `requestAnimationFrame` for simulation loop
- **Simulation Engine**: Custom JavaScript classes implementing Hovorka/Dalla Man models (for CGM) – but for ventilator we have RC lung models
- **Build Tool**: Create React App (or Vite – adjust as needed)
- **Package Manager**: npm / yarn
- **Version Control**: Git

---


##🎮 How to Use
Select a Patient Profile from the sidebar (Healthy Adult, Neonatal, etc.). Each profile has pre‑configured lung mechanics (compliance, resistance).

Adjust Ventilator Settings:

Respiratory rate (RR)

Tidal volume (TV)

PEEP

FiO₂

Inspiratory time (Ti)

Ventilation mode (CMV, SIMV, CPAP, etc.) – select from the mode grid.

Inject Faults (optional):

Toggle “Circuit Occlusion”, “Leak”, “Sensor Drift”, “Reduced Compliance”, or “High Resistance” to see how the ventilator responds and watch alarms trigger.

Monitor Real‑Time Data:

The main dashboard shows current airway pressure (Paw), flow, volume, SpO₂, etc.

Waveforms update every 30 ms.

Alarm strip at the top shows active alarms with acknowledgment buttons.

Explore Additional Tabs:

Analytics: Time‑in‑range (TIR) metrics per ADA 2021.

AGP: Ambulatory Glucose Profile (simulated – uses glucose history).

What‑If: Test different parameter combinations (compliance, resistance, PEEP, FiO₂) and see predicted peak pressure, SpO₂, driving pressure.

Alarm Log: History of all triggered alarms with timestamps and recommended actions.

Blockchain Ledger: Click the “LEDGER” button to view a simulated immutable component record with recall status.

Export Data: Click “CSV” to download trend data.

##📁 Project Structure
text
ventilator-digital-twin/
├── public/
│   └── index.html
├── src/
│   ├── App.js                # Main application component
│   ├── index.js              # Entry point
│   ├── components/           # (if you split further)
│   ├── utils/                # (constants, helper functions)
│   └── styles/               # (global CSS, theme)
├── package.json
├── README.md
└── LICENSE

Currently, all code is in a single App.js for simplicity. In a production project, you might refactor into smaller modules.

##🔧 Customisation
Adding new patient profiles: Extend the PATIENTS constant in App.js with appropriate lung parameters (C, R, color).

Modifying alarm thresholds: Update the ALIM constant.

Adding fault types: Extend DEFAULT_FAULTS and add corresponding logic in the engine (_updateSensor, etc.).

##🧪 Testing
No formal test suite is included yet. You can manually test by:

Changing patient profiles and verifying that waveforms adjust appropriately.

Injecting faults and ensuring alarms trigger as expected.

Checking that all UI components render correctly in both dark and light themes.

##📄 License
This project is provided for educational and demonstration purposes. All rights reserved. For commercial use, please contact the author.

