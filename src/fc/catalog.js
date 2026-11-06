/*
 * catalog.js: capability catalog for the flight-controller screen.
 *
 * Every Configurator field has one status. The renderer has one disabled
 * style. This file is the only place that decides LIVE versus grey. The UI
 * asks status(key). It does not know what a dyn notch is.
 *
 * Status rules:
 *   LIVE           writes a PG this build compiles, and that code runs
 *   GATED          writes the PG; this firmware then ignores it at 1 kHz
 *   APPLIED_INERT  writes a PG; nothing that flies reads it
 *   INERT          real 4.5 CLI key, subsystem not compiled
 *   ABSENT         Configurator chrome that is not a CLI key here
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

import { VALUE_TABLE } from './catalog-data.js';

export const STATUS = {
  LIVE: 'LIVE',
  GATED: 'GATED',
  APPLIED_INERT: 'APPLIED_INERT',
  INERT: 'INERT',
  ABSENT: 'ABSENT',
};

/*
 * GATED vs INERT is the honesty line. Grey means this simulator does not
 * have that machine. A noted GATED control means Betaflight has it, and at
 * 1 kHz it does what 1 kHz Betaflight does. Greying the dynamic notch would
 * teach the wrong lesson: a real 8 kHz gyro / 1 kHz PID board also has no
 * dyn notch.
 */
const GATED = {
  dyn_notch_count:
    'Betaflight does not start the dynamic notch when the PID loop runs slower than 2 kHz (DYN_NOTCH_UPDATE_MIN_HZ in dyn_notch_filter.c). This loop runs at 1 kHz, so it does what a real board with a 1 kHz PID loop does: nothing.',
  dyn_notch_q:
    'Betaflight does not start the dynamic notch when the PID loop runs slower than 2 kHz (DYN_NOTCH_UPDATE_MIN_HZ in dyn_notch_filter.c). This loop runs at 1 kHz, so it does what a real board with a 1 kHz PID loop does: nothing.',
  dyn_notch_min_hz:
    'Betaflight does not start the dynamic notch when the PID loop runs slower than 2 kHz (DYN_NOTCH_UPDATE_MIN_HZ in dyn_notch_filter.c). This loop runs at 1 kHz, so it does what a real board with a 1 kHz PID loop does: nothing.',
  dyn_notch_max_hz:
    'Betaflight does not start the dynamic notch when the PID loop runs slower than 2 kHz (DYN_NOTCH_UPDATE_MIN_HZ in dyn_notch_filter.c). This loop runs at 1 kHz, so it does what a real board with a 1 kHz PID loop does: nothing.',
  pid_process_denom:
    'Stored, then set back to 1, because the physics steps at 1 kHz and the PID loop must step with it.',
};

const APPLIED_INERT = {
  motor_kv:
    'Stored in motorConfig.kv. The physics model has its own motor constant for each aircraft and does not read this.',
  gyro_hardware_lpf:
    'There is no gyro chip, so there is no on-chip filter to set. The simulated gyro does not read this.',
  min_throttle:
    'Stored in motorConfig.minthrottle. This is a PWM motor setting, and the simulator sets up its motor range the DShot way, which does not read it.',
  max_throttle:
    'Stored in motorConfig.maxthrottle. This is a PWM motor setting, and the simulator sets up its motor range the DShot way, which does not read it.',
  min_command:
    'Stored in motorConfig.mincommand. This is a PWM motor setting, and the simulator sets up its motor range the DShot way, which does not read it.',
  motor_poles:
    'Stored in motorConfig.motorPoleCount. The RPM filter gets each motor\'s speed straight from the physics model, so there is no electrical RPM to convert.',
  fpv_mix_degrees:
    'Stored in rxConfig.fpvCamAngleDegrees. The FPV angle mix mode is never switched on, so rc.c never uses it.',
  runaway_takeoff_prevention:
    'Stored in the PID profile. Only fc/core.c reads it, and core.c is not compiled.',
  pid_at_min_throttle:
    'Stored in the PID profile. Only fc/core.c reads it, and core.c is not compiled. The simulator switches the PID controller on once and never off.',
  airmode_start_throttle_percent:
    'Stored in rxConfig.airModeActivateThreshold. Only fc/core.c reads it, and core.c is not compiled. With the AIRMODE feature on, airmode is active at every throttle.',
  dyn_idle_start_increase:
    'Stored in the PID profile. mixer.c uses it only before airmode has been activated, and in this simulator airmode counts as activated from the start.',
  ez_landing_speed:
    'Stored in the PID profile. mixer.c compares it with the GPS ground speed, and there is no GPS, so that speed is always zero.',
  max_check:
    'Stored in rxConfig.maxcheck. Only the arming stick commands and the RPM limiter read it, and neither runs in this simulator.',
  gyro_filter_debug_axis:
    'Stored. Only the blackbox debug code reads it, and that does not affect the flight.',
  horizon_level_strength:
    'Stored. Horizon mode is never switched on, so the self-levelling code never reads it.',
  horizon_limit_sticks:
    'Stored. Horizon mode is never switched on, so the self-levelling code never reads it.',
  horizon_limit_degrees:
    'Stored. Horizon mode is never switched on, so the self-levelling code never reads it.',
  horizon_ignore_sticks:
    'Stored. Horizon mode is never switched on, so the self-levelling code never reads it.',
  horizon_delay_ms:
    'Stored. Horizon mode is never switched on, so the self-levelling code never reads it.',
};

const INERT_REASONS = [
  [/^osd_/, 'Betaflight\'s on-screen display is not drawn over the camera view.'],
  [/^vtx_/, 'There is no video transmitter.'],
  [/^gps_/, 'There is no GPS.'],
  [/^led_/, 'There is no LED strip.'],
  [/^blackbox_/, 'There is no onboard blackbox recorder. Flight log in Settings saves a CSV instead.'],
  [/^failsafe_/, 'The failsafe code, flight/failsafe.c, is not compiled.'],
  [/^mag_/, 'There is no compass (magnetometer).'],
  [/^baro_/, 'There is no barometer.'],
  [/^acc_/, 'There is no accelerometer chip. Angle mode takes the attitude from the physics model.'],
  [/^serial/, 'There are no serial ports.'],
  [/^telemetry_/, 'There is no telemetry back to a radio.'],
  [/^beeper_/, 'There is no buzzer.'],
  [/^sdcard_/, 'There is no SD card.'],
  [/^dashboard_/, 'There is no dashboard display.'],
  [/^camera_/, 'There is no camera control device.'],
  [/^cam_/, 'There is no camera control device.'],
  [/^esc_/, 'The ESC and its protocol are not modelled. Motor speeds reach the RPM filter from the physics model.'],
  [/^dshot_/, 'The DShot protocol itself is not modelled. Only dshot_idle_value is used.'],
  [/^msp_/, 'There is no MSP link. Settings reach the firmware as CLI text.'],
  [/^rssi_/, 'There is no receiver, so there is no signal strength to read.'],
  [/^sbus_/, 'There is no receiver. The sticks come from a joystick, a gamepad or the keyboard.'],
  [/^spektrum_/, 'There is no receiver. The sticks come from a joystick, a gamepad or the keyboard.'],
  [/^srxl2_/, 'There is no receiver. The sticks come from a joystick, a gamepad or the keyboard.'],
  [/^crsf_/, 'There is no receiver. The sticks come from a joystick, a gamepad or the keyboard.'],
  [/^rx_/, 'There is no receiver, so there are no pulse limits to set.'],
  [/^gyro_calib/, 'The simulated gyro needs no calibration.'],
  [/^gyro_overflow/, 'The simulated gyro cannot overflow the way a chip can.'],
  [/^gyro_offset/, 'The simulated gyro needs no calibration offset.'],
  [/^gyro_high_range/, 'There is no high-range gyro chip.'],
  [/^gyro_to_use/, 'There is one simulated gyro.'],
  [/^gyro_hardware/, 'There is no gyro chip.'],
  [/^vbat_/, 'The physics model calculates the battery voltage. Use Pack charge in Settings.'],
  [/^ibat_/, 'The physics model calculates the battery current. Use Pack charge in Settings.'],
  [/^bat_/, 'The physics model owns the battery. Use Pack charge in Settings.'],
  [/^battery_/, 'The physics model owns the battery. Use Pack charge in Settings.'],
  [/^current_meter/, 'The physics model calculates the battery current. Use Pack charge in Settings.'],
  [/^use_vbat_alerts/, 'The physics model calculates the battery voltage. Use Pack charge in Settings.'],
  [/^use_cbat_alerts/, 'The physics model owns the battery. Use Pack charge in Settings.'],
  [/^cbat_/, 'The physics model owns the battery. Use Pack charge in Settings.'],
  [/^force_battery/, 'The physics model owns the battery. Use Pack charge in Settings.'],
  [/^motor_pwm_/, 'The motors are driven the DShot way, so PWM details are not used.'],
  [/^motor_output_reordering/, 'Motor output reordering is not modelled.'],
  [/^motor_pwm_inversion/, 'Motor output inversion is not modelled.'],
  [/^small_angle/, 'An arming check. The quad is always armed.'],
  [/^gyro_cal_on_first_arm/, 'The simulated gyro needs no calibration.'],
  [/^pilot_name/, 'The pilot name is set in the simulator\'s own menus.'],
  [/^craft_name/, 'The craft name is set in the simulator\'s own menus.'],
  [/^profile_name/, 'The simulator uses one PID profile.'],
  [/^rateprofile_name/, 'The simulator uses one rate profile.'],
  [/^board_name/, 'There is no board to name.'],
  [/^manufacturer_id/, 'There is no board to name.'],
  [/^acro_trainer_/, 'The acro trainer is not built into this simulator.'],
  [/^auto_profile_cell_count/, 'The simulator uses one PID profile.'],
  [/^runaway_takeoff_deactivate/, 'Runaway takeoff prevention lives in fc/core.c, which is not compiled.'],
  [/^rpm_limit/, 'The RPM limiter is not used in this simulator.'],
  [/^max_aux_channels/, 'There are no AUX channels.'],
  [/^mixer_/, 'Only mixer_type is used. The other mixer settings are for other aircraft.'],
  [/^3d_/, '3D mode is turned on in Settings, not here: the 3d_ values are not read.'],
  [/^deadband/, 'Stick deadband is not used. Stick calibration is in Settings.'],
  [/^yaw_deadband/, 'Stick deadband is not used. Stick calibration is in Settings.'],
  [/^yaw_control_reversed/, 'Not used. Yaw direction is set by yaw_motors_reversed.'],
  [/^align_/, 'Board alignment is not needed. The simulated gyro is mounted straight.'],
  [/^debug_/, 'Debug output is for the blackbox and does not affect the flight.'],
  [/^displayport_/, 'There is no MSP display device.'],
  [/^frsky_/, 'There is no FrSky telemetry.'],
  [/^ibata/, 'The physics model calculates the battery current.'],
  [/^ibatt/, 'The physics model calculates the battery current.'],
  [/^pinio/, 'There are no PINIO outputs.'],
  [/^usb_/, 'There is no USB connection.'],
  [/^vtx/, 'There is no video transmitter.'],
  [/^gps/, 'There is no GPS.'],
  [/^servo/, 'There are no servos on this aircraft.'],
  [/^ledstrip/, 'There is no LED strip.'],
  [/^sdio_/, 'There is no SD card.'],
  [/^system_/, 'Board system settings do not apply.'],
  [/^scheduler_/, 'The loop runs at a fixed 1 kHz.'],
  [/^cpu_overclock/, 'There is no processor to overclock.'],
  [/^stats_/, 'Onboard flight statistics are not compiled.'],
  [/^name$/, 'The craft name is set in the simulator\'s own menus.'],
  [/^rcdevice_/, 'There is no camera control device.'],
  [/^rc_smoothing_debug/, 'Debug output is for the blackbox and does not affect the flight.'],
  [/^rc_smoothing_active/, 'A read-only diagnostic that does not affect the flight.'],
  [/^rpm_filter_weights$/, 'The list form. It is read as rpm_filter_weights_1, _2 and _3, and exported as the list Betaflight 4.5 prints.'],
];

function inertReason(key) {
  for (const [re, reason] of INERT_REASONS) {
    if (re.test(key)) {
      return reason;
    }
  }
  return 'The part of Betaflight that reads it is not compiled.';
}

const PG_TAB = {
  GYRO_CONFIG: 'pid',
  DYN_NOTCH_CONFIG: 'pid',
  RPM_FILTER_CONFIG: 'pid',
  PID: 'pid',
  PID_PROFILE: 'pid',
  PID_CONFIG: 'configuration',
  CONTROL_RATE_PROFILES: 'pid',
  RX_CONFIG: 'receiver',
  RX_SPI_CONFIG: 'receiver',
  PWM_CONFIG: 'receiver',
  MOTOR_CONFIG: 'motors',
  MIXER_CONFIG: 'motors',
  ACCELEROMETER_CONFIG: 'setup',
  COMPASS_CONFIG: 'setup',
  BAROMETER_CONFIG: 'setup',
  BOARD_CONFIG: 'setup',
  OSD: 'osd',
  OSD_CONFIG: 'osd',
  VTX_CONFIG: 'vtx',
  VTX_IO_CONFIG: 'vtx',
  VTX_TABLE_CONFIG: 'vtx',
  LED_STRIP_CONFIG: 'led',
  LEDSTRIP_CONFIG: 'led',
  GPS: 'gps',
  GPS_RESCUE: 'gps',
  FAILSAFE_CONFIG: 'failsafe',
  SERVO_CONFIG: 'servos',
  SERVO_MIXER: 'servos',
  BLACKBOX_CONFIG: 'blackbox',
  BATTERY_CONFIG: 'power',
  CURRENT_SENSOR_ADC_CONFIG: 'power',
  VOLTAGE_SENSOR_ADC_CONFIG: 'power',
  SERIAL_CONFIG: 'ports',
  TELEMETRY_CONFIG: 'ports',
  MSP_CONFIG: 'ports',
  BEEPER_CONFIG: 'configuration',
  MODE_ACTIVATION_PROFILE: 'modes',
  ADJUSTMENT_RANGES: 'adjustments',
};

function tabFor(row) {
  if (row.pg && PG_TAB[row.pg]) {
    return PG_TAB[row.pg];
  }
  const key = row.key;
  if (/^(p_|i_|d_|f_|d_min|tpa_|iterm_|anti_gravity|feedforward_|simplified_|gyro_|dterm_|dyn_notch|rpm_filter|yaw_lowpass|pid_|crash_|angle_|horizon_|level_|throttle_boost|thrust_linear|abs_control|vbat_sag|dyn_idle|ez_landing|transient_throttle|pidsum_|pid_at_min)/.test(key)) {
    return 'pid';
  }
  if (/^(roll_|pitch_|yaw_rc|yaw_srate|yaw_expo|yaw_rate_limit|rates_|thr_mid|thr_expo|throttle_limit|quickrates)/.test(key)) {
    return 'pid';
  }
  if (/^(rc_smoothing|mid_rc|min_check|max_check|airmode_start|serialrx|rssi|rx_|sbus_|crsf_|spektrum_|srxl2_|fpv_mix)/.test(key)) {
    return 'receiver';
  }
  if (/^osd_/.test(key)) {
    return 'osd';
  }
  if (/^vtx_/.test(key)) {
    return 'vtx';
  }
  if (/^led_/.test(key)) {
    return 'led';
  }
  if (/^gps_/.test(key)) {
    return 'gps';
  }
  if (/^failsafe_/.test(key)) {
    return 'failsafe';
  }
  if (/^servo/.test(key)) {
    return 'servos';
  }
  if (/^blackbox_/.test(key)) {
    return 'blackbox';
  }
  if (/^(vbat_|ibat_|bat_|battery_|current_meter|cbat_|use_vbat|use_cbat|force_battery)/.test(key)) {
    return 'power';
  }
  if (/^(motor_|dshot_|mixer_|yaw_motors|min_throttle|max_throttle|min_command|crashflip)/.test(key)) {
    return 'motors';
  }
  if (/^(acc_|mag_|baro_|align_|board_|gyro_calib|gyro_offset|gyro_overflow|gyro_to_use)/.test(key)) {
    return 'setup';
  }
  if (/^(serial|telemetry_|msp_)/.test(key)) {
    return 'ports';
  }
  return 'configuration';
}

function pageFor(key, tab) {
  if (tab !== 'pid') {
    return '';
  }
  if (/^simplified_(dterm_filter|gyro_filter)/.test(key)) {
    return 'filters';
  }
  if (/^(gyro_|dterm_|dyn_notch|rpm_filter|yaw_lowpass|yaw_spin)/.test(key)) {
    return 'filters';
  }
  if (/^(roll_|pitch_|yaw_rc|yaw_srate|yaw_expo|yaw_rate_limit|rates_|thr_mid|thr_expo|throttle_limit|quickrates)/.test(key)) {
    return 'rates';
  }
  return 'pid';
}

function unitsFor(key) {
  if (key.endsWith('_hz')) {
    return 'Hz';
  }
  if (key.endsWith('_ms')) {
    return 'ms';
  }
  if (key.includes('percent')) {
    return '%';
  }
  if (key.endsWith('_q') || key === 'dyn_notch_q' || key === 'rpm_filter_q') {
    return 'Q';
  }
  return '';
}

function classify(row) {
  if (Object.prototype.hasOwnProperty.call(GATED, row.key)) {
    return { status: STATUS.GATED, reason: GATED[row.key] };
  }
  if (Object.prototype.hasOwnProperty.call(APPLIED_INERT, row.key)) {
    return { status: STATUS.APPLIED_INERT, reason: APPLIED_INERT[row.key] };
  }
  if (row.live) {
    return { status: STATUS.LIVE, reason: '' };
  }
  return { status: STATUS.INERT, reason: inertReason(row.key) };
}

function decorate(row) {
  const tab = tabFor(row);
  const { status, reason } = classify(row);
  return {
    key: row.key,
    type: row.type,
    lookup: row.lookup,
    pg: row.pg,
    min: row.min,
    max: row.max,
    array: row.array,
    live: row.live,
    tab,
    page: pageFor(row.key, tab),
    units: unitsFor(row.key),
    status,
    reason,
  };
}

export const TABS = [
  { id: 'setup', label: 'Setup', grey: false, reason: 'The attitude comes from the physics model. Calibration is grey because the simulated gyro needs none.' },
  { id: 'ports', label: 'Ports', grey: true, reason: 'There are no serial ports.' },
  { id: 'configuration', label: 'Configuration', grey: false, reason: '' },
  { id: 'pid', label: 'PID Tuning', grey: false, reason: '' },
  { id: 'receiver', label: 'Receiver', grey: false, reason: '' },
  { id: 'modes', label: 'Modes', grey: false, reason: 'ANGLE and LAUNCH CONTROL are switched here and in Settings. ARM is always on. There are no AUX channels.' },
  { id: 'adjustments', label: 'Adjustments', grey: true, reason: 'There are no AUX channels, so in-flight adjustments are not compiled.' },
  { id: 'servos', label: 'Servos', grey: true, reason: 'There are no servos on this aircraft.' },
  { id: 'motors', label: 'Motors', grey: false, reason: '' },
  { id: 'osd', label: 'OSD', grey: true, reason: 'Betaflight\'s on-screen display is not drawn over the camera view.' },
  { id: 'vtx', label: 'VTX', grey: true, reason: 'There is no video transmitter.' },
  { id: 'led', label: 'LED Strip', grey: true, reason: 'There is no LED strip.' },
  { id: 'gps', label: 'GPS', grey: true, reason: 'There is no GPS.' },
  { id: 'failsafe', label: 'Failsafe', grey: true, reason: 'The failsafe code, flight/failsafe.c, is not compiled.' },
  { id: 'blackbox', label: 'Blackbox', grey: true, reason: 'There is no onboard blackbox recorder. Flight log in Settings saves a CSV instead.' },
  { id: 'blackbox-viewer', label: 'Blackbox viewer', grey: true, reason: 'There is no onboard blackbox recorder. Flight log in Settings saves a CSV instead.' },
  { id: 'power', label: 'Power', grey: true, reason: 'The physics model calculates the battery voltage. Use Pack charge in Settings.' },
  { id: 'presets', label: 'Presets', grey: false, reason: 'The simulator\'s own tunes. Presets from the online repository are not fetched.' },
  { id: 'cli', label: 'CLI', grey: false, reason: 'Settings reach the firmware as this CLI text, and Save restarts it with the text.' },
  { id: 'flasher', label: 'Firmware flasher', grey: true, reason: 'Part of Configurator, not a Betaflight setting.' },
  { id: 'autotune', label: 'Autotune', grey: true, reason: 'Part of Configurator, not a Betaflight setting.' },
  { id: 'flight-plan', label: 'Flight plan', grey: true, reason: 'Part of Configurator, not a Betaflight setting.' },
  { id: 'cloud-profile', label: 'User cloud profile', grey: true, reason: 'Part of Configurator, not a Betaflight setting.' },
  { id: 'cloud-backups', label: 'Backups to cloud', grey: true, reason: 'Part of Configurator, not a Betaflight setting.' },
];

/*
 * Features are CLI commands, not valueTable keys. Do not put them in
 * FIELDS or catalog-lint will demand a firmware setting that does not
 * exist. The Configuration tab asks this list the same way it asks
 * status(key) for set lines.
 */
export const FEATURES = [
  { name: 'AIRMODE', status: STATUS.LIVE, reason: 'Compiled. Writes feature AIRMODE or feature -AIRMODE, as a preset does.' },
  { name: 'ANTI_GRAVITY', status: STATUS.LIVE, reason: 'Compiled. Writes feature ANTI_GRAVITY or feature -ANTI_GRAVITY.' },
  { name: 'GPS', status: STATUS.INERT, reason: 'There is no GPS.' },
  { name: 'OSD', status: STATUS.INERT, reason: 'Betaflight\'s on-screen display is not drawn over the camera view.' },
  { name: 'LED_STRIP', status: STATUS.INERT, reason: 'There is no LED strip.' },
  { name: 'TELEMETRY', status: STATUS.INERT, reason: 'There is no telemetry back to a radio.' },
  { name: 'RX_SPI', status: STATUS.INERT, reason: 'There is no receiver. The sticks come from a joystick, a gamepad or the keyboard.' },
  { name: '3D', status: STATUS.INERT, reason: '3D mode is turned on in Settings, not here: feature 3D is not read.' },
  { name: 'SERVO_TILT', status: STATUS.INERT, reason: 'There are no servos on this aircraft.' },
  { name: 'SOFTSERIAL', status: STATUS.INERT, reason: 'There are no serial ports.' },
];

export const ABSENT_FIELDS = [
  { key: '#flasher', tab: 'flasher', status: STATUS.ABSENT, reason: 'Part of Configurator, not a Betaflight setting.' },
  { key: '#ports_uart', tab: 'ports', status: STATUS.ABSENT, reason: 'There are no serial ports.' },
  { key: '#msp_rx', tab: 'receiver', status: STATUS.ABSENT, reason: 'There is no receiver. The sticks come from a joystick, a gamepad or the keyboard.' },
  { key: '#autotune', tab: 'autotune', status: STATUS.ABSENT, reason: 'Part of Configurator, not a Betaflight setting.' },
  { key: '#led_painter', tab: 'led', status: STATUS.ABSENT, reason: 'There is no LED strip.' },
  { key: '#blackbox_viewer', tab: 'blackbox-viewer', status: STATUS.ABSENT, reason: 'There is no onboard blackbox recorder. Flight log in Settings saves a CSV instead.' },
  { key: '#flight_plan', tab: 'flight-plan', status: STATUS.ABSENT, reason: 'Part of Configurator, not a Betaflight setting.' },
  { key: '#cloud_profile', tab: 'cloud-profile', status: STATUS.ABSENT, reason: 'Part of Configurator, not a Betaflight setting.' },
  { key: '#cloud_backups', tab: 'cloud-backups', status: STATUS.ABSENT, reason: 'Part of Configurator, not a Betaflight setting.' },
  { key: '#aux_ranges', tab: 'modes', status: STATUS.ABSENT, reason: 'There are no AUX channels.' },
];

export const FIELDS = VALUE_TABLE.map(decorate).concat(
  ABSENT_FIELDS.map((f) => ({
    key: f.key,
    type: null,
    lookup: null,
    pg: null,
    min: null,
    max: null,
    array: false,
    live: false,
    tab: f.tab,
    page: '',
    units: '',
    status: f.status,
    reason: f.reason,
  })),
);

const BY_KEY = new Map(FIELDS.map((f) => [f.key, f]));

export function field(key) {
  return BY_KEY.get(key) ?? null;
}

export function status(key) {
  const f = BY_KEY.get(key);
  return f ? f.status : STATUS.INERT;
}

/*
 * The FC screen asks status(key) here. Do not treat sim_bf_key_status as
 * enablement: native 0 means "in the write table", which includes GATED
 * and APPLIED_INERT. Grey-out is this catalog, not the C int.
 */

export function tabFields(tabId) {
  return FIELDS.filter((f) => f.tab === tabId);
}

export function catalogCounts() {
  const counts = {
    LIVE: 0,
    GATED: 0,
    APPLIED_INERT: 0,
    INERT: 0,
    ABSENT: 0,
  };
  for (const f of FIELDS) {
    counts[f.status] += 1;
  }
  return counts;
}

export const GATED_KEYS = Object.keys(GATED);
export const APPLIED_INERT_KEYS = Object.keys(APPLIED_INERT);

/*
 * CLI lookup names as Betaflight 4.5.1 prints them. The FC screen cycles
 * these strings. It does not invent numeric enums.
 */
export const LOOKUPS = {
  OFF_ON: ['OFF', 'ON'],
  OFF_ON_AUTO: ['OFF', 'ON', 'AUTO'],
  ITERM_RELAX: ['OFF', 'RP', 'RPY', 'RP_INC', 'RPY_INC'],
  ITERM_RELAX_TYPE: ['GYRO', 'SETPOINT'],
  TPA_MODE: ['PD', 'D'],
  RATES_TYPE: ['BETAFLIGHT', 'RACEFLIGHT', 'KISS', 'ACTUAL', 'QUICK'],
  GYRO_LPF_TYPE: ['PT1', 'BIQUAD', 'PT2', 'PT3'],
  DTERM_LPF_TYPE: ['PT1', 'BIQUAD', 'PT2', 'PT3'],
  MIXER_TYPE: ['LEGACY', 'LINEAR', 'DYNAMIC', 'EZLANDING'],
  THROTTLE_LIMIT_TYPE: ['OFF', 'SCALE', 'CLIP'],
  SIMPLIFIED_TUNING_PIDS_MODE: ['OFF', 'RP', 'RPY'],
  FEEDFORWARD_AVERAGING: ['OFF', '2_POINT', '3_POINT', '4_POINT'],
  CRASH_RECOVERY: ['OFF', 'ON', 'BEEP', 'DISARM'],
  GYRO_HARDWARE_LPF: ['NORMAL', 'OPTION_1', 'OPTION_2', 'EXPERIMENTAL'],
  LAUNCH_CONTROL_MODE: ['NORMAL', 'PITCHONLY', 'FULL'],
};

const MACRO_BOUNDS = {
  PID_GAIN_MAX: 250,
  D_MIN_GAIN_MAX: 250,
  F_GAIN_MAX: 1000,
  TPA_MAX: 100,
  LPF_MAX_HZ: 1000,
  DYN_LPF_MAX_HZ: 1000,
  DYN_NOTCH_COUNT_MAX: 5,
  MAX_PID_PROCESS_DENOM: 16,
  SIMPLIFIED_TUNING_PIDS_MIN: 0,
  SIMPLIFIED_TUNING_FILTERS_MIN: 10,
  SIMPLIFIED_TUNING_MAX: 200,
  CONTROL_RATE_CONFIG_RATE_MAX: 255,
  CONTROL_RATE_CONFIG_RC_EXPO_MAX: 100,
  CONTROL_RATE_CONFIG_RC_RATES_MAX: 255,
  CONTROL_RATE_CONFIG_RATE_LIMIT_MIN: 200,
  CONTROL_RATE_CONFIG_RATE_LIMIT_MAX: 1998,
  ITERM_ACCELERATOR_GAIN_OFF: 0,
  ITERM_ACCELERATOR_GAIN_MAX: 250,
  PIDSUM_LIMIT_MIN: 100,
  PIDSUM_LIMIT_MAX: 1000,
  MOTOR_OUTPUT_LIMIT_PERCENT_MIN: 1,
  MOTOR_OUTPUT_LIMIT_PERCENT_MAX: 100,
  LAUNCH_CONTROL_THROTTLE_TRIGGER_MAX: 90,
  PWM_RANGE_MIN: 1000,
  PWM_RANGE_MAX: 2000,
  UINT8_MAX: 255,
  UINT16_MAX: 65535,
};

function tokenNumber(tok, fallback) {
  if (tok == null || tok === '') {
    return fallback;
  }
  if (/^-?\d+$/.test(tok)) {
    return Number(tok);
  }
  if (Object.prototype.hasOwnProperty.call(MACRO_BOUNDS, tok)) {
    return MACRO_BOUNDS[tok];
  }
  return fallback;
}

export function fieldBounds(field) {
  const fallbackMax = field.type === 'UINT16' || field.type === 'INT16' ? 2000 : 255;
  const fallbackMin = field.type === 'INT8' || field.type === 'INT16' ? -128 : 0;
  return {
    min: tokenNumber(field.min, fallbackMin),
    max: tokenNumber(field.max, fallbackMax),
  };
}

export function lookupValues(name) {
  return LOOKUPS[name] ?? null;
}

export function fieldEnabled(field) {
  const s = status(field.key);
  return s === STATUS.LIVE || s === STATUS.GATED;
}
