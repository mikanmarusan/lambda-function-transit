/**
 * Line identity for the structured transit API (ADR 0008 D-1).
 *
 * A Jorudan leg line reads like `［地下鉄］東京メトロ南北線(浦和美園行)` or
 * `［私鉄］京王線急行(京王八王子行)` or `［地下鉄］都営大江戸線六本木経由(光が丘行)`.
 * `describeLine()` splits it into a short line name, train type, via station
 * and destination, and maps the line name to a `lineCode` from a closed set.
 *
 * ReDoS: every regex is literal-anchored with bounded quantifiers, and input
 * longer than MAX_LINE_TEXT is not parsed at all.
 */

const MAX_LINE_TEXT = 120;

// Ordered table: normalized line name -> lineCode. Matching is exact after
// normalization, so 京王井の頭線 maps to null rather than to KO (ADR 0008 D-1).
const LINE_CODES = [
  ['南北線', 'N'],
  ['丸ノ内線', 'M'],
  ['日比谷線', 'H'],
  ['半蔵門線', 'Z'],
  ['都営大江戸線', 'E'],
  ['都営新宿線', 'S'],
  ['京王線', 'KO'],
  ['京王新線', 'KO'],
];

// Operator prefixes dropped before matching (東京メトロ南北線 -> 南北線).
const OPERATOR_PREFIXES = ['東京メトロ'];

// Train-type suffixes, longest first so 区間急行 wins over 急行.
const TRAIN_TYPES = [
  '各駅停車', '通勤特急', '通勤快速', '通勤急行', '区間急行', '区間快速',
  '快速急行', '快速特急', '特別快速', '中央特快', '青梅特快',
  '準特急', '新快速', '特快', '快特', '特急', '急行', '準急', '快速', '各停', '普通',
];

const CATEGORY_RE = /^［[^［］\n]{1,10}］/;
const DIRECTION_RE = /\(([^()\n]{1,40})\)$/;
const VIA_RE = /^(.{1,40}線)([^線()\n]{1,20})経由$/;

/**
 * Map a short line name to its lineCode.
 * @param {string} lineName - Line name without category, train type or direction
 * @returns {string|null} lineCode from the closed set, or null when unmapped
 */
export function lineCodeFor(lineName) {
  let key = lineName;
  for (const prefix of OPERATOR_PREFIXES) {
    if (key.startsWith(prefix)) key = key.slice(prefix.length);
  }
  const entry = LINE_CODES.find(([name]) => name === key);
  return entry ? entry[1] : null;
}

/**
 * Strip a trailing train type when what remains is still a line name.
 * @param {string} name - Line name possibly ending in a train type
 * @returns {{ name: string, trainType: string|null }}
 */
function splitTrainType(name) {
  for (const type of TRAIN_TYPES) {
    if (!name.endsWith(type)) continue;
    const rest = name.slice(0, -type.length);
    if (rest.endsWith('線') || rest.endsWith('ライン')) return { name: rest, trainType: type };
  }
  return { name, trainType: null };
}

/**
 * Describe the name part of a Jorudan leg line.
 * @param {string} raw - e.g. `［私鉄］京王線急行(京王八王子行)`
 * @returns {{ lineName: string, lineCode: string|null, trainType: string|null, via: string|null, destination: string|null }}
 */
export function describeLine(raw) {
  let name = String(raw ?? '').trim();
  if (name.length > MAX_LINE_TEXT) {
    return { lineName: '', lineCode: null, trainType: null, via: null, destination: null };
  }
  name = name.replace(CATEGORY_RE, '');

  let destination = null;
  const direction = name.match(DIRECTION_RE);
  if (direction) {
    destination = direction[1].endsWith('行') ? direction[1].slice(0, -1) : direction[1];
    name = name.slice(0, direction.index);
  }

  let via = null;
  const viaMatch = name.match(VIA_RE);
  if (viaMatch) {
    name = viaMatch[1];
    via = viaMatch[2];
  }

  const { name: lineName, trainType } = splitTrainType(name);
  return { lineName, lineCode: lineCodeFor(lineName), trainType, via, destination };
}
