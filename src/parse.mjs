/**
 * Structured parsing of Jorudan route blocks for the `origins` response field
 * (ADR 0006 D-2). One route block (from `splitRoutes()`) becomes one candidate:
 * summary times, stops[] and legs[], with ISO 8601 JST timestamps.
 *
 * ReDoS: the block is parsed line by line, lines longer than MAX_LINE_LENGTH
 * are skipped, and every regex is literal-anchored with bounded quantifiers.
 */

import { describeLine } from './lines.mjs';

const MAX_LINE_LENGTH = 200;
const MINUTES_PER_DAY = 24 * 60;
const HALF_DAY_MINUTES = 12 * 60;
// Japan observes no DST, so JST is a fixed UTC+9 offset.
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

const SUMMARY_TIME_RE = /^発着時間：\(?(\d{1,2}):(\d{2})\)?発 → \(?(\d{1,2}):(\d{2})\)?着/;
const DURATION_RE = /^所要時間：(?:(\d{1,2})時間)?(?:(\d{1,3})分)?$/;
const TRANSFER_COUNT_RE = /^乗換回数：(\d{1,2})回/;
const LEG_TIME_RE = /^\(?(\d{1,2}):(\d{2})\)?-\(?(\d{1,2}):(\d{2})\)?［(\d{1,3})分］/;
const FARE_RE = /^\d{1,6}円/;
const STATION_RE = /^[^ ≪［]{1,40}/;
const TRANSFER_RE = /［乗換(\d{1,3})分\+待ち(\d{1,3})分］/;
const ARRIVAL_PLATFORM_RE = /^(.{1,20}?)着(?:・|$)/;
const DISTANCE_RE = /^(\d{1,4}(?:\.\d{1,2})?)km$/;
const PART_SEPARATOR_RE = / {2,80}/;
const TOKEN_SEPARATOR_RE = / {1,80}/;
const PLATFORM_PART_RE = /[着発]$/;

/**
 * Format an epoch as ISO 8601 with the JST offset (e.g. `2026-10-01T20:45:00+09:00`).
 * @param {number} epochMs - Epoch milliseconds
 * @returns {string}
 */
export function toJstIso(epochMs) {
  return `${new Date(epochMs + JST_OFFSET_MS).toISOString().slice(0, 19)}+09:00`;
}

/**
 * Epoch of JST midnight for the JST calendar day containing `epochMs`, plus
 * the JST minute of day.
 * @param {number} epochMs - Epoch milliseconds
 * @returns {{ midnightMs: number, minuteOfDay: number }}
 */
function jstDay(epochMs) {
  const shifted = epochMs + JST_OFFSET_MS;
  const dayStart = shifted - (((shifted % 86_400_000) + 86_400_000) % 86_400_000);
  return {
    midnightMs: dayStart - JST_OFFSET_MS,
    minuteOfDay: Math.floor((shifted - dayStart) / 60_000),
  };
}

/**
 * Minutes since midnight for an `HH:MM` pair, or NaN when out of range.
 * @param {string} h - Hour
 * @param {string} m - Minute
 * @returns {number}
 */
function toMinutes(h, m) {
  const hour = Number(h);
  const minute = Number(m);
  return hour <= 23 && minute <= 59 ? hour * 60 + minute : NaN;
}

/**
 * Parse a stop line (`■` terminal or `◇` transfer station).
 * @param {string} line - e.g. `◇四ッ谷    3番線着・1番線発 ［乗換4分+待ち0分］`
 * @returns {Object|null} Stop, or null when no station name is present
 */
function parseStop(line) {
  const rest = line.slice(1);
  const station = rest.match(STATION_RE)?.[0];
  if (!station) return null;

  let arrivalPlatform = null;
  let departurePlatform = null;
  const platform = rest.slice(station.length).split(TOKEN_SEPARATOR_RE)
    .find(p => PLATFORM_PART_RE.test(p) && !p.startsWith('≪') && !p.startsWith('［'));
  if (platform) {
    const arrival = platform.match(ARRIVAL_PLATFORM_RE);
    let departure = platform;
    if (arrival) {
      arrivalPlatform = arrival[1];
      departure = platform.slice(arrival[0].length);
    }
    if (departure.endsWith('発')) departurePlatform = departure.slice(0, -1) || null;
  }

  const transfer = rest.match(TRANSFER_RE);
  return {
    station,
    arrivalPlatform,
    departurePlatform,
    transferMinutes: transfer ? Number(transfer[1]) : null,
    waitMinutes: transfer ? Number(transfer[2]) : null,
    noAlight: rest.includes('≪降車不要≫'),
  };
}

/**
 * Parse a leg's line row (`｜` content that is not a time, fare or arrow).
 * @param {string} content - e.g. `［地下鉄］東京メトロ南北線(浦和美園行)   3.1km   3・6号車`
 * @returns {Object} Leg without times
 */
function parseLegInfo(content) {
  const [name, distance, carPosition] = content.split(PART_SEPARATOR_RE).map(p => p.trim());
  const km = distance?.match(DISTANCE_RE);
  return {
    ...describeLine(name),
    distanceKm: km ? Number(km[1]) : null,
    carPosition: carPosition || null,
  };
}

/**
 * Parse one Jorudan route block into a structured candidate.
 * Times are resolved to dates from `searchStart`: the first time earlier than
 * the search time by more than half a day is the next day, and each later time
 * earlier than the previous one is the next day (midnight crossing).
 * @param {string} block - One route block from `splitRoutes()`
 * @param {Date} searchStart - The instant the search departs from (JST now + walk)
 * @returns {Object|null} Candidate, or null when the block is malformed
 */
export function parseCandidate(block, searchStart) {
  let summary = null;
  let durationMinutes = null;
  let transferCount = null;
  const stops = [];
  const legs = [];

  for (const rawLine of String(block ?? '').split(/\r?\n/)) {
    if (rawLine.length > MAX_LINE_LENGTH) continue;
    const line = rawLine.trim();
    if (line.startsWith('発着時間：')) {
      const m = line.match(SUMMARY_TIME_RE);
      if (m) summary = { depart: toMinutes(m[1], m[2]), arrive: toMinutes(m[3], m[4]) };
    } else if (line.startsWith('所要時間：')) {
      const m = line.match(DURATION_RE);
      if (m && (m[1] || m[2])) durationMinutes = Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0);
    } else if (line.startsWith('乗換回数：')) {
      const m = line.match(TRANSFER_COUNT_RE);
      if (m) transferCount = Number(m[1]);
    } else if (line.startsWith('■') || line.startsWith('◇')) {
      const stop = parseStop(line);
      if (stop) stops.push(stop);
    } else if (line.startsWith('｜')) {
      const content = line.slice(1).trim();
      if (content === '' || content.startsWith('↓') || FARE_RE.test(content)) continue;
      const time = content.match(LEG_TIME_RE);
      if (time) {
        const leg = legs.at(-1);
        if (leg && leg.times === undefined) {
          leg.times = [toMinutes(time[1], time[2]), toMinutes(time[3], time[4])];
          leg.minutes = Number(time[5]);
        }
      } else {
        legs.push(parseLegInfo(content));
      }
    }
  }

  if (!summary || durationMinutes === null || transferCount === null) return null;
  if (legs.length === 0 || stops.length !== legs.length + 1) return null;
  if (legs.some(leg => leg.times === undefined || !leg.lineName)) return null;
  if ([summary.depart, summary.arrive, ...legs.flatMap(leg => leg.times)].some(Number.isNaN)) return null;

  const { midnightMs, minuteOfDay: searchMinute } = jstDay(searchStart.getTime());
  let previous = summary.depart < searchMinute - HALF_DAY_MINUTES
    ? summary.depart + MINUTES_PER_DAY
    : summary.depart;
  const departureMinute = previous;
  const resolve = (minute) => {
    let absolute = minute + Math.floor(previous / MINUTES_PER_DAY) * MINUTES_PER_DAY;
    if (absolute < previous) absolute += MINUTES_PER_DAY;
    previous = absolute;
    return toJstIso(midnightMs + absolute * 60_000);
  };
  const departureAt = toJstIso(midnightMs + departureMinute * 60_000);

  const resolvedLegs = legs.map(({ times, ...leg }) => {
    const departAt = resolve(times[0]);
    const arriveAt = resolve(times[1]);
    return {
      lineName: leg.lineName,
      lineCode: leg.lineCode,
      trainType: leg.trainType,
      via: leg.via,
      destination: leg.destination,
      departAt,
      arriveAt,
      minutes: leg.minutes,
      distanceKm: leg.distanceKm,
      carPosition: leg.carPosition,
    };
  });

  const arrivalAt = resolve(summary.arrive);
  // Fail closed when the resolved summary disagrees with Jorudan's own duration
  // (e.g. a summary arrival earlier than the last leg rolled to the next day).
  if (previous - departureMinute !== durationMinutes) return null;

  return {
    departureAt,
    arrivalAt,
    durationMinutes,
    transferCount,
    isFastest: false,
    isFewestTransfers: false,
    stops,
    legs: resolvedLegs,
  };
}

/**
 * Sort candidates by arrival, keep the first `max`, and flag the fastest and
 * the fewest-transfers candidate (one each, earliest arrival wins ties).
 * @param {Object[]} candidates - Parsed candidates
 * @param {number} max - Maximum number of candidates to keep
 * @returns {Object[]} Ranked candidates
 */
export function rankCandidates(candidates, max) {
  const ranked = [...candidates]
    .sort((a, b) => Date.parse(a.arrivalAt) - Date.parse(b.arrivalAt) || a.transferCount - b.transferCount)
    .slice(0, max)
    .map(c => ({ ...c, isFastest: false, isFewestTransfers: false }));
  if (ranked.length > 0) {
    ranked[0].isFastest = true;
    const fewest = ranked.reduce((best, c) => (c.transferCount < best.transferCount ? c : best));
    fewest.isFewestTransfers = true;
  }
  return ranked;
}

/**
 * Name the origin whose best candidate arrives first (config order wins ties).
 * @param {Object[]} origins - Origin results with ranked candidates
 * @returns {string|null} Origin name, or null when no origin has a candidate
 */
export function pickFastestOrigin(origins) {
  let best = null;
  for (const o of origins) {
    const first = o.candidates[0];
    if (!first) continue;
    if (!best || Date.parse(first.arrivalAt) < Date.parse(best.arrivalAt)) {
      best = { origin: o.origin, arrivalAt: first.arrivalAt };
    }
  }
  return best ? best.origin : null;
}
