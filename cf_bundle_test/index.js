var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// ../core/room-core.mjs
var ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
var CODE_LEN = 6;
var ROOM_TTL = 86400;
var MAX_HIDE = 8;
var SEEK_MAX = 1800;
var ID_RE = /^[a-zA-Z0-9_]{1,48}$/;
var SLOT_RE = /^[a-zA-Z0-9_:]{1,48}$/;
var ROOMS_PREFIX = "room:";
function memoryStore() {
  const mem = /* @__PURE__ */ new Map();
  const sweep = /* @__PURE__ */ __name(() => {
    const cut = Date.now() - ROOM_TTL * 1e3;
    for (const [k, v] of mem) if ((v.createdAt || 0) < cut) mem.delete(k);
  }, "sweep");
  return {
    kind: "memory",
    async get(key) {
      sweep();
      return mem.get(key) || null;
    },
    async set(key, val) {
      sweep();
      mem.set(key, val);
    }
  };
}
__name(memoryStore, "memoryStore");
async function resolveStore(store, fallback) {
  try {
    await store.get(`${ROOMS_PREFIX}__probe`);
    return store;
  } catch (e) {
    if (fallback) return fallback;
    throw e;
  }
}
__name(resolveStore, "resolveStore");
var json = /* @__PURE__ */ __name((obj, status = 200) => new Response(JSON.stringify(obj), {
  status,
  headers: { "content-type": "application/json", "cache-control": "no-store" }
}), "json");
var createLog = /* @__PURE__ */ new Map();
function rateLimited(ip) {
  const now = Date.now();
  const arr = (createLog.get(ip) || []).filter((t) => now - t < 36e5);
  arr.push(now);
  createLog.set(ip, arr);
  if (createLog.size > 5e3) createLog.clear();
  return arr.length > 20;
}
__name(rateLimited, "rateLimited");
function validHides(hides) {
  if (!Array.isArray(hides) || hides.length < 1 || hides.length > MAX_HIDE) return false;
  const seen = /* @__PURE__ */ new Set();
  for (const h of hides) {
    if (!h || typeof h !== "object") return false;
    if (!ID_RE.test(h.pieceId) || !SLOT_RE.test(h.slotKey) || !ID_RE.test(h.itemId)) return false;
    const key = `${h.pieceId}:${h.slotKey}`;
    if (seen.has(key)) return false;
    seen.add(key);
  }
  return true;
}
__name(validHides, "validHides");
function genCode() {
  let s = "";
  for (let i = 0; i < CODE_LEN; i++) {
    const a = new Uint32Array(1);
    globalThis.crypto.getRandomValues(a);
    s += ALPHABET[a[0] % ALPHABET.length];
  }
  return s;
}
__name(genCode, "genCode");
async function roomHandler(req, { ip = "0.0.0.0", store, fallback = null } = {}) {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_json" }, 400);
  }
  let st;
  try {
    st = await resolveStore(store, fallback);
  } catch (e) {
    return json({ error: "storage_unavailable", detail: String(e && e.message || e) }, 500);
  }
  const { action, code } = body || {};
  if (action === "create") {
    if (rateLimited(ip)) return json({ error: "rate_limited" }, 429);
    const { hides, seekTime } = body;
    if (!validHides(hides)) return json({ error: "bad_hides" }, 400);
    const dur = Number(seekTime);
    if (!Number.isInteger(dur) || dur < 0 || dur > SEEK_MAX) return json({ error: "bad_seek_time" }, 400);
    let codeNew = null;
    for (let i = 0; i < 5; i++) {
      const c = genCode();
      if (!await st.get(`${ROOMS_PREFIX}${c}`)) {
        codeNew = c;
        break;
      }
    }
    if (!codeNew) return json({ error: "code_exhausted" }, 500);
    const room = {
      code: codeNew,
      state: "hidden",
      // hidden → seeking → done
      hides,
      // 藏点真相，只在 done 后随结算下发
      seekTime: dur,
      deadline: null,
      foundKeys: [],
      createdAt: Date.now()
    };
    await st.set(`${ROOMS_PREFIX}${codeNew}`, room);
    return json({ code: codeNew });
  }
  if (action === "start_seek") {
    const room = await st.get(`${ROOMS_PREFIX}${code}`);
    if (!room) return json({ error: "room_not_found" }, 404);
    if (room.state !== "hidden") return json({ error: "bad_state" }, 409);
    room.state = "seeking";
    room.deadline = room.seekTime > 0 ? Date.now() + room.seekTime * 1e3 : null;
    await st.set(`${ROOMS_PREFIX}${code}`, room);
    return json({ state: "seeking", deadline: room.deadline, seekTime: room.seekTime, total: room.hides.length });
  }
  if (action === "check") {
    const room = await st.get(`${ROOMS_PREFIX}${code}`);
    if (!room) return json({ error: "room_not_found" }, 404);
    if (room.state === "hidden") return json({ error: "not_started" }, 409);
    if (room.state !== "seeking") return json({ state: "done", expired: true });
    if (room.deadline && Date.now() > room.deadline) {
      room.state = "done";
      room.reason = "timeout";
      await st.set(`${ROOMS_PREFIX}${code}`, room);
      return json({ expired: true, state: "done" });
    }
    const pieceId = String(body.pieceId || "");
    const slotKey = String(body.slotKey || "");
    if (!ID_RE.test(pieceId) || !SLOT_RE.test(slotKey)) return json({ error: "bad_slot" }, 400);
    const key = `${pieceId}:${slotKey}`;
    if (room.foundKeys.includes(key)) return json({ hit: false, already: true });
    const hit = room.hides.find((h) => h.pieceId === pieceId && h.slotKey === slotKey);
    if (!hit) return json({ hit: false });
    room.foundKeys.push(key);
    const done = room.foundKeys.length >= room.hides.length;
    if (done) {
      room.state = "done";
      room.reason = "all_found";
    }
    await st.set(`${ROOMS_PREFIX}${code}`, room);
    return json({ hit: true, itemId: hit.itemId, done });
  }
  if (action === "status") {
    const room = await st.get(`${ROOMS_PREFIX}${code}`);
    if (!room) return json({ error: "room_not_found" }, 404);
    if (room.state === "seeking" && room.deadline && Date.now() > room.deadline) {
      room.state = "done";
      room.reason = "timeout";
      await st.set(`${ROOMS_PREFIX}${code}`, room);
    }
    const base = {
      state: room.state,
      total: room.hides.length,
      foundCount: room.foundKeys.length,
      seekTime: room.seekTime
    };
    if (room.state === "seeking") {
      return json({ ...base, deadline: room.deadline, now: Date.now() });
    }
    if (room.state === "hidden") return json(base);
    return json({
      ...base,
      reason: room.reason || "all_found",
      hides: room.hides,
      foundKeys: room.foundKeys
    });
  }
  return json({ error: "unknown_action" }, 400);
}
__name(roomHandler, "roomHandler");

// api/room.js
function kvStore(env) {
  return {
    kind: "kv",
    async get(key) {
      return env.ROOMS.get(key, "json");
    },
    async set(key, val) {
      await env.ROOMS.put(key, JSON.stringify(val), { expirationTtl: 86400 });
    }
  };
}
__name(kvStore, "kvStore");
var jresp = /* @__PURE__ */ __name((obj, status = 200) => new Response(JSON.stringify(obj), {
  status,
  headers: { "content-type": "application/json", "cache-control": "no-store" }
}), "jresp");
async function onRequestPost({ request, env }) {
  if (!env.ROOMS) {
    return jresp({ error: "storage_unconfigured" }, 500);
  }
  const ip = request.headers.get("cf-connecting-ip") || "0.0.0.0";
  return roomHandler(request, {
    ip,
    store: kvStore(env),
    fallback: memoryStore()
    // KV 读探测失败时降级（每请求粒度）
  });
}
__name(onRequestPost, "onRequestPost");

// ../.wrangler/tmp/pages-RJ8AQa/functionsRoutes-0.41927707023653427.mjs
var routes = [
  {
    routePath: "/api/room",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost]
  }
];

// C:/Users/Qi/AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/path-to-regexp/dist.es2015/index.js
function lexer(str) {
  var tokens = [];
  var i = 0;
  while (i < str.length) {
    var char = str[i];
    if (char === "*" || char === "+" || char === "?") {
      tokens.push({ type: "MODIFIER", index: i, value: str[i++] });
      continue;
    }
    if (char === "\\") {
      tokens.push({ type: "ESCAPED_CHAR", index: i++, value: str[i++] });
      continue;
    }
    if (char === "{") {
      tokens.push({ type: "OPEN", index: i, value: str[i++] });
      continue;
    }
    if (char === "}") {
      tokens.push({ type: "CLOSE", index: i, value: str[i++] });
      continue;
    }
    if (char === ":") {
      var name = "";
      var j = i + 1;
      while (j < str.length) {
        var code = str.charCodeAt(j);
        if (
          // `0-9`
          code >= 48 && code <= 57 || // `A-Z`
          code >= 65 && code <= 90 || // `a-z`
          code >= 97 && code <= 122 || // `_`
          code === 95
        ) {
          name += str[j++];
          continue;
        }
        break;
      }
      if (!name)
        throw new TypeError("Missing parameter name at ".concat(i));
      tokens.push({ type: "NAME", index: i, value: name });
      i = j;
      continue;
    }
    if (char === "(") {
      var count = 1;
      var pattern = "";
      var j = i + 1;
      if (str[j] === "?") {
        throw new TypeError('Pattern cannot start with "?" at '.concat(j));
      }
      while (j < str.length) {
        if (str[j] === "\\") {
          pattern += str[j++] + str[j++];
          continue;
        }
        if (str[j] === ")") {
          count--;
          if (count === 0) {
            j++;
            break;
          }
        } else if (str[j] === "(") {
          count++;
          if (str[j + 1] !== "?") {
            throw new TypeError("Capturing groups are not allowed at ".concat(j));
          }
        }
        pattern += str[j++];
      }
      if (count)
        throw new TypeError("Unbalanced pattern at ".concat(i));
      if (!pattern)
        throw new TypeError("Missing pattern at ".concat(i));
      tokens.push({ type: "PATTERN", index: i, value: pattern });
      i = j;
      continue;
    }
    tokens.push({ type: "CHAR", index: i, value: str[i++] });
  }
  tokens.push({ type: "END", index: i, value: "" });
  return tokens;
}
__name(lexer, "lexer");
function parse(str, options) {
  if (options === void 0) {
    options = {};
  }
  var tokens = lexer(str);
  var _a = options.prefixes, prefixes = _a === void 0 ? "./" : _a, _b = options.delimiter, delimiter = _b === void 0 ? "/#?" : _b;
  var result = [];
  var key = 0;
  var i = 0;
  var path = "";
  var tryConsume = /* @__PURE__ */ __name(function(type) {
    if (i < tokens.length && tokens[i].type === type)
      return tokens[i++].value;
  }, "tryConsume");
  var mustConsume = /* @__PURE__ */ __name(function(type) {
    var value2 = tryConsume(type);
    if (value2 !== void 0)
      return value2;
    var _a2 = tokens[i], nextType = _a2.type, index = _a2.index;
    throw new TypeError("Unexpected ".concat(nextType, " at ").concat(index, ", expected ").concat(type));
  }, "mustConsume");
  var consumeText = /* @__PURE__ */ __name(function() {
    var result2 = "";
    var value2;
    while (value2 = tryConsume("CHAR") || tryConsume("ESCAPED_CHAR")) {
      result2 += value2;
    }
    return result2;
  }, "consumeText");
  var isSafe = /* @__PURE__ */ __name(function(value2) {
    for (var _i = 0, delimiter_1 = delimiter; _i < delimiter_1.length; _i++) {
      var char2 = delimiter_1[_i];
      if (value2.indexOf(char2) > -1)
        return true;
    }
    return false;
  }, "isSafe");
  var safePattern = /* @__PURE__ */ __name(function(prefix2) {
    var prev = result[result.length - 1];
    var prevText = prefix2 || (prev && typeof prev === "string" ? prev : "");
    if (prev && !prevText) {
      throw new TypeError('Must have text between two parameters, missing text after "'.concat(prev.name, '"'));
    }
    if (!prevText || isSafe(prevText))
      return "[^".concat(escapeString(delimiter), "]+?");
    return "(?:(?!".concat(escapeString(prevText), ")[^").concat(escapeString(delimiter), "])+?");
  }, "safePattern");
  while (i < tokens.length) {
    var char = tryConsume("CHAR");
    var name = tryConsume("NAME");
    var pattern = tryConsume("PATTERN");
    if (name || pattern) {
      var prefix = char || "";
      if (prefixes.indexOf(prefix) === -1) {
        path += prefix;
        prefix = "";
      }
      if (path) {
        result.push(path);
        path = "";
      }
      result.push({
        name: name || key++,
        prefix,
        suffix: "",
        pattern: pattern || safePattern(prefix),
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    var value = char || tryConsume("ESCAPED_CHAR");
    if (value) {
      path += value;
      continue;
    }
    if (path) {
      result.push(path);
      path = "";
    }
    var open = tryConsume("OPEN");
    if (open) {
      var prefix = consumeText();
      var name_1 = tryConsume("NAME") || "";
      var pattern_1 = tryConsume("PATTERN") || "";
      var suffix = consumeText();
      mustConsume("CLOSE");
      result.push({
        name: name_1 || (pattern_1 ? key++ : ""),
        pattern: name_1 && !pattern_1 ? safePattern(prefix) : pattern_1,
        prefix,
        suffix,
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    mustConsume("END");
  }
  return result;
}
__name(parse, "parse");
function match(str, options) {
  var keys = [];
  var re = pathToRegexp(str, keys, options);
  return regexpToFunction(re, keys, options);
}
__name(match, "match");
function regexpToFunction(re, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.decode, decode = _a === void 0 ? function(x) {
    return x;
  } : _a;
  return function(pathname) {
    var m = re.exec(pathname);
    if (!m)
      return false;
    var path = m[0], index = m.index;
    var params = /* @__PURE__ */ Object.create(null);
    var _loop_1 = /* @__PURE__ */ __name(function(i2) {
      if (m[i2] === void 0)
        return "continue";
      var key = keys[i2 - 1];
      if (key.modifier === "*" || key.modifier === "+") {
        params[key.name] = m[i2].split(key.prefix + key.suffix).map(function(value) {
          return decode(value, key);
        });
      } else {
        params[key.name] = decode(m[i2], key);
      }
    }, "_loop_1");
    for (var i = 1; i < m.length; i++) {
      _loop_1(i);
    }
    return { path, index, params };
  };
}
__name(regexpToFunction, "regexpToFunction");
function escapeString(str) {
  return str.replace(/([.+*?=^!:${}()[\]|/\\])/g, "\\$1");
}
__name(escapeString, "escapeString");
function flags(options) {
  return options && options.sensitive ? "" : "i";
}
__name(flags, "flags");
function regexpToRegexp(path, keys) {
  if (!keys)
    return path;
  var groupsRegex = /\((?:\?<(.*?)>)?(?!\?)/g;
  var index = 0;
  var execResult = groupsRegex.exec(path.source);
  while (execResult) {
    keys.push({
      // Use parenthesized substring match if available, index otherwise
      name: execResult[1] || index++,
      prefix: "",
      suffix: "",
      modifier: "",
      pattern: ""
    });
    execResult = groupsRegex.exec(path.source);
  }
  return path;
}
__name(regexpToRegexp, "regexpToRegexp");
function arrayToRegexp(paths, keys, options) {
  var parts = paths.map(function(path) {
    return pathToRegexp(path, keys, options).source;
  });
  return new RegExp("(?:".concat(parts.join("|"), ")"), flags(options));
}
__name(arrayToRegexp, "arrayToRegexp");
function stringToRegexp(path, keys, options) {
  return tokensToRegexp(parse(path, options), keys, options);
}
__name(stringToRegexp, "stringToRegexp");
function tokensToRegexp(tokens, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.strict, strict = _a === void 0 ? false : _a, _b = options.start, start = _b === void 0 ? true : _b, _c = options.end, end = _c === void 0 ? true : _c, _d = options.encode, encode = _d === void 0 ? function(x) {
    return x;
  } : _d, _e = options.delimiter, delimiter = _e === void 0 ? "/#?" : _e, _f = options.endsWith, endsWith = _f === void 0 ? "" : _f;
  var endsWithRe = "[".concat(escapeString(endsWith), "]|$");
  var delimiterRe = "[".concat(escapeString(delimiter), "]");
  var route = start ? "^" : "";
  for (var _i = 0, tokens_1 = tokens; _i < tokens_1.length; _i++) {
    var token = tokens_1[_i];
    if (typeof token === "string") {
      route += escapeString(encode(token));
    } else {
      var prefix = escapeString(encode(token.prefix));
      var suffix = escapeString(encode(token.suffix));
      if (token.pattern) {
        if (keys)
          keys.push(token);
        if (prefix || suffix) {
          if (token.modifier === "+" || token.modifier === "*") {
            var mod = token.modifier === "*" ? "?" : "";
            route += "(?:".concat(prefix, "((?:").concat(token.pattern, ")(?:").concat(suffix).concat(prefix, "(?:").concat(token.pattern, "))*)").concat(suffix, ")").concat(mod);
          } else {
            route += "(?:".concat(prefix, "(").concat(token.pattern, ")").concat(suffix, ")").concat(token.modifier);
          }
        } else {
          if (token.modifier === "+" || token.modifier === "*") {
            throw new TypeError('Can not repeat "'.concat(token.name, '" without a prefix and suffix'));
          }
          route += "(".concat(token.pattern, ")").concat(token.modifier);
        }
      } else {
        route += "(?:".concat(prefix).concat(suffix, ")").concat(token.modifier);
      }
    }
  }
  if (end) {
    if (!strict)
      route += "".concat(delimiterRe, "?");
    route += !options.endsWith ? "$" : "(?=".concat(endsWithRe, ")");
  } else {
    var endToken = tokens[tokens.length - 1];
    var isEndDelimited = typeof endToken === "string" ? delimiterRe.indexOf(endToken[endToken.length - 1]) > -1 : endToken === void 0;
    if (!strict) {
      route += "(?:".concat(delimiterRe, "(?=").concat(endsWithRe, "))?");
    }
    if (!isEndDelimited) {
      route += "(?=".concat(delimiterRe, "|").concat(endsWithRe, ")");
    }
  }
  return new RegExp(route, flags(options));
}
__name(tokensToRegexp, "tokensToRegexp");
function pathToRegexp(path, keys, options) {
  if (path instanceof RegExp)
    return regexpToRegexp(path, keys);
  if (Array.isArray(path))
    return arrayToRegexp(path, keys, options);
  return stringToRegexp(path, keys, options);
}
__name(pathToRegexp, "pathToRegexp");

// C:/Users/Qi/AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/wrangler/templates/pages-template-worker.ts
var escapeRegex = /[.+?^${}()|[\]\\]/g;
function* executeRequest(request) {
  const requestPath = new URL(request.url).pathname;
  for (const route of [...routes].reverse()) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult) {
      for (const handler of route.middlewares.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: mountMatchResult.path
        };
      }
    }
  }
  for (const route of routes) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: true
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult && route.modules.length) {
      for (const handler of route.modules.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: matchResult.path
        };
      }
      break;
    }
  }
}
__name(executeRequest, "executeRequest");
var pages_template_worker_default = {
  async fetch(originalRequest, env, workerContext) {
    let request = originalRequest;
    const handlerIterator = executeRequest(request);
    let data = {};
    let isFailOpen = false;
    const next = /* @__PURE__ */ __name(async (input, init) => {
      if (input !== void 0) {
        let url = input;
        if (typeof input === "string") {
          url = new URL(input, request.url).toString();
        }
        request = new Request(url, init);
      }
      const result = handlerIterator.next();
      if (result.done === false) {
        const { handler, params, path } = result.value;
        const context = {
          request: new Request(request.clone()),
          functionPath: path,
          next,
          params,
          get data() {
            return data;
          },
          set data(value) {
            if (typeof value !== "object" || value === null) {
              throw new Error("context.data must be an object");
            }
            data = value;
          },
          env,
          waitUntil: workerContext.waitUntil.bind(workerContext),
          passThroughOnException: /* @__PURE__ */ __name(() => {
            isFailOpen = true;
          }, "passThroughOnException")
        };
        const response = await handler(context);
        if (!(response instanceof Response)) {
          throw new Error("Your Pages function should return a Response");
        }
        return cloneResponse(response);
      } else if ("ASSETS") {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      } else {
        const response = await fetch(request);
        return cloneResponse(response);
      }
    }, "next");
    try {
      return await next();
    } catch (error) {
      if (isFailOpen) {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      }
      throw error;
    }
  }
};
var cloneResponse = /* @__PURE__ */ __name((response) => (
  // https://fetch.spec.whatwg.org/#null-body-status
  new Response(
    [101, 204, 205, 304].includes(response.status) ? null : response.body,
    response
  )
), "cloneResponse");
export {
  pages_template_worker_default as default
};
