# Neurosenskull

PROJECT NAME:
NeuroSense-X

FULL PROJECT TITLE:
NeuroSense-X: AI-Based Cranial Mechanical Resonance Mapping and Analysis System

PROJECT TYPE:
A complete biomedical engineering research web application for hardware
connectivity, multi-sensor data acquisition, vibration signal processing,
frequency-domain analysis, mechanical response visualization, experiment
management, and automated research reporting.

PRIMARY OBJECTIVE:

Build a fully functional scientific web application that connects to an
ESP32 microcontroller through USB serial communication, acquires acceleration
data from three MPU6050 accelerometer sensors connected through a TCA9548A
I2C multiplexer, processes the acquired signals, visualizes the results,
calculates mechanical vibration features, compares experiments, and generates
downloadable research reports.

This must be a working research application, not just a landing page,
static dashboard, or collection of decorative cards.

All important buttons, charts, forms, data-processing modules, exports, and
navigation elements must work.

========================================================
1. ACTUAL HARDWARE CONFIGURATION
========================================================

The existing prototype contains:

1. ESP32-WROOM-32 development board.
2. Three MPU6050 accelerometer modules.
3. One TCA9548A I2C multiplexer.
4. USB connection between ESP32 and laptop.
5. Bone-conduction transducer.
6. PAM8403 audio amplifier.
7. Battery and power-management components.

The current ESP32 firmware has successfully detected all three MPU6050
sensors through the TCA9548A multiplexer.

The sensors provide X-axis, Y-axis, and Z-axis acceleration measurements.

The website must support USB serial acquisition from the ESP32.

IMPORTANT:
The actual prototype currently has THREE MPU6050 sensors, not four ADXL345
sensors. Use three sensors throughout the application.

Use these initial sensor identifiers:

Sensor 1
Sensor 2
Sensor 3

Allow the user to configure sensor location labels later.

Do not assume that a physical sensor is connected merely because the ESP32
USB connection succeeds. Sensor status must come from valid firmware status
messages or verified sensor measurements.

========================================================
2. TECHNOLOGY STACK
========================================================

Frontend:
- React
- TypeScript
- Vite
- Tailwind CSS
- shadcn/ui

Scientific visualization:
- Plotly.js or Apache ECharts
- Recharts where appropriate for simpler dashboard charts

USB communication:
- Browser Web Serial API
- Serial data parser
- Configurable baud rate
- Connection status and error handling

Signal processing:
- JavaScript or TypeScript for initial browser-based calculations
- Python with NumPy and SciPy for advanced processing when a backend is
  implemented

Backend:
- Python FastAPI for advanced analysis and report generation
- REST API endpoints
- Optional WebSocket support for streaming or server-side processing

Initial data storage:
- IndexedDB for experimental datasets
- Browser storage for lightweight application settings

Optional future backend storage:
- SQLite for a local or single-user backend
- PostgreSQL for multi-user deployment

Report generation:
- PDF export
- CSV export
- JSON metadata export
- PNG graph export

Build the first working version without requiring an external backend.
Keep the architecture modular so a FastAPI backend can be added later.

Do not make the entire application dependent on a cloud service.

========================================================
3. VISUAL DESIGN AND USER EXPERIENCE
========================================================

Create a premium scientific interface inspired by modern research
instrument software, Apple design principles, Linear, and professional
biomedical engineering dashboards.

Visual direction:

- Clean white and light-grey interface
- Deep navy typography
- Cyan and teal accents for sensor signals
- Violet accents for advanced analysis
- Subtle borders
- Restrained shadows
- Rounded cards
- Professional scientific charts
- Clear labels and measurement units
- Generous spacing
- Excellent desktop usability

The application must feel like a biomedical research workstation.

Do not make it look like a generic hospital administration dashboard.

Use a collapsible left sidebar.

TOP NAVIGATION:
- NeuroSense-X logo
- Current experiment
- Hardware connection indicator
- Data acquisition status
- Notifications
- Settings

LEFT SIDEBAR:

1. Overview
2. Hardware Connection
3. Experiments
4. Live Monitoring
5. Signal Processing
6. Frequency Sweep
7. Resonance Analysis
8. Mechanical Resonance Map
9. Sensor Comparison
10. AI Analysis
11. Reports
12. Diagnostics
13. Settings

Every navigation item must open its corresponding functional screen.

========================================================
4. OVERVIEW DASHBOARD
========================================================

Build a scientific overview dashboard.

Display the following metric cards:

- ESP32 connection status
- Number of sensors reporting valid data
- Current acquisition sampling rate
- Total samples acquired
- Current experiment duration
- Active experiment ID
- Latest calculated RMS acceleration
- Latest detected spectral peak, when valid

Include these charts:

1. Sensor 1 live acceleration
2. Sensor 2 live acceleration
3. Sensor 3 live acceleration
4. Resultant acceleration
5. Latest FFT spectrum
6. Sensor response comparison

Include:

- Recent experiment list
- Acquisition activity indicator
- Data-quality indicator
- Last successful USB connection
- Recent processing operations

Provide clear empty states when no hardware or dataset is connected.

Never show fake live readings when the hardware is disconnected.

If demonstration data are provided, show a prominent DEMO DATA label.

========================================================
5. USB HARDWARE CONNECTION MODULE
========================================================

Create a fully functional ESP32 USB connection interface.

Include:

- Connect ESP32 button
- Disconnect button
- Select serial port
- Configurable baud rate
- Connection status
- Serial data console
- Incoming data counter
- Parsing status
- Sensor status
- Error messages
- Start acquisition button
- Stop acquisition button

Use the browser Web Serial API where supported.

The application must request permission before accessing a serial port.

Explain browser compatibility requirements when serial access is unavailable.

Allow the user to select the available port rather than hardcoding COM12.

Support a configurable serial data protocol.

Preferred data format:

timestamp_ms,sensor_id,ax,ay,az

Example:

0,1,0.012,-0.004,0.998
10,2,0.018,-0.006,1.002
20,3,0.009,0.003,0.996

These are illustrative values only.

Do not treat the example values as actual sensor measurements.

Also support an optional firmware status message that indicates which sensors
have been detected.

The parser must:

- Validate incoming lines
- Reject malformed values
- Handle incomplete serial messages
- Handle line breaks correctly
- Associate each reading with its sensor ID
- Preserve timestamps
- Record parsing errors
- Count missing or invalid samples when detectable

Provide a configurable parser because existing ESP32 firmware may use a
different serial output format.

If the current firmware prints diagnostic text instead of structured
measurements, explain that the firmware must be updated or a compatible
parser must be configured.

Do not claim that arbitrary serial output can automatically be interpreted.

IMPORTANT:
Close or release the serial port when disconnecting.

Display an informative message if Arduino Serial Monitor or another
application already owns the port.

========================================================
6. EMBEDDED SOFTWARE AND FIRMWARE MODULE
========================================================

Create a firmware documentation and configuration page.

Document these embedded modules:

A. ESP32 Firmware Development
B. Sensor Driver Programming
C. Multi-Sensor Data Acquisition
D. Serial Communication
E. Calibration Module
F. Frequency Sweep Control
G. Acquisition Timing

Show the firmware version if the ESP32 provides it.

Display the following configurable or reported parameters:

- Sensor count
- Sensor identifiers
- Acquisition sampling rate
- Serial baud rate
- Sensor communication status
- Acquisition duration
- Firmware version
- Error count

Do not imply that the website can change ESP32 firmware settings unless
a corresponding firmware command has actually been implemented.

Allow future support for validated configuration commands.

Provide a firmware protocol documentation section.

========================================================
7. EXPERIMENT MANAGEMENT MODULE
========================================================

Allow users to create and manage experiments.

Each experiment must have:

- Experiment ID
- Experiment title
- Creation date
- Acquisition start time
- Acquisition end time
- Experiment objective
- Sensor configuration
- Sensor location labels
- Data source
- Sampling frequency
- Number of samples
- Acquisition duration
- Excitation frequency, when applicable
- Excitation waveform
- Experimental notes
- Dataset quality status

Buttons:

- Create Experiment
- Start Acquisition
- Pause Acquisition
- Resume Acquisition
- Stop Acquisition
- Save Experiment
- Open Experiment
- Duplicate Experiment
- Compare Experiments
- Export Experiment
- Delete Experiment

Require confirmation before deleting an experiment.

Store experiment records and associated datasets persistently using IndexedDB.

Ensure saved experiments remain available after a page refresh.

Allow the user to import an existing CSV dataset.

========================================================
8. LIVE MULTI-SENSOR MONITORING
========================================================

Create a detailed sensor monitoring workspace.

For each sensor, display:

- X-axis acceleration
- Y-axis acceleration
- Z-axis acceleration
- Resultant acceleration
- Current measurement
- RMS acceleration
- Peak-to-peak acceleration
- Signal-quality status

Create separate charts for:

Sensor 1
Sensor 2
Sensor 3

Provide:

- Live scrolling waveform
- Time-window selector
- Pause and resume
- Zoom
- Pan
- Axis selector
- Measurement cursor
- Legend
- Measurement unit selector
- Export chart as PNG

Use timestamps from the acquisition stream when available.

Calculate the resultant acceleration using the measured X, Y, and Z
components.

Allow users to select the acceleration unit.

Support m/s² and g.

Clearly distinguish raw measurements from processed measurements.

Do not silently remove gravity or baseline components from the raw data.

========================================================
9. CALIBRATION MODULE
========================================================

Create a calibration workspace.

Features:

- Stationary sensor measurement
- Axis offset estimation
- Baseline estimation
- Sensor orientation notes
- Calibration timestamp
- Calibration configuration
- Before-and-after comparison
- Calibration status
- Calibration export

Support baseline correction and documented offset correction.

Distinguish software baseline correction from physical calibration against
a known reference instrument.

Do not claim that a stationary reading alone constitutes complete
metrological calibration.

Save calibration parameters with the experiment.

Never modify the original raw measurements.

========================================================
10. SIGNAL PROCESSING LABORATORY
========================================================

Create a signal processing workspace.

Required operations:

1. Input validation
2. Timestamp validation
3. Missing-sample detection
4. Baseline removal
5. Optional digital filtering
6. Optional Hamming window
7. Fast Fourier Transform
8. Frequency spectrum generation
9. Spectral peak detection
10. RMS calculation
11. Peak-to-peak calculation
12. Signal-to-noise ratio estimation, when a defensible method is defined
13. Sensor comparison

Allow users to select:

- Sensor
- Axis
- Time interval
- Filter type
- Filter parameters
- FFT window size
- Window function
- Frequency range
- Peak detection threshold

Provide raw and processed signal comparisons.

Every processing operation must record its settings.

Do not apply a filter automatically without displaying its configuration.

Preserve raw data.

Display processing errors and invalid input warnings.

========================================================
11. FFT AND FREQUENCY SPECTRUM MODULE
========================================================

Create an interactive FFT analysis page.

Display:

- Frequency axis in Hz
- Magnitude spectrum
- Dominant detected peak
- Detected spectral peaks
- Selected sensor
- Selected axis
- Sampling frequency
- Number of samples
- FFT size
- Window function
- Frequency resolution
- Nyquist frequency

Provide peak markers and tooltips.

Allow comparison of all three sensor spectra.

Display both the frequency spectrum and a table of detected peaks.

Each peak record should contain:

- Peak frequency
- Peak magnitude
- Peak detection threshold
- Sensor identifier
- Axis
- Analysis interval

Do not present a spectral peak as a confirmed mechanical resonance automatically.

A spectral peak in a passive recording may arise from environmental vibration,
sensor mounting, the test fixture, or the excitation source.

========================================================
12. FREQUENCY SWEEP GENERATOR MODULE
========================================================

Create a dedicated frequency sweep control and analysis page.

Include:

- Start frequency
- Stop frequency
- Frequency increment or sweep duration
- Excitation waveform
- Requested amplitude
- Sweep status
- Sweep progress
- Stop sweep button
- Excitation command history

Supported planned waveforms:

- Sine wave
- Stepped sine sweep
- Linear frequency sweep
- Logarithmic frequency sweep

The actual waveform-generation capability must depend on the implemented
hardware and firmware.

IMPORTANT HARDWARE REQUIREMENTS:

The bone-conduction transducer is rated:

- Nominal impedance: 8 ohms
- Rated power: 1 W RMS
- Maximum stated power: 2 W
- Stated frequency response: 300 Hz to 19,000 Hz
- Specified resonant frequency: approximately 1,600 Hz

The PAM8403 is an amplifier, not a standalone frequency generator.

A controlled frequency sweep requires a suitable excitation signal source,
appropriate amplification, and safe output-level control.

Do not claim that the ESP32 can directly generate a clean, validated
19 kHz sweep through an arbitrary PWM output without accounting for
filtering, sampling, output hardware, and amplifier requirements.

The current MPU6050-based acquisition system has been tested at 100 samples
per second. At that rate, the Nyquist limit is 50 Hz.

This current configuration cannot measure the full stated frequency response
of the transducer.

Display a warning when a requested excitation frequency is outside the
validated acquisition range.

Do not enable unsupported sweep ranges merely because the user enters them.

The software must distinguish:

- Requested excitation frequency
- Actual generated excitation frequency
- Measured sensor response
- Validated measurement range

If no compatible sweep generator is connected, allow offline sweep analysis
using imported experimental data, but do not pretend that physical excitation
occurred.

========================================================
13. FREQUENCY RESPONSE ANALYSIS
========================================================

Create a frequency response analysis page.

Plot measured vibration response against excitation frequency.

Use:

X-axis:
Excitation frequency in Hz.

Y-axis:
Measured response amplitude, such as RMS acceleration or a clearly defined
spectral magnitude.

Allow:

- Sensor selection
- Axis selection
- Frequency range selection
- Response normalization
- Sensor-to-sensor comparison
- Peak identification
- Data-quality warnings
- Export of response data

For stepped sine experiments, calculate response metrics from documented
steady-state intervals.

For continuous sweeps, account for the relationship between sweep rate,
measurement window, and available samples.

Do not construct a frequency response curve by simply connecting unrelated
FFT peaks from different experiments.

Do not display a validated frequency response when the excitation frequency
or acquisition timing is unknown.

========================================================
14. MECHANICAL RESONANCE ANALYSIS
========================================================

Create a dedicated resonance analysis workspace.

Primary project parameters:

A. Resonance Frequency (RF)
B. Peak Vibration Acceleration (PVA)
C. Signal Attenuation (SA)
D. Mechanical Symmetry Index (MSI)

Also calculate, where supported:

- RMS acceleration
- Peak-to-peak acceleration
- Dominant spectral frequency
- Spectral peak count
- Relative response
- Frequency-band response
- Cross-correlation
- Relative time delay
- Damping estimate

Each output must include:

- Value
- Unit
- Sensor identifier
- Selected frequency band
- Analysis interval
- Formula or calculation method
- Data-quality status
- Interpretation notes

RESONANCE FREQUENCY:

Identify candidate resonance frequencies only when the experiment includes
suitable excitation and valid response measurements.

Clearly distinguish the transducer's specified resonance frequency from
the mechanical response of the test object.

PEAK VIBRATION ACCELERATION:

Report the maximum measured acceleration magnitude or another explicitly
defined peak metric.

SIGNAL ATTENUATION:

Require a defined reference sensor and a documented amplitude comparison.

MECHANICAL SYMMETRY INDEX:

Treat MSI as a project-defined research metric.

Provide a configurable formula and document its assumptions.

Do not describe MSI as an established clinical metric.

DAMPING:

Estimate damping only when the selected experiment and mathematical method
support it.

Do not invent damping values from arbitrary stationary signals.

========================================================
15. MECHANICAL RESONANCE MAP
========================================================

Create a premium 2D or 3D mechanical response visualization.

Show a simplified head model with three configurable sensor markers.

Initial labels:

Sensor 1
Sensor 2
Sensor 3

Allow the user to assign anatomical location labels to each sensor.

Each sensor marker should display:

- Sensor ID
- Measured RMS acceleration
- Peak acceleration
- Selected frequency-band response
- Data-quality status

Allow the user to choose the displayed metric.

Support:

- RMS acceleration map
- Peak acceleration map
- Selected-frequency response map
- Frequency-band response map
- Relative sensor response map

Use actual recorded data.

Provide a legend with measurement units.

Include a sensor details panel.

IMPORTANT:

Three sensor locations support a three-location response visualization.

Do not imply that the system measures every point on the head.

Do not claim that the map reveals internal anatomy or detects lesions.

If spatial interpolation is later added, label interpolated values separately
from directly measured sensor values.

========================================================
16. SENSOR COMPARISON MODULE
========================================================

Allow comparison between:

- Sensor 1 and Sensor 2
- Sensor 2 and Sensor 3
- Sensor 1 and Sensor 3
- All three sensors
- Two saved experiments
- Multiple valid experiments

Display:

- Overlaid waveforms
- RMS comparison
- Peak acceleration comparison
- Frequency spectrum comparison
- Frequency response comparison
- Relative attenuation
- Correlation, when appropriate
- Relative delay, when appropriate

Provide tables and graphs.

Do not calculate phase differences as if sensors were simultaneous when
the actual acquisition architecture does not support that assumption.

The existing TCA9548A acquisition process switches between sensor channels.
The three measurements are not exactly simultaneous.

Show a synchronization warning when appropriate.

========================================================
17. AI ANALYSIS ENGINE
========================================================

Create an AI-assisted research analysis module.

Planned functions:

1. Pattern recognition
2. Resonance peak interpretation
3. Frequency response summary
4. Mechanical symmetry comparison
5. Damping analysis summary
6. Historical experiment comparison
7. Feature classification
8. Automated observations

Start with deterministic signal-analysis algorithms.

Add machine learning only when a suitable model and validated dataset exist.

Do not create a fake AI model that returns random or fabricated results.

For every generated observation, provide the supporting data or metrics.

Example of an acceptable observation:

"Sensor 2 recorded a higher RMS acceleration than Sensor 1 during the
selected experiment interval."

The observation must be generated from actual measurements.

If data are missing or invalid, report that the analysis cannot be completed.

Do not provide medical diagnosis.

Do not claim to detect cranial abnormalities or disease.

Do not display statements such as "No abnormality detected" without
appropriate clinical validation, which this prototype does not have.

Label AI outputs as experimental research observations.

========================================================
18. HISTORICAL EXPERIMENT COMPARISON
========================================================

Create a historical comparison workspace.

Allow users to select two or more saved experiments.

Compare:

- Sampling configurations
- Acquisition durations
- RMS acceleration
- Peak-to-peak acceleration
- Spectral peaks
- Frequency response
- Relative sensor response
- Data-quality indicators

Display trends across experiments.

Warn users when datasets have incompatible sampling rates, sensor locations,
frequency ranges, or acquisition configurations.

Never compare incompatible measurements without explaining the limitations.

========================================================
19. AUTOMATED PDF REPORT GENERATION
========================================================

Create a complete report generator.

Allow users to generate a PDF report for each experiment.

REPORT STRUCTURE:

1. Cover Page
2. Project Information
3. Experiment Identification
4. Abstract or Experiment Summary
5. Objective
6. Hardware Configuration
7. Software Configuration
8. Data Acquisition Method
9. Sampling Configuration
10. Data Quality Assessment
11. Raw Sensor Signals
12. Processed Signals
13. Noise Filtering Details
14. FFT Methodology
15. Frequency Spectrum Graphs
16. Spectral Peak Table
17. RMS Acceleration Results
18. Peak-to-Peak Results
19. Frequency Response Analysis
20. Resonance Analysis
21. Signal Attenuation Analysis
22. Mechanical Symmetry Index
23. Mechanical Resonance Map
24. Sensor Comparison
25. AI-Assisted Research Observations, if available
26. Results and Discussion
27. Limitations
28. Conclusion
29. References and Methods
30. Appendix

Only include sections supported by the available data.

Clearly label unperformed tests and unavailable results.

Include graph captions, units, experiment IDs, timestamps, and processing
parameters.

Do not generate fictitious values to fill missing report sections.

Include a research-prototype disclaimer.

Provide a PDF download button.

========================================================
20. DATA EXPORT
========================================================

Support these downloads:

1. Raw sensor data CSV
2. Processed sensor data CSV
3. FFT spectrum CSV
4. Frequency response CSV, when available
5. Experiment metadata JSON
6. Calibration configuration JSON
7. PNG chart exports
8. Mechanical Resonance Map image
9. Complete experiment PDF report

Use descriptive filenames.

Example:

NeuroSenseX_Experiment_001_Raw.csv
NeuroSenseX_Experiment_001_Processed.csv
NeuroSenseX_Experiment_001_FFT.csv
NeuroSenseX_Experiment_001_Report.pdf

Preserve the raw dataset separately from the processed dataset.

Ensure exported files contain correct column names and measurement units.

========================================================
21. DIAGNOSTICS AND DATA QUALITY
========================================================

Create a diagnostics dashboard.

Monitor:

- USB connection
- Serial parser status
- Firmware status
- Sensor data availability
- Missing timestamps
- Duplicate timestamps
- Invalid numeric values
- Sample loss, when detectable
- Sensor saturation
- Unexpected sampling intervals
- Processing errors
- Incomplete experiments

Show warnings in a clear and understandable way.

Do not claim perfect acquisition reliability when the data do not support it.

Provide an acquisition log.

Allow the user to export diagnostic information.

========================================================
22. SETTINGS
========================================================

Provide configurable settings for:

- Serial baud rate
- Serial data format
- Sensor identifiers
- Sensor location labels
- Sampling-rate metadata
- Chart time window
- Filter configuration
- FFT window size
- Window function
- Peak detection threshold
- Frequency range
- Unit selection
- Report format
- Data storage preferences

Do not allow a user-entered sampling-rate value to silently override the
actual acquisition rate without a warning.

Display the difference between configured and measured timing when possible.

========================================================
23. REQUIRED SCIENTIFIC CALCULATIONS
========================================================

Implement and document these calculations.

RESULTANT ACCELERATION:

a_resultant = sqrt(ax^2 + ay^2 + az^2)

RMS:

RMS = sqrt(sum(x_i^2) / N)

For vibration-only RMS, allow the user to select a documented baseline-removal
method before calculating RMS.

PEAK-TO-PEAK:

Peak-to-peak = maximum(x) - minimum(x)

FFT FREQUENCY RESOLUTION:

Frequency resolution = sampling frequency / FFT size

NYQUIST FREQUENCY:

Nyquist frequency = sampling frequency / 2

FREQUENCY SPECTRUM:

Calculate the FFT from the selected valid signal window.

Document whether the displayed magnitude is raw FFT magnitude, normalized
magnitude, amplitude, or power.

SIGNAL ATTENUATION:

Use a documented comparison method with a selected reference measurement.

MECHANICAL SYMMETRY INDEX:

Implement only after defining a reproducible project-specific formula.

For every calculated metric, include units, assumptions, and data-quality
checks.

========================================================
24. SCIENTIFIC AND HARDWARE LIMITATIONS
========================================================

The current sensor acquisition has been tested at 100 samples per second
with 256 samples.

At 100 samples per second:

- Nyquist frequency: 50 Hz
- Nominal FFT-bin spacing for 256 samples: approximately 0.390625 Hz

These values describe the current test configuration, not a guarantee of
measurement accuracy.

The current acquisition configuration cannot measure the complete stated
300 Hz to 19,000 Hz frequency response of the bone-conduction transducer.

The website must not show invented high-frequency response curves.

A higher-frequency acquisition design must be validated before displaying
results outside the current supported range.

The three sensors are read through a TCA9548A multiplexer. Unless the
acquisition architecture is changed and validated, do not assume perfectly
simultaneous sensor sampling.

The transducer's specified resonance frequency of approximately 1,600 Hz
is not the resonance frequency of the human skull.

This project is an educational and research prototype.

Do not make medical claims or provide diagnosis.

Do not recommend human testing without appropriate safety assessment,
supervision, and an approved experimental protocol.

========================================================
25. APPLICATION FUNCTIONALITY REQUIREMENTS
========================================================

All important controls must work.

Required functionality:

- Real USB connection where supported
- Real serial data parsing
- Live graphs
- Start and stop acquisition
- Save experiments
- Persistent experiment storage
- CSV import
- CSV export
- Signal processing
- FFT
- Peak detection
- Metric calculations
- Sensor comparison
- Mechanical Resonance Map
- PDF report generation
- Error handling
- Diagnostics

Do not create buttons that only display success messages without performing
the actual operation.

Do not substitute random values for missing sensor data.

Do not pretend to be connected to hardware.

Clearly distinguish:

LIVE HARDWARE DATA
IMPORTED EXPERIMENT DATA
DEMO DATA

Use demonstration data only when explicitly selected.

========================================================
26. IMPLEMENTATION ORDER
========================================================

Build the application in the following order.

PHASE 1:
Create the complete navigation, application shell, design system, dashboard,
and experiment-management interface.

PHASE 2:
Implement CSV import/export, data validation, persistent experiment storage,
and scientific chart components.

PHASE 3:
Implement USB serial communication, data parsing, connection management,
and real-time display of all three sensors.

PHASE 4:
Implement baseline correction, filtering, RMS, peak-to-peak calculations,
FFT, frequency-spectrum visualization, and peak detection.

PHASE 5:
Implement calibration tools, sensor comparison, data-quality diagnostics,
and documented feature extraction.

PHASE 6:
Implement controlled frequency-sweep management and frequency-response
analysis, enabling physical sweep controls only when supported by validated
firmware and hardware.

PHASE 7:
Implement the Mechanical Resonance Map and project-defined MSI calculation.

PHASE 8:
Implement the AI-assisted analysis interface and historical comparison.

PHASE 9:
Implement automated PDF reports and all research-data exports.

PHASE 10:
Test the complete workflow with actual ESP32 data and verify calculated
results against independently checked examples.

========================================================
27. FINAL ACCEPTANCE CRITERIA
========================================================

The application is considered functional when:

1. The user can open the application on a desktop browser.
2. The user can connect to a compatible ESP32 serial port.
3. The application can parse the configured data protocol.
4. Valid readings from all three sensors appear in the interface.
5. The user can start and stop an acquisition.
6. The user can save and reopen an experiment.
7. The application plots raw acceleration data.
8. The application calculates RMS and peak-to-peak acceleration.
9. The application generates an FFT spectrum from real samples.
10. The application identifies spectral peaks using defined criteria.
11. The application compares the three sensor responses.
12. The application identifies unsupported or invalid frequency ranges.
13. The application displays a three-location mechanical response map.
14. The application generates a PDF report from the selected experiment.
15. The application exports raw and processed data correctly.
16. The application clearly distinguishes real data from demo data.
17. The application reports missing or invalid data honestly.
18. The application does not make unsupported medical claims.

FINAL INSTRUCTION:

Build NeuroSense-X as a complete, maintainable, premium scientific web
application.

Prioritize working functionality and correct scientific calculations over
decorative animations.

Implement the application in phases while preserving the working components.

Do not remove existing functionality when adding new modules.

Do not fabricate measurements, processing results, sensor connections,
resonance frequencies, or AI conclusions.

Start by building the complete application shell and functional first-stage
modules, then integrate the actual ESP32 USB data stream.Modify my existing NeuroSense-X application to implement a fully functional
MEASURED PARAMETERS dashboard matching the attached reference image.

IMPORTANT:
I want actual working scientific graphs connected to real experimental data.
Do not create static illustrations, decorative graphs, or fake results.

HARDWARE CONFIGURATION:
- ESP32-WROOM-32
- TCA9548A I2C multiplexer
- Three MPU6050 accelerometer sensors
- USB serial connection to laptop
- PAM8403 amplifier
- Bone-conduction transducer

Use exactly THREE MPU6050 sensors throughout the application.
Do not use four sensors or ADXL345 sensors.

Create a horizontal MEASURED PARAMETERS section containing these six outputs,
in the same order and visual style as the reference image:

1. Resonance Frequency
2. Vibration Amplitude
3. Frequency Response
4. Mechanical Symmetry
5. Damping Behaviour
6. Mechanical Resonance Profile

Each parameter must open a detailed analysis view when clicked.

DESIGN REQUIREMENTS:
- Match the reference image's horizontal layout.
- White background.
- Thin blue-grey outer border.
- Compact scientific labels.
- Small scientific graph previews.
- Vertical separators between parameters.
- Professional biomedical instrumentation interface.
- Responsive layout that wraps appropriately on smaller screens.
- Preserve the existing NeuroSense-X application design.

==================================================
1. RESONANCE FREQUENCY
==================================================

Create an interactive frequency-analysis graph.

X-axis: Frequency (Hz)
Y-axis: Response magnitude, with units clearly defined.

Features:
- Display the actual FFT spectrum.
- Identify candidate spectral peaks.
- Mark selected peaks on the graph.
- Display peak frequency and magnitude.
- Allow sensor selection: Sensor 1, Sensor 2, Sensor 3, or comparison.
- Allow selection of the measured axis or resultant acceleration.
- Display sampling frequency, FFT size, and frequency resolution.
- Display the valid Nyquist limit.
- Export graph as PNG and underlying data as CSV.

Distinguish a spectral peak from a confirmed mechanical resonance.
Confirming resonance requires appropriate controlled excitation and response
measurements.

==================================================
2. VIBRATION AMPLITUDE
==================================================

Create an interactive vibration waveform graph.

X-axis: Time (s)
Y-axis: Acceleration (m/s² or g)

Display:
- Raw acceleration waveform.
- Processed vibration waveform.
- X, Y and Z components.
- Resultant acceleration.
- RMS acceleration.
- Peak acceleration.
- Peak-to-peak acceleration.

Allow selection of Sensor 1, Sensor 2, Sensor 3, or all three sensors.

Include zoom, pan, time-window selection, measurement cursors, and PNG export.

Preserve raw data separately from processed data.

==================================================
3. FREQUENCY RESPONSE
==================================================

Create an actual frequency-response graph.

X-axis: Excitation frequency (Hz)
Y-axis: Measured response amplitude (m/s² or another clearly specified unit)

Display:
- Measured response at each excitation frequency.
- Sensor-wise response curves.
- Candidate response peaks.
- Selected frequency range.
- Excitation frequency and measurement status.
- Response amplitude table.
- Comparison between the three sensors.

Only generate a physical frequency-response curve when the excitation
frequency and corresponding sensor response are known and properly associated.

For imported datasets without verified excitation information, show the
available spectrum instead and explain that a validated frequency-response
curve cannot be calculated.

Do not invent frequency-response values.

==================================================
4. MECHANICAL SYMMETRY
==================================================

Create a sensor-response comparison visualization.

Use three sensor markers representing the three actual sensor locations.

Display:
- RMS acceleration per sensor.
- Peak vibration acceleration per sensor.
- Selected-frequency response per sensor.
- Relative differences between selected sensor measurements.
- A radar chart or normalized comparison chart.
- Mechanical Symmetry Index (MSI), if a documented formula has been configured.

Allow the user to assign sensor location labels.

IMPORTANT:
Three sensors do not provide four independent anatomical measurements.
Do not invent a fourth sensor or fourth measurement.

Treat MSI as a project-defined research metric, not an established clinical
measurement.

If sensor positions or measurement conditions do not support a symmetry
comparison, show an informative warning instead of an unsupported score.

==================================================
5. DAMPING BEHAVIOUR
==================================================

Create an interactive damping-analysis view.

Where suitable experimental data exist, display:
- Vibration amplitude versus time after excitation ends.
- Peak envelope.
- Successive peak amplitudes.
- Estimated decay rate.
- Estimated damping ratio, when the selected method supports it.
- Estimation method and quality warnings.

Allow the user to select the sensor and axis.

Do not calculate damping from arbitrary stationary sensor data.

If the experiment does not contain a suitable decay response or another
valid damping-analysis dataset, show:
"Insufficient data for damping estimation."

Do not generate a fabricated decay curve.

==================================================
6. MECHANICAL RESONANCE PROFILE
==================================================

Create a consolidated scientific analysis page.

Include:
- Sensor 1 response.
- Sensor 2 response.
- Sensor 3 response.
- Frequency spectrum.
- Frequency-response curve, when available.
- Resonance-frequency estimates.
- Vibration-amplitude comparison.
- Mechanical Symmetry Index, if supported.
- Damping estimates, if supported.
- Data-quality status.

Create a three-location mechanical-response visualization using the actual
sensor positions and measured values.

Allow the user to select which parameter is displayed.

Use measured values only.

Label interpolated values separately if spatial interpolation is implemented.
Do not imply that three sensors measure the entire skull surface.

==================================================
USB DATA ACQUISITION
==================================================

Connect to the ESP32 through the browser Web Serial API.

Support a configurable serial data format.

Preferred format:

timestamp_ms,sensor_id,ax,ay,az

Parse actual sensor measurements and update the interface.

Allow:
- Connect ESP32
- Disconnect
- Start acquisition
- Stop acquisition
- Save experiment
- Load experiment
- Import CSV
- Export CSV

Show whether the data are:
- Live hardware data
- Imported experimental data
- Demonstration data

Never present demonstration data as actual measurements.

==================================================
SCIENTIFIC VALIDATION
==================================================

The current MPU6050 acquisition system has been tested at 100 samples/second.

At 100 samples/second:
- Nyquist frequency is 50 Hz.
- A 256-sample FFT has nominal bin spacing of approximately 0.390625 Hz.

These values describe the current acquisition configuration.

The bone-conduction transducer has a stated frequency response of 300 Hz
to 19,000 Hz, with a specified resonance frequency of approximately 1,600 Hz.

The current 100 Hz sensor-acquisition configuration cannot characterize
the full frequency response of this transducer.

Therefore:
- Display the actual sampling rate.
- Display the Nyquist limit.
- Disable unsupported frequency ranges.
- Never display fabricated high-frequency results.
- Do not confuse the transducer's resonance frequency with the mechanical
  resonance of the test object.
- Clearly label candidate resonance peaks.

The current three-sensor acquisition switches between TCA9548A channels.
Do not assume perfectly simultaneous sampling when calculating phase
differences or time delays.

==================================================
GRAPH FUNCTIONALITY
==================================================

Every graph must:
- Use actual measured or correctly derived data.
- Have labeled axes and units.
- Support tooltips.
- Support zoom and pan.
- Display the selected sensor.
- Show the analysis time interval.
- Support PNG export.
- Support CSV export where appropriate.
- Show an informative empty state when data are unavailable.
- Show a data-quality warning when results cannot be trusted.

The six parameter previews must update when the underlying experimental
data change.

Do not use hardcoded graph arrays as real experimental data.

If sample data are necessary for initial UI development, label them
DEMO DATA and provide a way to disable demonstration mode.

==================================================
FINAL ACCEPTANCE CRITERIA
==================================================

The finished MEASURED PARAMETERS dashboard must contain exactly these
six items in this order:

1. Resonance Frequency
2. Vibration Amplitude
3. Frequency Response
4. Mechanical Symmetry
5. Damping Behaviour
6. Mechanical Resonance Profile

Each item must have a working detailed graph or analysis view.

The application must support the three actual MPU6050 sensors.

Integrate this feature into the existing NeuroSense-X application rather
than creating an unrelated standalone website.

Prioritize scientifically valid calculations and real hardware data over
decorative visual effects.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://neurosenskull.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/6e94c161-629a-4b6e-8feb-d5f3e1374074).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
