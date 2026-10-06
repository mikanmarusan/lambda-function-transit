import { describe, it } from 'node:test';
import assert from 'node:assert';
import { parseCandidate, rankCandidates, pickFastestOrigin, toJstIso } from '../src/parse.mjs';
import { describeLine, lineCodeFor } from '../src/lines.mjs';

// Live-shaped route blocks, copied from a Jorudan results page (2026-10-06).
const LIVE_NAMBOKU_MARUNOUCHI = [
  '発着時間：20:45発 → 21:24着',
  '所要時間：39分',
  '乗車時間：29分',
  '乗換回数：2回',
  '総額：408円（IC利用）',
  '距離：18.5km',
  '',
  '■六本木一丁目    1番線発 ',
  '｜ 　［地下鉄］東京メトロ南北線(浦和美園行)   3.1km   3・6号車',
  '｜ 　20:45-20:51［6分］',
  '｜ 　178円',
  '◇四ッ谷    3番線着・1番線発 ［乗換4分+待ち0分］',
  '｜ 　［地下鉄］東京メトロ丸ノ内線(荻窪行)   2.9km   前／1号車',
  '｜ 　20:55-21:02［7分］',
  '｜ 　 ↓ ',
  '◇新宿    1番線着・3番線発 ［乗換6分+待ち0分］',
  '｜ 　［私鉄］京王線急行(京王八王子行)   12.5km   後方',
  '｜ 　21:08-21:24［16分］',
  '｜ 　230円',
  '■つつじヶ丘（東京）    1・2番線着 ',
  '',
].join('\n');

const LIVE_NO_ALIGHT = [
  '発着時間：20:45発 → 21:40着',
  '所要時間：55分',
  '乗換回数：3回',
  '',
  '■六本木一丁目    1番線発 ',
  '｜ 　［地下鉄］東京メトロ南北線(浦和美園行)   4.1km   後／6号車',
  '｜ 　20:45-20:53［8分］',
  '｜ 　516円',
  '◇市ヶ谷    3番線着・1番線発 ［乗換7分+待ち6分］',
  '｜ 　［地下鉄］都営新宿線各停(笹塚行)   3.7km   前～後',
  '｜ 　21:06-21:12［6分］',
  '｜ 　 ↓ ',
  '◇新線新宿 ≪降車不要≫     ［乗換0分+待ち1分］',
  '｜ 　［私鉄］京王新線各停(笹塚行)   3.6km   ',
  '｜ 　21:13-21:18［5分］',
  '｜ 　 ↓ ',
  '◇笹塚    2番線着・1番線発 ［乗換1分+待ち7分］',
  '｜ 　［私鉄］京王線特急(京王八王子行)   8.9km   ',
  '｜ 　21:26-21:33［7分］',
  '｜ 　 ↓ ',
  '◇千歳烏山    1番線着・1番線発 ［乗換1分+待ち1分］',
  '｜ 　［私鉄］京王線各停(高幡不動行)   ↓   後方',
  '｜ 　21:35-21:40［5分］',
  '｜ 　 ↓ ',
  '■つつじヶ丘（東京）    1・2番線着 ',
].join('\r\n');

const LIVE_WALK_TRANSFER = [
  '発着時間：20:49発 → 21:50着',
  '所要時間：1時間1分',
  '乗換回数：1回',
  '',
  '■麻布十番    2番線発 ',
  '｜ 　［地下鉄］都営大江戸線六本木経由(光が丘行)   5.7km   3・8号車',
  '｜ 　20:49-21:01［12分］',
  '｜ 　220円',
  '◇新宿/新線新宿    7番線着・4番線発 ［乗換4分+待ち2分］',
  '｜ 　［私鉄］京王線各停(高幡不動行)   12.5km   後方',
  '｜ 　21:07-21:50［43分］',
  '■つつじヶ丘（東京）    1・2番線着 ',
].join('\n');

// Live walking + bus candidate: Jorudan parenthesises the walking start, and
// 所要時間 (1時間5分) still equals arrival minus that parenthesised departure.
const LIVE_WALK_BUS = [
  '発着時間：(20:53)発 → 21:58着',
  '所要時間：1時間5分',
  '乗車時間：48分',
  '乗換回数：2回',
  '総額：440円（IC利用）',
  '',
  '',
  '■神谷町     ',
  '｜ 　徒歩       ',
  '｜ 　(20:53)-(20:57)［4分］',
  '｜ 　',
  '◇神谷町駅前    2番のりば発 ',
  '｜ 　［バス］[都バス２３区]渋８８(渋谷駅前行)       ',
  '｜ 　20:57-21:21［24分］',
  '｜ 　210円',
  '◇渋谷駅前/渋谷    59番のりば着・1・2番線発 ［乗換6分+待ち4分］',
  '｜ 　［私鉄］京王井の頭線急行(吉祥寺行)   4.9km   後／5号車',
  '｜ 　21:31-21:39［8分］',
  '｜ 　230円',
  '◇明大前    3番線着・1番線発 ［乗換3分+待ち0分］',
  '｜ 　［私鉄］京王線各停(高幡不動行)   7.3km   後方',
  '｜ 　21:42-21:58［16分］',
  '｜ 　 ↓ ',
  '■つつじヶ丘（東京）    1・2番線着 ',
].join('\n');

// A late search whose last leg crosses midnight.
const MIDNIGHT_CROSSING = [
  '発着時間：23:50発 → 00:30着',
  '所要時間：40分',
  '乗換回数：1回',
  '',
  '■六本木一丁目    1番線発 ',
  '｜ 　［地下鉄］東京メトロ南北線(浦和美園行)   3.1km   3・6号車',
  '｜ 　23:50-23:56［6分］',
  '◇四ッ谷    3番線着・1番線発 ［乗換4分+待ち4分］',
  '｜ 　［地下鉄］東京メトロ丸ノ内線(荻窪行)   2.9km   前／1号車',
  '｜ 　23:58-00:05［7分］',
  '◇新宿    1番線着・3番線発 ［乗換6分+待ち3分］',
  '｜ 　［私鉄］京王線各停(高幡不動行)   12.5km   後方',
  '｜ 　00:14-00:30［16分］',
  '■つつじヶ丘（東京）    1・2番線着 ',
].join('\n');

const SEARCH = new Date('2026-10-06T20:44:00+09:00');

function timed(fn) {
  const start = process.hrtime.bigint();
  const value = fn();
  return { value, ms: Number(process.hrtime.bigint() - start) / 1e6 };
}

describe('parseCandidate — live-shaped summary, stops and legs', () => {
  const c = parseCandidate(LIVE_NAMBOKU_MARUNOUCHI, SEARCH);

  it('parses the summary as ISO JST times, duration and transfer count', () => {
    assert.strictEqual(c.departureAt, '2026-10-06T20:45:00+09:00');
    assert.strictEqual(c.arrivalAt, '2026-10-06T21:24:00+09:00');
    assert.strictEqual(c.durationMinutes, 39);
    assert.strictEqual(c.transferCount, 2);
  });

  it('parses stops with platforms and transfer/wait minutes', () => {
    assert.deepStrictEqual(c.stops, [
      { station: '六本木一丁目', arrivalPlatform: null, departurePlatform: '1番線', transferMinutes: null, waitMinutes: null, noAlight: false },
      { station: '四ッ谷', arrivalPlatform: '3番線', departurePlatform: '1番線', transferMinutes: 4, waitMinutes: 0, noAlight: false },
      { station: '新宿', arrivalPlatform: '1番線', departurePlatform: '3番線', transferMinutes: 6, waitMinutes: 0, noAlight: false },
      { station: 'つつじヶ丘（東京）', arrivalPlatform: '1・2番線', departurePlatform: null, transferMinutes: null, waitMinutes: null, noAlight: false },
    ]);
  });

  it('parses legs with per-leg ISO times, line identity, distance and car position', () => {
    assert.strictEqual(c.legs.length, 3);
    assert.deepStrictEqual(c.legs[0], {
      lineName: '東京メトロ南北線', lineCode: 'N', trainType: null, via: null, destination: '浦和美園',
      departAt: '2026-10-06T20:45:00+09:00', arriveAt: '2026-10-06T20:51:00+09:00',
      minutes: 6, distanceKm: 3.1, carPosition: '3・6号車',
    });
    assert.strictEqual(c.legs[1].lineName, '東京メトロ丸ノ内線');
    assert.strictEqual(c.legs[1].lineCode, 'M');
    assert.strictEqual(c.legs[1].carPosition, '前／1号車');
    assert.strictEqual(c.legs[1].departAt, '2026-10-06T20:55:00+09:00');
    assert.strictEqual(c.legs[1].arriveAt, '2026-10-06T21:02:00+09:00');
    assert.deepStrictEqual(
      [c.legs[2].lineName, c.legs[2].lineCode, c.legs[2].trainType, c.legs[2].destination, c.legs[2].carPosition],
      ['京王線', 'KO', '急行', '京王八王子', '後方'],
    );
  });

  it('marks ≪降車不要≫ stops as noAlight and reads `↓` distance as null (CRLF input)', () => {
    const n = parseCandidate(LIVE_NO_ALIGHT, SEARCH);
    assert.ok(n, 'CRLF block should parse');
    const shinsen = n.stops.find(s => s.station === '新線新宿');
    assert.deepStrictEqual(shinsen, {
      station: '新線新宿', arrivalPlatform: null, departurePlatform: null, transferMinutes: 0, waitMinutes: 1, noAlight: true,
    });
    assert.strictEqual(n.legs[0].carPosition, '後／6号車');
    assert.strictEqual(n.legs[1].lineCode, 'S');
    assert.strictEqual(n.legs[2].lineName, '京王新線');
    assert.strictEqual(n.legs[2].lineCode, 'KO');
    const last = n.legs.at(-1);
    assert.strictEqual(last.distanceKm, null, '`↓` means the train continues; no distance');
    assert.strictEqual(last.carPosition, '後方');
  });

  it('keeps a walking-transfer station name like 新宿/新線新宿 and reads via from the line', () => {
    const w = parseCandidate(LIVE_WALK_TRANSFER, SEARCH);
    assert.strictEqual(w.stops[1].station, '新宿/新線新宿');
    assert.strictEqual(w.stops[1].arrivalPlatform, '7番線');
    assert.strictEqual(w.stops[1].departurePlatform, '4番線');
    assert.deepStrictEqual(
      [w.legs[0].lineName, w.legs[0].lineCode, w.legs[0].via, w.legs[0].destination],
      ['都営大江戸線', 'E', '六本木', '光が丘'],
    );
    assert.strictEqual(w.durationMinutes, 61);
  });

  it('resolves a midnight-crossing leg to a next-day ISO arriveAt', () => {
    const m = parseCandidate(MIDNIGHT_CROSSING, new Date('2026-10-06T23:48:00+09:00'));
    assert.strictEqual(m.departureAt, '2026-10-06T23:50:00+09:00');
    assert.strictEqual(m.legs[1].departAt, '2026-10-06T23:58:00+09:00');
    assert.strictEqual(m.legs[1].arriveAt, '2026-10-07T00:05:00+09:00');
    assert.strictEqual(m.legs[2].departAt, '2026-10-07T00:14:00+09:00');
    assert.strictEqual(m.arrivalAt, '2026-10-07T00:30:00+09:00');
  });

  it('dates a departure after midnight on the next day when the search was before midnight', () => {
    const block = MIDNIGHT_CROSSING
      .replace('発着時間：23:50発', '発着時間：00:01発')
      .replace('所要時間：40分', '所要時間：29分')
      .replace('23:50-23:56', '00:01-00:05')
      .replace('23:58-00:05', '00:07-00:12');
    const m = parseCandidate(block, new Date('2026-10-06T23:55:00+09:00'));
    assert.strictEqual(m.departureAt, '2026-10-07T00:01:00+09:00');
    assert.strictEqual(m.legs[2].departAt, '2026-10-07T00:14:00+09:00');
    assert.strictEqual(m.arrivalAt, '2026-10-07T00:30:00+09:00');
  });

  it('accepts parenthesised (walking) times in the summary and leg rows', () => {
    const block = LIVE_WALK_TRANSFER
      .replace('発着時間：20:49発', '発着時間：(20:49)発')
      .replace('20:49-21:01［12分］', '(20:49)-(21:01)［12分］');
    const w = parseCandidate(block, SEARCH);
    assert.strictEqual(w.departureAt, '2026-10-06T20:49:00+09:00');
    assert.strictEqual(w.legs[0].arriveAt, '2026-10-06T21:01:00+09:00');
  });

  it('parses a live walking + bus candidate with a parenthesised walking start', () => {
    const w = parseCandidate(LIVE_WALK_BUS, SEARCH);
    assert.ok(w, 'the live 所要時間 matches arrival minus the parenthesised departure');
    assert.strictEqual(w.departureAt, '2026-10-06T20:53:00+09:00');
    assert.strictEqual(w.durationMinutes, 65);
    assert.deepStrictEqual(w.legs.map(l => [l.lineName, l.lineCode]), [
      ['徒歩', null], ['[都バス２３区]渋８８', null], ['京王井の頭線', null], ['京王線', 'KO'],
    ]);
    assert.deepStrictEqual(w.stops.map(s => [s.station, s.arrivalPlatform, s.departurePlatform]), [
      ['神谷町', null, null],
      ['神谷町駅前', null, '2番のりば'],
      ['渋谷駅前/渋谷', '59番のりば', '1・2番線'],
      ['明大前', '3番線', '1番線'],
      ['つつじヶ丘（東京）', '1・2番線', null],
    ]);
  });

  it('reads 所要時間 written as 0分', () => {
    const block = LIVE_WALK_TRANSFER.replace('所要時間：1時間1分', '所要時間：1時間0分').replace('21:50着', '21:49着').replace('21:07-21:50［43分］', '21:07-21:49［42分］');
    assert.strictEqual(parseCandidate(block, SEARCH).durationMinutes, 60);
  });

  it('reads 所要時間 written as hours only', () => {
    const block = LIVE_WALK_TRANSFER.replace('所要時間：1時間1分', '所要時間：1時間').replace('21:50着', '21:49着').replace('21:07-21:50［43分］', '21:07-21:49［42分］');
    assert.strictEqual(parseCandidate(block, SEARCH).durationMinutes, 60);
  });

  it('drops a block whose summary disagrees with its own duration (fail closed)', () => {
    const early = LIVE_NAMBOKU_MARUNOUCHI.replace('21:24着', '21:20着');
    assert.strictEqual(parseCandidate(early, SEARCH), null, 'an arrival before the last leg must not roll to the next day');
    const wrongDuration = LIVE_NAMBOKU_MARUNOUCHI.replace('所要時間：39分', '所要時間：45分');
    assert.strictEqual(parseCandidate(wrongDuration, SEARCH), null);
  });

  it('drops a block with an out-of-range time', () => {
    assert.strictEqual(parseCandidate(LIVE_NAMBOKU_MARUNOUCHI.replace('20:55-21:02', '20:55-25:02'), SEARCH), null);
    // 20:84 is numerically 21:24, so only the range check (not the duration check) rejects it.
    assert.strictEqual(parseCandidate(LIVE_NAMBOKU_MARUNOUCHI.replace('21:24着', '20:84着'), SEARCH), null);
  });

  it('returns null for a malformed block', () => {
    assert.strictEqual(parseCandidate('発着時間：\r\n\r\n', SEARCH), null);
    assert.strictEqual(parseCandidate('', SEARCH), null);
    const noTimes = LIVE_WALK_TRANSFER.replace('｜ 　20:49-21:01［12分］', '｜ 　');
    assert.strictEqual(parseCandidate(noTimes, SEARCH), null, 'a leg without a time line is malformed');
  });
});

describe('parseCandidate — ReDoS resistance', () => {
  const ADVERSARIAL = [
    '1'.repeat(100000),
    `発着時間：${'1'.repeat(100000)}`,
    `発着時間：${'1:'.repeat(50000)}発 → `,
    `所要時間：${'1時間'.repeat(30000)}`,
    `■${' '.repeat(100000)}着`,
    `◇${'1・'.repeat(50000)}着`,
    `｜ 　${'(1'.repeat(50000)}`,
    `｜ 　［${'［'.repeat(100000)}`,
    `${LIVE_NAMBOKU_MARUNOUCHI}\n${'｜ 　1:1-'.repeat(20000)}`,
    `■a${' 1'.repeat(80)}`.repeat(1000),
    `｜ 　京王線${'線'.repeat(30)}${'a'.repeat(60)}経由x`,
  ];

  ADVERSARIAL.forEach((input, i) => {
    it(`returns promptly on adversarial input #${i}`, () => {
      const { ms } = timed(() => parseCandidate(input, SEARCH));
      assert.ok(ms < 250, `took ${ms}ms`);
    });
  });

  // Worst cases that fit under the line-length cap, so the regexes themselves run.
  const SHORT_ADVERSARIAL = [
    `発着時間：${'1'.repeat(190)}`,
    `所要時間：${'1時間'.repeat(60)}`,
    `乗換回数：${'1'.repeat(190)}`,
    `◇a${' 1'.repeat(99)}`,
    `◇a ${'1・'.repeat(95)}着`,
    `◇a ［乗換${'1'.repeat(180)}`,
    `｜ 　${'1:1-'.repeat(48)}`,
    `｜ 　${'('.repeat(190)}`,
    `｜ 　a${' '.repeat(80)}${'1'.repeat(100)}km`,
  ];

  SHORT_ADVERSARIAL.forEach((line, i) => {
    it(`returns promptly on a sub-cap adversarial line #${i}`, () => {
      assert.ok(line.length <= 200, 'must stay under MAX_LINE_LENGTH so it is parsed, not skipped');
      const input = Array(500).fill(line).join('\n');
      const { ms } = timed(() => parseCandidate(input, SEARCH));
      assert.ok(ms < 250, `took ${ms}ms`);
    });
  });

  it('describeLine returns promptly on adversarial input', () => {
    for (const input of ['1'.repeat(100000), `${'線'.repeat(39)}${'あ'.repeat(19)}経`, `(${'('.repeat(100000)}`]) {
      const { ms } = timed(() => describeLine(input));
      assert.ok(ms < 250, `took ${ms}ms`);
    }
    for (const input of [`${'線'.repeat(40)}${'あ'.repeat(70)}経由`, `${'('.repeat(118)}`, `［${'［'.repeat(118)}`]) {
      assert.ok(input.length <= 120, 'must stay under MAX_LINE_TEXT so it is parsed');
      const { ms } = timed(() => { for (let i = 0; i < 1000; i++) describeLine(input); });
      assert.ok(ms < 250, `took ${ms}ms`);
    }
  });

  it('skips over-long lines instead of parsing them', () => {
    const padded = LIVE_NAMBOKU_MARUNOUCHI.replace('◇四ッ谷', `◇四ッ谷${' '.repeat(300)}`);
    assert.strictEqual(parseCandidate(padded, SEARCH), null, 'the skipped stop leaves stops/legs inconsistent');
  });
});

describe('describeLine / lineCodeFor (ADR 0008 D-1 closed set)', () => {
  const CASES = [
    ['［地下鉄］東京メトロ南北線(浦和美園行)', '東京メトロ南北線', 'N'],
    ['［地下鉄］東京メトロ丸ノ内線(荻窪行)', '東京メトロ丸ノ内線', 'M'],
    ['［地下鉄］東京メトロ日比谷線(中目黒行)', '東京メトロ日比谷線', 'H'],
    ['［地下鉄］東京メトロ半蔵門線(押上行)', '東京メトロ半蔵門線', 'Z'],
    ['［地下鉄］都営大江戸線都庁前経由(光が丘行)', '都営大江戸線', 'E'],
    ['［地下鉄］都営新宿線各停(笹塚行)', '都営新宿線', 'S'],
    ['［私鉄］京王線区間急行(橋本行)', '京王線', 'KO'],
    ['［私鉄］京王新線各停(笹塚行)', '京王新線', 'KO'],
    ['［私鉄］京王井の頭線急行(吉祥寺行)', '京王井の頭線', null],
    ['［地下鉄］東京メトロ銀座線(渋谷行)', '東京メトロ銀座線', null],
    ['［ＪＲ］中央線通勤快速(青梅行)', '中央線', null],
    ['徒歩', '徒歩', null],
  ];

  for (const [raw, lineName, lineCode] of CASES) {
    it(`${raw} -> ${lineName} / ${lineCode}`, () => {
      const d = describeLine(raw);
      assert.strictEqual(d.lineName, lineName);
      assert.strictEqual(d.lineCode, lineCode);
    });
  }

  it('matches exactly, not by substring', () => {
    assert.strictEqual(lineCodeFor('京王線'), 'KO');
    assert.strictEqual(lineCodeFor('京王井の頭線'), null);
    assert.strictEqual(lineCodeFor('仙台市地下鉄南北線'), null);
  });
});

function candidate(arrivalAt, transferCount) {
  return { departureAt: '2026-10-06T20:45:00+09:00', arrivalAt, transferCount, isFastest: false, isFewestTransfers: false };
}

describe('rankCandidates', () => {
  it('sorts by arrival, keeps at most max, and flags one fastest and one fewest-transfers', () => {
    const ranked = rankCandidates([
      candidate('2026-10-06T21:40:00+09:00', 1),
      candidate('2026-10-06T21:24:00+09:00', 2),
      candidate('2026-10-06T21:50:00+09:00', 0),
      candidate('2026-10-06T21:30:00+09:00', 3),
    ], 3);
    assert.deepStrictEqual(ranked.map(c => c.arrivalAt), [
      '2026-10-06T21:24:00+09:00',
      '2026-10-06T21:30:00+09:00',
      '2026-10-06T21:40:00+09:00',
    ]);
    assert.deepStrictEqual(ranked.map(c => c.isFastest), [true, false, false]);
    assert.deepStrictEqual(ranked.map(c => c.isFewestTransfers), [false, false, true]);
  });

  it('orders a next-day arrival after a same-day one', () => {
    const ranked = rankCandidates([
      candidate('2026-10-07T00:05:00+09:00', 1),
      candidate('2026-10-06T23:59:00+09:00', 1),
    ], 3);
    assert.strictEqual(ranked[0].arrivalAt, '2026-10-06T23:59:00+09:00');
    assert.deepStrictEqual(ranked.map(c => c.isFewestTransfers), [true, false], 'ties go to the earliest arrival');
  });

  it('returns an empty array for no candidates', () => {
    assert.deepStrictEqual(rankCandidates([], 3), []);
  });
});

describe('pickFastestOrigin', () => {
  it('names the origin whose best candidate arrives first', () => {
    assert.strictEqual(pickFastestOrigin([
      { origin: 'A', candidates: [candidate('2026-10-06T21:40:00+09:00', 1)] },
      { origin: 'B', candidates: [] },
      { origin: 'C', candidates: [candidate('2026-10-06T21:24:00+09:00', 2)] },
    ]), 'C');
  });

  it('returns null when no origin has candidates', () => {
    assert.strictEqual(pickFastestOrigin([{ origin: 'A', candidates: [] }, { origin: 'B', candidates: [] }]), null);
  });
});

describe('toJstIso', () => {
  it('formats an instant with the +09:00 offset', () => {
    assert.strictEqual(toJstIso(Date.parse('2026-10-06T15:30:00Z')), '2026-10-07T00:30:00+09:00');
  });
});
