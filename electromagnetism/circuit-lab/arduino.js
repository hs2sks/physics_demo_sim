/* 아두이노 스케치 번역기·실행기 (회로 실험실용, DOM 없음 — node로 시험 가능)
 * - 아두이노 C++ 스케치(setup/loop)를 JS 제너레이터로 옮겨 가상 시계(µs) 위에서 돌린다.
 * - delay()는 가상 시간을 기다리고, 핀 입출력·시리얼·서보·tone은 host 콜백으로 회로 엔진과 이어진다.
 * - 지원하는 것은 교실 수준의 C++ 부분집합: 변수·배열·함수·if/for/while/switch, 흔한 아두이노 함수, Servo.
 *   지원하지 않는 것: 클래스·포인터·구조체·#define 매크로 함수·2차원 배열·String 메서드. */
(function (root) {
  'use strict';

  const TYPE = '(?:int|long|short|byte|float|double|bool|boolean|char|word|size_t|uint8_t|uint16_t|uint32_t|uint64_t|int8_t|int16_t|int32_t|int64_t|String)';
  const QUAL = '(?:(?:const|static|volatile|unsigned|signed|inline)\\s+)*';
  const INTLIKE = new Set(['int', 'long', 'short', 'byte', 'word', 'size_t', 'uint8_t', 'uint16_t', 'uint32_t', 'uint64_t', 'int8_t', 'int16_t', 'int32_t', 'int64_t']);
  const BUILTIN_DELAY = ['delay', 'delayMicroseconds'];

  /* 문자열·주석을 먼저 떼어 놓아 이후 정규식이 건드리지 못하게 한다 (줄 수는 유지) */
  function protect(src) {
    const strs = []; let out = '', i = 0;
    while (i < src.length) {
      const c = src[i], d = src[i + 1];
      if (c === '/' && d === '/') { while (i < src.length && src[i] !== '\n') i++; }
      else if (c === '/' && d === '*') { i += 2; while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] === '\n') out += '\n'; i++; } i += 2; out += ' '; }
      else if (c === '"' || c === "'") {
        let j = i + 1; while (j < src.length && src[j] !== c && src[j] !== '\n') { if (src[j] === '\\') j++; j++; }
        strs.push(src.slice(i, j + 1)); out += '\u0001' + (strs.length - 1) + '\u0002'; i = j + 1;
      } else { out += c; i++; }
    }
    return { text: out, strs };
  }
  const restore = (t, strs) => t.replace(/\u0001(\d+)\u0002/g, (_, k) => {
    const s = strs[+k];
    return s[0] === "'" ? JSON.stringify(unescapeC(s.slice(1, -1))) : s;      // 'a' → "a"
  });
  const unescapeC = s => s.replace(/\\(n|t|r|0|\\|'|")/g, (_, c) => ({ n: '\n', t: '\t', r: '\r', 0: '\0' }[c] || c));

  /* s[open]에 있는 '('의 짝이 되는 ')' 위치 */
  function matchParen(s, open) {
    let d = 0;
    for (let i = open; i < s.length; i++) { if (s[i] === '(') d++; else if (s[i] === ')') { d--; if (d === 0) return i; } }
    return -1;
  }
  /* 식의 끝(괄호 깊이 0에서 ; 또는 ,)을 찾는다 */
  function exprEnd(s, i) {
    let d = 0;
    for (; i < s.length; i++) {
      const c = s[i];
      if (c === '(' || c === '[' || c === '{') d++;
      else if (c === ')' || c === ']' || c === '}') { if (d === 0) return i; d--; }
      else if (d === 0 && (c === ';' || c === ',')) return i;
    }
    return i;
  }
  /* name( … ) 호출을 pre + name( … ) + post 로 감싼다. skip(prevIndex)이 true면 건너뛴다 */
  function wrapCalls(s, name, pre, post, newName) {
    const re = new RegExp('\\b' + name + '\\s*\\(', 'g'); let out = '', last = 0, m;
    while ((m = re.exec(s))) {
      if (/function\*?\s*$/.test(s.slice(Math.max(0, m.index - 12), m.index))) continue;     // 함수 정의 자리
      if (/[.\w$]\s*$/.test(s.slice(Math.max(0, m.index - 2), m.index)) && /\.\s*$/.test(s.slice(Math.max(0, m.index - 3), m.index))) continue;   // obj.name(
      const open = m.index + m[0].length - 1, close = matchParen(s, open); if (close < 0) continue;
      out += s.slice(last, m.index) + pre + (newName || name) + s.slice(open, close + 1) + post; last = close + 1; re.lastIndex = close + 1;
    }
    return out + s.slice(last);
  }

  function translate(src) {
    const P = protect(src); let t = P.text;
    const lines = src.split('\n').length;
    t = t.replace(/^[ \t]*#\s*include[^\n]*/gm, '');
    t = t.replace(/^[ \t]*#\s*define[ \t]+(\w+)\([^\n]*/gm, (_, n) => { throw new Error('#define 매크로 함수(' + n + ')는 지원하지 않아요. 함수나 const 변수로 바꿔 주세요.'); });
    t = t.replace(/^[ \t]*#\s*define[ \t]+(\w+)[ \t]+([^\n]*)/gm, (_, n, v) => 'let ' + n + ' = ' + v + ';');
    t = t.replace(/^[ \t]*#[^\n]*/gm, '');

    // 함수 정의: 반환형 이름(매개변수) {  →  function* 이름(매개변수) {
    const fns = [];
    t = t.replace(new RegExp('(^|[;}\\s])' + QUAL + '(?:void|' + TYPE + '(?:\\s+long)?)\\s*[*&]?\\s*(\\w+)\\s*\\(([^()]*)\\)\\s*\\{', 'g'), (m, pre, name, params) => {
      fns.push(name);
      const ps = params.trim() === '' || params.trim() === 'void' ? '' : params.split(',').map(p => {
        const def = p.split('='); const decl = def[0].replace(/\[[^\]]*\]/g, '').replace(/[*&]/g, ' ').trim().split(/\s+/);
        return decl[decl.length - 1] + (def.length > 1 ? ' =' + def.slice(1).join('=') : '');
      }).join(', ');
      return pre + 'function* ' + name + '(' + ps + ') {';
    });

    // Servo 객체
    t = t.replace(/\bServo\s+(\w+(?:\s*,\s*\w+)*)\s*;/g, (_, names) => 'let ' + names.split(',').map(n => n.trim() + ' = new Servo()').join(', ') + ';');

    // 변수 선언 → let (정수형 이름은 기록해 두었다가 나눗셈 결과를 버림한다)
    const ints = new Set();
    t = t.replace(new RegExp('\\b' + QUAL + '(' + TYPE + ')(?:\\s+(?:long|int))?\\b(?:[\\s*&]+)(\\w+)(?=\\s*[=;,\\[)])', 'g'), (m, ty, name, off, all) => {
      if (INTLIKE.has(ty) || /\bunsigned\b/.test(m) && ty !== 'float' && ty !== 'double') ints.add(name);
      return 'let ' + name;
    });
    // 같은 줄의 쉼표 선언(int a = 1, b = 2;)의 두 번째 이름은 let이 한 번이라 정수 목록에 따로 넣는다
    t = t.replace(/\blet\s+(\w+)\s*=([^;(){}]*?),\s*(\w+)\s*=/g, (m, a, x, b) => { if (ints.has(a)) ints.add(b); return m; });
    // 배열
    t = t.replace(/\blet\s+(\w+)\s*\[[^\]]*\]\s*=\s*\{([^}]*)\}/g, 'let $1 = [$2]');
    t = t.replace(/\blet\s+(\w+)\s*\[([^\]]+)\]\s*;/g, 'let $1 = new Array($2).fill(0);');
    // (int) 형변환은 소수점 버림, (float) 형변환은 없애도 같다
    t = t.replace(/\((?:float|double)\)\s*/g, '');
    t = t.replace(/\((?:unsigned\s+)?(?:int|long|short|byte|word|uint\d+_t|int\d+_t)\)\s*(\w+(?:\.\w+)*(?:\([^()]*\))?|\([^()]*\))/g, '__i($1)');

    // 정수 변수에 대입하는 식에 나눗셈이 있으면 소수점을 버린다 (int x = a / 2; 처럼)
    ints.forEach(n => {
      const re = new RegExp('(\\blet\\s+|[;{}]\\s*|^\\s*)(' + n + ')\\s*=(?!=)', 'gm'); let out = '', last = 0, m;
      while ((m = re.exec(t))) {
        const s0 = m.index + m[0].length, e0 = exprEnd(t, s0), ex = t.slice(s0, e0);
        if (!/\//.test(ex)) continue;
        out += t.slice(last, s0) + ' __i(' + ex + ')'; last = e0; re.lastIndex = e0;
      }
      t = out + t.slice(last);
    });

    // 반복문 안에 가상 시계를 한 칸 넘기는 지점을 넣는다 (delay 없는 무한 반복이 멈추지 않도록)
    { const re = /\b(while|for)\s*\(/g; let out = '', last = 0, m;
      while ((m = re.exec(t))) {
        const open = m.index + m[0].length - 1, close = matchParen(t, open); if (close < 0) continue;
        let k = close + 1; while (/\s/.test(t[k] || '')) k++;
        if (t[k] === '{') { out += t.slice(last, k + 1) + ' yield 0;'; last = k + 1; }
        else if (t[k] === ';' && m[1] === 'while') {
          const before = t.slice(0, m.index).replace(/\s+$/, '');
          if (before.endsWith('}')) continue;            // do { } while (조건);
          out += t.slice(last, k) + '{ yield 0; }'; last = k + 1;
        }
        re.lastIndex = close + 1;
      }
      t = out + t.slice(last);
      t = t.replace(/\bdo\s*\{/g, 'do { yield 0;');
    }

    // 사용자 함수 호출은 yield*, delay는 yield
    fns.forEach(f => { t = wrapCalls(t, f, '(yield* ', ')'); });
    BUILTIN_DELAY.forEach(f => { t = wrapCalls(t, f, '(yield ', ')', f === 'delay' ? '__ms' : '__us'); });

    t = restore(t, P.strs);
    return { code: t, fns, lines };
  }

  /* ---- 실행기 ---- */
  const API_NAMES = ['pinMode', 'digitalWrite', 'digitalRead', 'analogRead', 'analogWrite', 'analogReference', 'millis', 'micros', 'map', 'constrain', 'min', 'max', 'abs', 'sq', 'sqrt', 'pow', 'sin', 'cos', 'tan', 'atan', 'atan2', 'exp', 'log', 'floor', 'ceil', 'round', 'radians', 'degrees', 'random', 'randomSeed', 'tone', 'noTone', 'pulseIn', 'Serial', 'Servo', 'sizeof', 'bitRead', 'bitWrite', 'lowByte', 'highByte', 'isnan', 'cli', 'sei', '__i', '__ms', '__us'];
  const CONSTS = { HIGH: 1, LOW: 0, INPUT: 0, OUTPUT: 1, INPUT_PULLUP: 2, LED_BUILTIN: 13, A0: 14, A1: 15, A2: 16, A3: 17, A4: 18, A5: 19, PI: Math.PI, HALF_PI: Math.PI / 2, TWO_PI: Math.PI * 2, DEC: 10, HEX: 16, OCT: 8, BIN: 2, true: true, false: false, NULL: 0, LSBFIRST: 0, MSBFIRST: 1 };
  const COST = { digital: 4, analog: 112, other: 2 };

  function compile(src) {
    let tr;
    try { tr = translate(src); } catch (e) { return { ok: false, error: e.message }; }
    if (!/\bsetup\s*\(/.test(tr.code) && !/\bloop\s*\(/.test(tr.code)) return { ok: false, error: 'setup() 또는 loop() 함수가 없어요. 스케치는 void setup() { … } 와 void loop() { … } 로 이루어져요.' };
    if (!tr.fns.includes('loop')) return { ok: false, error: 'void loop() { … } 함수가 없어요.' };
    let factory;
    const names = API_NAMES.concat(Object.keys(CONSTS)).filter(n => n !== 'true' && n !== 'false');
    try {
      factory = new Function('__api', '"use strict"; const {' + names.join(',') + '} = __api; return (function(){\n' + tr.code + '\n;return { setup: typeof setup === "function" ? setup : null, loop: loop }; })();');
    } catch (e) { return { ok: false, error: '코드를 읽지 못했어요 — ' + syntaxHint(e.message) }; }
    return { ok: true, js: tr.code, create: io => new Runner(factory, io) };
  }

  function syntaxHint(m) {
    if (/missing \) after argument list/.test(m)) return '함수 괄호 안에서 쉼표(,)나 닫는 괄호 )가 빠진 곳이 있어요. 예: digitalWrite(13, HIGH)';
    if (/Unexpected end of input|missing \} after/.test(m)) return '중괄호 { } 의 짝이 맞지 않아요. 여는 { 와 닫는 } 의 개수를 확인하세요.';
    if (/Unexpected token '\}'/.test(m)) return '필요 없는 닫는 중괄호 } 가 있거나, 앞 문장이 끝나지 않았어요.';
    if (/Unexpected identifier/.test(m)) return '앞 줄 끝에 세미콜론(;)이나 쉼표가 빠졌거나, 지원하지 않는 문법이에요. (' + m + ')';
    if (/Unexpected token/.test(m)) return '예상하지 못한 글자가 있어요. 괄호·따옴표·세미콜론을 확인하세요. (' + m + ')';
    if (/Invalid or unexpected token/.test(m)) return '알 수 없는 글자가 있어요. 따옴표 짝을 확인하세요.';
    return m + ' (괄호 {} () 짝, 세미콜론, 오타를 확인하세요)';
  }
  function friendly(e) {
    const m = String(e && e.message || e);
    let r;
    if ((r = /^(\w+) is not defined/.exec(m))) return "'" + r[1] + "'은(는) 정의되지 않았어요. 철자를 확인하거나 변수를 먼저 선언하세요.";
    if ((r = /^(?:Assignment to constant|Cannot assign)/.exec(m))) return '상수는 값을 바꿀 수 없어요: ' + m;
    if ((r = /(\w+) is not a function/.exec(m)) && /^\d/.test(r[1])) return '앞 줄 끝에 세미콜론(;)이 빠진 곳이 있어요. (예: int x = 3; )';
    if ((r = /(\w+) is not a function/.exec(m))) return "'" + r[1] + "'은(는) 함수가 아니거나 지원하지 않는 함수예요.";
    if (/Cannot read properties of (undefined|null)/.test(m)) return '배열 칸 번호가 범위를 벗어났거나 선언되지 않은 값을 썼어요.';
    return m;
  }

  function Runner(factory, io) {
    const self = this;
    this.io = io; this.clock = 0; this.error = null; this.dead = false; this.out = [];
    let seed = 12345;
    const rnd = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0; return seed / 4294967296; };
    const cost = us => { self.clock += us; };
    const isInt = v => Number.isInteger(v);
    const fmtNum = (v, a) => {
      if (typeof v === 'boolean') return v ? '1' : '0';
      if (typeof v !== 'number') return String(v);
      if (isInt(v)) return (a === 2 || a === 8 || a === 16) ? (v >>> 0).toString(a).toUpperCase() : String(v);
      if (!isFinite(v)) return isNaN(v) ? 'nan' : (v > 0 ? 'inf' : '-inf');
      return v.toFixed(a >= 0 && a <= 8 && a !== undefined ? a : 2);
    };
    const serialWrite = s => { cost(60); io.serial && io.serial(s); };
    const Serial = {
      begin() { }, end() { }, flush() { }, setTimeout() { },
      print(v, a) { serialWrite(fmtNum(v, a)); }, println(v, a) { serialWrite(v === undefined ? '\n' : fmtNum(v, a) + '\n'); },
      write(v) { serialWrite(typeof v === 'number' ? String.fromCharCode(v) : String(v)); },
      available() { return io.serialAvail ? io.serialAvail() : 0; }, read() { return io.serialRead ? io.serialRead() : -1; },
      parseInt() { const s = io.serialLine ? io.serialLine() : ''; return parseInt(s, 10) || 0; }, readString() { return io.serialLine ? io.serialLine() : ''; }, readStringUntil() { return io.serialLine ? io.serialLine() : ''; }
    };
    function Servo() { this.pin = -1; this.ang = 0; }
    Servo.prototype.attach = function (pin) { this.pin = pin; cost(5); io.servoAttach && io.servoAttach(pin); return 1; };
    Servo.prototype.detach = function () { io.servoDetach && io.servoDetach(this.pin); this.pin = -1; };
    Servo.prototype.write = function (a) { a = Math.max(0, Math.min(180, +a || 0)); this.ang = a; cost(5); if (this.pin < 0) io.warn && io.warn('servo.attach(핀)을 하기 전에 write()를 불렀어요.'); else io.servoWrite && io.servoWrite(this.pin, a); };
    Servo.prototype.writeMicroseconds = function (us) { this.write((us - 544) * 180 / (2400 - 544)); };
    Servo.prototype.read = function () { return Math.round(this.ang); };
    Servo.prototype.attached = function () { return this.pin >= 0; };

    const api = Object.assign({}, CONSTS, {
      pinMode(p, m) { cost(COST.other); io.pinMode(p | 0, m | 0); },
      digitalWrite(p, v) { cost(COST.digital); io.digitalWrite(p | 0, v ? 1 : 0); },
      digitalRead(p) { cost(COST.digital); return io.digitalRead(p | 0) ? 1 : 0; },
      analogRead(p) { cost(COST.analog); p |= 0; if (p >= 14) p -= 14; return Math.max(0, Math.min(1023, Math.round(io.analogRead(p)))); },
      analogWrite(p, v) { cost(COST.digital); io.analogWrite(p | 0, Math.max(0, Math.min(255, Math.round(+v || 0)))); },
      analogReference() { },
      millis() { return Math.floor(self.clock / 1000); }, micros() { return Math.floor(self.clock); },
      map(x, a, b, c, d) { const q = (x - a) * (d - c) / (b - a); return ([x, a, b, c, d].every(isInt) ? Math.trunc(q) : q) + c; },
      constrain: (x, a, b) => x < a ? a : x > b ? b : x, min: Math.min, max: Math.max, abs: Math.abs, sq: x => x * x, sqrt: Math.sqrt, pow: Math.pow,
      sin: Math.sin, cos: Math.cos, tan: Math.tan, atan: Math.atan, atan2: Math.atan2, exp: Math.exp, log: Math.log, floor: Math.floor, ceil: Math.ceil, round: Math.round,
      radians: d => d * Math.PI / 180, degrees: r => r * 180 / Math.PI, isnan: isNaN, cli() { }, sei() { },
      random(a, b) { if (b === undefined) { b = a; a = 0; } return b <= a ? a : a + Math.floor(rnd() * (b - a)); }, randomSeed(s) { seed = (s >>> 0) || 1; },
      tone(p, f, d) { cost(COST.other); io.tone && io.tone(p | 0, +f, d ? d * 1000 : 0, self.clock); }, noTone(p) { cost(COST.other); io.noTone && io.noTone(p | 0); },
      pulseIn(p, lvl, timeout) {
        const us = io.pulseIn ? io.pulseIn(p | 0, lvl ? 1 : 0) : 0, lim = timeout === undefined ? 1e6 : timeout;
        if (us <= 0 || us > lim) { cost(Math.min(lim, 1e6)); return 0; } cost(us + 20); return Math.round(us);
      },
      Serial, Servo, sizeof: x => Array.isArray(x) ? x.length : 1,
      bitRead: (v, b) => (v >> b) & 1, bitWrite: (v, b, x) => x ? (v | (1 << b)) : (v & ~(1 << b)), lowByte: v => v & 255, highByte: v => (v >> 8) & 255,
      __i: v => Math.trunc(v), __ms: v => Math.max(0, +v || 0) * 1000, __us: v => Math.max(0, +v || 0)
    });
    // 숫자가 아닌 true/false 상수는 JS 예약어라 구조분해에서 뺀다
    delete api.true; delete api.false;
    let prog;
    try { prog = factory(api); } catch (e) { this.error = friendly(e); this.dead = true; return; }
    this.gen = (function* () {
      if (prog.setup) yield* prog.setup();
      for (; ;) { yield* prog.loop(); yield 0; }
    })();
  }
  /* 가상 시각 T(µs)까지 프로그램을 진행한다 */
  Runner.prototype.advance = function (T) {
    if (this.dead) return;
    let guard = 0;
    try {
      while (this.clock <= T && guard++ < 40000) {
        const r = this.gen.next();
        if (r.done) { this.dead = true; return; }
        this.clock += r.value > 0 ? r.value : 1;
      }
    } catch (e) { this.error = friendly(e); this.dead = true; }
  };

  const api = { compile, translate };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ArduinoSketch = api;
})(typeof window !== 'undefined' ? window : globalThis);
