// Spec shell for the Intl constructors Hermes lacks; data comes from `native.*`. Intrinsics are
// captured up front so built-ins patched later cannot change behaviour (test262 "tainting").
module.exports = function (native, global) {
  'use strict';

  var Intl = global.Intl;
  if (typeof Intl !== 'object' || Intl === null) {
    // Hermes built without Intl.
    Intl = {};
    Object.defineProperty(Intl, Symbol.toStringTag, { value: 'Intl', configurable: true });
    Object.defineProperty(global, 'Intl', { value: Intl, writable: true, configurable: true });
  }

  var ObjectPrototype = Object.prototype;
  var create = Object.create;
  var defineProperty = Object.defineProperty;
  var getOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
  var getOwnPropertyNames = Object.getOwnPropertyNames;
  var reflectConstruct = Reflect.construct;
  var getPrototypeOf = Object.getPrototypeOf;
  var setPrototypeOf = Object.setPrototypeOf;
  var floor = Math.floor;
  var trunc = Math.trunc;
  var isFinite_ = isFinite;
  var toPrimitiveSym = Symbol.toPrimitive;
  var iteratorSym = Symbol.iterator;
  var toObject = Object;
  var trim = Function.prototype.call.bind(String.prototype.trim);
  var DECIMAL = /^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/;
  var execDecimal = RegExp.prototype.exec.bind(DECIMAL);
  var call = Function.prototype.call.bind(Function.prototype.call);
  var charCodeAt = Function.prototype.call.bind(String.prototype.charCodeAt);
  var stringIndexOf = Function.prototype.call.bind(String.prototype.indexOf);
  var slice = Function.prototype.call.bind(String.prototype.slice);
  var split = Function.prototype.call.bind(String.prototype.split);
  var toLowerCase = Function.prototype.call.bind(String.prototype.toLowerCase);
  var join = Function.prototype.call.bind(Array.prototype.join);
  var arraySlice = Function.prototype.call.bind(Array.prototype.slice);
  function tester(re) {
    return RegExp.prototype.test.bind(re);
  }
  // unicode_locale_id productions (UTS 35).
  var isType = tester(/^[a-z0-9]{3,8}(-[a-z0-9]{3,8})*$/i);
  var isLanguage = tester(/^([a-z]{2,3}|[a-z]{5,8})$/i);
  var isScript = tester(/^[a-z]{4}$/i);
  var isRegion = tester(/^([a-z]{2}|[0-9]{3})$/i);
  var isVariant = tester(/^([a-z0-9]{5,8}|[0-9][a-z0-9]{3})$/i);

  var canonicalize = native.canonicalize;
  var lookup = native.lookup;
  var defaultLocale = native.defaultLocale;
  var prNew = native.prNew;
  var prSelect = native.prSelect;
  var prSelectRange = native.prSelectRange;
  var prCategories = native.prCategories;
  var numberingSystemSupported = native.numberingSystemSupported;
  var localeNumberingSystem = native.localeNumberingSystem;
  var localeMaximize = native.localeMaximize;
  var localeMinimize = native.localeMinimize;
  var localeDirection = native.localeDirection;
  var localeWeekInfo = native.localeWeekInfo;
  var regionTimeZones = native.regionTimeZones;

  var CATEGORIES = ['zero', 'one', 'two', 'few', 'many', 'other'];
  var ROUNDING_MODES = ['ceil', 'floor', 'expand', 'trunc', 'halfCeil', 'halfFloor', 'halfExpand', 'halfTrunc', 'halfEven'];
  var NOTATIONS = ['standard', 'scientific', 'engineering', 'compact'];
  var INCREMENTS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000];
  var STYLES = ['long', 'short', 'narrow'];
  // Part kinds, shared with rust/src/parts.rs.
  var PART_TYPES = ['literal', 'integer', 'group', 'decimal', 'fraction', 'element'];

  // Declared up front: Intl.Locale objects are accepted wherever a locale list is.
  var localeSlots = new WeakMap();
  var getLocaleSlots = WeakMap.prototype.get.bind(localeSlots);

  function indexOf(list, v) {
    for (var i = 0; i < list.length; i++) if (list[i] === v) return i;
    return -1;
  }

  // CreateDataProperty that ignores setters planted on Object/Array prototypes.
  function dataProp(o, k, v) {
    var d = create(null);
    d.value = v;
    d.writable = true;
    d.enumerable = true;
    d.configurable = true;
    defineProperty(o, k, d);
  }

  function hidden(o, k, v, writable) {
    var d = create(null);
    d.value = v;
    d.writable = writable;
    d.enumerable = false;
    d.configurable = true;
    defineProperty(o, k, d);
  }

  function append(list, v) {
    dataProp(list, list.length, v);
  }

  function isObject(v) {
    return (typeof v === 'object' && v !== null) || typeof v === 'function';
  }

  function toString(v) {
    if (typeof v === 'symbol') throw new TypeError('Cannot convert a Symbol to a string');
    return '' + (isObject(v) ? toPrimitive(v, 'string') : v);
  }

  function toPrimitive(v, hint) {
    if (!isObject(v)) return v;
    var exotic = v[toPrimitiveSym];
    if (exotic !== undefined && exotic !== null) {
      if (typeof exotic !== 'function') throw new TypeError('Symbol.toPrimitive is not callable');
      var r = call(exotic, v, hint);
      if (isObject(r)) throw new TypeError('Cannot convert object to primitive value');
      return r;
    }
    var order = hint === 'string' ? ['toString', 'valueOf'] : ['valueOf', 'toString'];
    for (var i = 0; i < 2; i++) {
      var f = v[order[i]];
      if (typeof f === 'function') {
        var p = call(f, v);
        if (!isObject(p)) return p;
      }
    }
    throw new TypeError('Cannot convert object to primitive value');
  }

  // ToIntlMathematicalValue: a Number, or a normalized decimal string that keeps full precision.
  function toIntlMV(value) {
    if (typeof value === 'number') return value;
    var p = toPrimitive(value, 'number');
    if (typeof p === 'bigint') return '' + p;
    if (typeof p !== 'string') return +p; // throws for Symbol
    var s = trim(p);
    if (s === '') return 0;
    var m = execDecimal(s);
    if (m !== null && (m[2] !== '' || (m[3] !== undefined && m[3] !== ''))) {
      return (m[1] === '-' ? '-' : '') + (m[2] || '0') + (m[3] ? '.' + m[3] : '') + (m[4] ? 'e' + m[4] : '');
    }
    return +s; // Infinity, 0x…, 0b…, 0o…, or NaN
  }

  function coerceOptionsToObject(options) {
    if (options === undefined) return create(null);
    if (options === null) throw new TypeError('Cannot convert null to object');
    return toObject(options);
  }

  function getOption(options, key, values, fallback) {
    var v = options[key];
    if (v === undefined) return fallback;
    v = toString(v);
    if (indexOf(values, v) < 0) throw new RangeError('Value ' + v + ' out of range for ' + key);
    return v;
  }

  function defaultNumberOption(v, min, max, fallback) {
    if (v === undefined) return fallback;
    v = +v; // throws for Symbol and BigInt, as ToNumber does
    if (!isFinite_(v) || v < min || v > max) throw new RangeError('Value out of range');
    return floor(v);
  }

  function getNumberOption(options, key, min, max, fallback) {
    return defaultNumberOption(options[key], min, max, fallback);
  }

  function canonicalizeLocaleList(locales) {
    var seen = [];
    if (locales === undefined) return seen;
    var O;
    if (typeof locales === 'string' || (isObject(locales) && getLocaleSlots(locales) !== undefined)) {
      O = [locales];
    } else {
      if (locales === null) throw new TypeError('Cannot convert null to object');
      O = toObject(locales);
    }
    var len = trunc(+O.length) || 0;
    if (len < 0) len = 0;
    for (var k = 0; k < len; k++) {
      var key = '' + k;
      if (key in O) {
        var el = O[key];
        if (typeof el !== 'string' && !isObject(el)) {
          throw new TypeError('Language ID should be string or object.');
        }
        var ls = isObject(el) ? getLocaleSlots(el) : undefined;
        var tag = ls !== undefined ? ls.locale : canonicalize(toString(el));
        if (tag === undefined) throw new RangeError('Incorrect locale information provided');
        if (indexOf(seen, tag) < 0) append(seen, tag);
      }
    }
    return seen;
  }

  // The "-u-…" sequence of a canonical tag, or '' (UnicodeExtensionComponents input).
  function unicodeExtension(tag) {
    var subtags = split(tag, '-');
    for (var i = 1; i < subtags.length; i++) {
      if (subtags[i] === 'x') return '';
      if (subtags[i] === 'u') {
        var end = i + 1;
        while (end < subtags.length && subtags[end].length !== 1) end++;
        var ext = [];
        for (var k = i; k < end; k++) append(ext, subtags[k]);
        return '-' + join(ext, '-');
      }
    }
    return '';
  }

  // UnicodeExtensionComponents: { attributes, keywords: [[key, value]…] }, first key wins.
  function extensionComponents(ext) {
    var subtags = split(slice(ext, 3), '-');
    var attributes = [];
    var keywords = [];
    var i = 0;
    for (; i < subtags.length && subtags[i].length !== 2; i++) {
      if (indexOf(attributes, subtags[i]) < 0) append(attributes, subtags[i]);
    }
    while (i < subtags.length) {
      var key = subtags[i++];
      var value = [];
      while (i < subtags.length && subtags[i].length !== 2) append(value, subtags[i++]);
      if (keywordIndex(keywords, key) < 0) append(keywords, [key, join(value, '-')]);
    }
    return { attributes: attributes, keywords: keywords };
  }

  function keywordIndex(keywords, key) {
    for (var i = 0; i < keywords.length; i++) if (keywords[i][0] === key) return i;
    return -1;
  }

  function supportsNu(value) {
    return value !== 'native' && value !== 'traditio' && value !== 'finance' && numberingSystemSupported(value);
  }

  // ResolveLocale, LookupMatchingLocaleByPrefix for both matchers. `withNu` also resolves "nu"
  // (RelativeTimeFormat's only extension key); dataLocale then always carries -u-nu-.
  function resolveLocale(requested, withNu, nuOption) {
    var found = defaultLocale;
    var extension = '';
    for (var i = 0; i < requested.length; i++) {
      var m = lookup(requested[i]);
      if (m !== undefined) {
        found = m;
        extension = unicodeExtension(requested[i]);
        break;
      }
    }
    var result = { locale: found, dataLocale: found, nu: undefined };
    if (!withNu) return result;
    var nu = localeNumberingSystem(found);
    var keyword;
    var keywords = extension !== '' ? extensionComponents(extension).keywords : [];
    var idx = keywordIndex(keywords, 'nu');
    if (idx >= 0 && keywords[idx][1] !== '' && supportsNu(keywords[idx][1])) {
      nu = keywords[idx][1];
      keyword = 'nu-' + nu;
    }
    if (typeof nuOption === 'string') {
      var o = toLowerCase(nuOption);
      if (o !== nu && supportsNu(o)) {
        nu = o;
        keyword = undefined;
      }
    }
    if (keyword !== undefined) result.locale = found + '-u-' + keyword;
    result.dataLocale = found + '-u-nu-' + nu;
    result.nu = nu;
    return result;
  }

  function getOptionsObject(options) {
    if (options === undefined) return create(null);
    if (isObject(options)) return options;
    throw new TypeError('Options must be an object');
  }

  // Decodes rust/src/parts.rs `pack`. Object literals define their own properties directly, so
  // planted setters are never hit.
  function unpackParts(packed, unit) {
    var num = function (at) {
      return charCodeAt(packed, at) * 32768 + charCodeAt(packed, at + 1);
    };
    var n = num(0);
    var offset = 2 + 4 * n;
    var result = [];
    for (var i = 0; i < n; i++) {
      var kind = num(2 + 2 * i);
      var length = num(2 + 2 * n + 2 * i);
      var value = slice(packed, offset, offset + length);
      append(result, unit !== undefined && kind !== 0
        ? { type: PART_TYPES[kind], value: value, unit: unit }
        : { type: PART_TYPES[kind], value: value });
      offset += length;
    }
    return result;
  }

  // A fresh copy of a short list, built without Array.prototype methods or setters.
  function copyList(l) {
    switch (l.length) {
      case 0: return [];
      case 1: return [l[0]];
      case 2: return [l[0], l[1]];
      case 3: return [l[0], l[1], l[2]];
      case 4: return [l[0], l[1], l[2], l[3]];
      case 5: return [l[0], l[1], l[2], l[3], l[4]];
      default: return array(l);
    }
  }

  // The %Intl.X.prototype% fallback of OrdinaryCreateFromConstructor.
  function construct(self, newTarget, ctor, name) {
    if (newTarget === undefined) throw new TypeError('Constructor Intl.' + name + " requires 'new'");
    if (getPrototypeOf(self) === ObjectPrototype && newTarget !== Object) setPrototypeOf(self, ctor.prototype);
  }

  function slotsOf(getSlots, name) {
    return function (obj, method) {
      var s = isObject(obj) ? getSlots(obj) : undefined;
      if (s === undefined) {
        throw new TypeError('Intl.' + name + '.prototype.' + method + ' called on incompatible receiver');
      }
      return s;
    };
  }

  function installConstructor(name, ctor, methods, statics) {
    if (Intl[name] !== undefined) return;
    var proto = ctor.prototype;
    for (var k in methods) hidden(proto, k, methods[k], true);
    defineProperty(proto, Symbol.toStringTag, { value: 'Intl.' + name, configurable: true });
    for (var s in statics) hidden(ctor, s, statics[s], true);
    defineProperty(ctor, 'prototype', { writable: false });
    hidden(Intl, name, ctor, true);
  }

  var supportedLocalesOf = {
    supportedLocalesOf(locales) {
      return supportedLocales(locales, arguments[1]);
    },
  }.supportedLocalesOf;

  function supportedLocales(locales, options) {
    var requested = canonicalizeLocaleList(locales);
    options = coerceOptionsToObject(options);
    getOption(options, 'localeMatcher', ['lookup', 'best fit'], 'best fit');
    var subset = [];
    for (var i = 0; i < requested.length; i++) {
      if (lookup(requested[i]) !== undefined) append(subset, requested[i]);
    }
    return subset;
  }

  // SetNumberFormatDigitOptions.
  function setDigitOptions(s, options, mnfdDefault, mxfdDefault, notation) {
    var mnid = getNumberOption(options, 'minimumIntegerDigits', 1, 21, 1);
    var mnfd = options.minimumFractionDigits;
    var mxfd = options.maximumFractionDigits;
    var mnsd = options.minimumSignificantDigits;
    var mxsd = options.maximumSignificantDigits;
    s.minimumIntegerDigits = mnid;
    var increment = getNumberOption(options, 'roundingIncrement', 1, 5000, 1);
    if (indexOf(INCREMENTS, increment) < 0) throw new RangeError('Invalid roundingIncrement');
    var roundingMode = getOption(options, 'roundingMode', ROUNDING_MODES, 'halfExpand');
    var roundingPriority = getOption(options, 'roundingPriority', ['auto', 'morePrecision', 'lessPrecision'], 'auto');
    var trailingZeroDisplay = getOption(options, 'trailingZeroDisplay', ['auto', 'stripIfInteger'], 'auto');
    if (increment !== 1) mxfdDefault = mnfdDefault;
    s.roundingIncrement = increment;
    s.roundingMode = roundingMode;
    s.trailingZeroDisplay = trailingZeroDisplay;
    var hasSd = mnsd !== undefined || mxsd !== undefined;
    var hasFd = mnfd !== undefined || mxfd !== undefined;
    var needSd = true;
    var needFd = true;
    if (roundingPriority === 'auto') {
      needSd = hasSd;
      if (needSd || (!hasFd && notation === 'compact')) needFd = false;
    }
    if (needSd) {
      if (hasSd) {
        s.minimumSignificantDigits = defaultNumberOption(mnsd, 1, 21, 1);
        s.maximumSignificantDigits = defaultNumberOption(mxsd, s.minimumSignificantDigits, 21, 21);
      } else {
        s.minimumSignificantDigits = 1;
        s.maximumSignificantDigits = 21;
      }
    }
    if (needFd) {
      if (hasFd) {
        mnfd = defaultNumberOption(mnfd, 0, 100, undefined);
        mxfd = defaultNumberOption(mxfd, 0, 100, undefined);
        if (mnfd === undefined) mnfd = mnfdDefault < mxfd ? mnfdDefault : mxfd;
        else if (mxfd === undefined) mxfd = mxfdDefault > mnfd ? mxfdDefault : mnfd;
        else if (mnfd > mxfd) throw new RangeError('minimumFractionDigits is greater than maximumFractionDigits');
        s.minimumFractionDigits = mnfd;
        s.maximumFractionDigits = mxfd;
      } else {
        s.minimumFractionDigits = mnfdDefault;
        s.maximumFractionDigits = mxfdDefault;
      }
    }
    if (!needSd && !needFd) {
      s.minimumFractionDigits = 0;
      s.maximumFractionDigits = 0;
      s.minimumSignificantDigits = 1;
      s.maximumSignificantDigits = 2;
      s.roundingType = 2;
      s.roundingPriority = 'morePrecision';
    } else if (roundingPriority === 'morePrecision') {
      s.roundingType = 2;
      s.roundingPriority = 'morePrecision';
    } else if (roundingPriority === 'lessPrecision') {
      s.roundingType = 3;
      s.roundingPriority = 'lessPrecision';
    } else if (hasSd) {
      s.roundingType = 1;
      s.roundingPriority = 'auto';
    } else {
      s.roundingType = 0;
      s.roundingPriority = 'auto';
    }
    if (increment !== 1) {
      if (s.roundingType !== 0) throw new TypeError('roundingIncrement requires fraction-digits rounding');
      if (s.maximumFractionDigits !== s.minimumFractionDigits) {
        throw new RangeError('roundingIncrement requires maximumFractionDigits = minimumFractionDigits');
      }
    }
  }

  var pluralSlots = new WeakMap();
  var getPluralSlots = WeakMap.prototype.get.bind(pluralSlots);
  var setPluralSlots = WeakMap.prototype.set.bind(pluralSlots);

  var pluralOf = slotsOf(getPluralSlots, 'PluralRules');

  function PluralRules() {
    var self = this;
    construct(self, new.target, PluralRules, 'PluralRules');
    var requested = canonicalizeLocaleList(arguments[0]);
    var options = coerceOptionsToObject(arguments[1]);
    getOption(options, 'localeMatcher', ['lookup', 'best fit'], 'best fit');
    var s = create(null);
    s.locale = resolveLocale(requested).locale;
    s.type = getOption(options, 'type', ['cardinal', 'ordinal'], 'cardinal');
    s.notation = getOption(options, 'notation', NOTATIONS, 'standard');
    var compactDisplay = getOption(options, 'compactDisplay', ['short', 'long'], 'short');
    if (s.notation === 'compact') s.compactDisplay = compactDisplay;
    setDigitOptions(s, options, 0, 3, s.notation);
    s.handle = prNew(
      s.locale,
      s.type === 'ordinal',
      indexOf(NOTATIONS, s.notation),
      compactDisplay === 'long',
      s.minimumFractionDigits === undefined ? 0 : s.minimumFractionDigits,
      s.maximumFractionDigits === undefined ? 3 : s.maximumFractionDigits,
      s.minimumSignificantDigits === undefined ? 1 : s.minimumSignificantDigits,
      s.maximumSignificantDigits === undefined ? 21 : s.maximumSignificantDigits,
      s.roundingType,
      s.roundingIncrement,
      indexOf(ROUNDING_MODES, s.roundingMode),
      s.trailingZeroDisplay === 'stripIfInteger'
    );
    var mask = prCategories(s.handle);
    s.pluralCategories = [];
    for (var c = 0; c < 6; c++) if (mask & (1 << c)) append(s.pluralCategories, CATEGORIES[c]);
    setPluralSlots(self, s);
  }

  // Method shorthand: these must not be constructors.
  var pluralMethods = {
    select(value) {
      var s = pluralOf(this, 'select');
      return CATEGORIES[prSelect(s.handle, toIntlMV(value))];
    },
    selectRange(start, end) {
      var s = pluralOf(this, 'selectRange');
      if (start === undefined || end === undefined) throw new TypeError('start and end are required');
      var x = toIntlMV(start);
      var y = toIntlMV(end);
      if (x !== x || y !== y) throw new RangeError('start and end must not be NaN');
      return CATEGORIES[prSelectRange(s.handle, x, y)];
    },
    resolvedOptions() {
      var s = pluralOf(this, 'resolvedOptions');
      // Literal in the spec's key order; keys whose slot is unset are removed (order is kept).
      var o = {
        locale: s.locale,
        type: s.type,
        notation: s.notation,
        compactDisplay: s.compactDisplay,
        minimumIntegerDigits: s.minimumIntegerDigits,
        minimumFractionDigits: s.minimumFractionDigits,
        maximumFractionDigits: s.maximumFractionDigits,
        minimumSignificantDigits: s.minimumSignificantDigits,
        maximumSignificantDigits: s.maximumSignificantDigits,
        pluralCategories: copyList(s.pluralCategories),
        roundingIncrement: s.roundingIncrement,
        roundingMode: s.roundingMode,
        roundingPriority: s.roundingPriority,
        trailingZeroDisplay: s.trailingZeroDisplay,
      };
      if (s.compactDisplay === undefined) delete o.compactDisplay;
      if (s.minimumFractionDigits === undefined) {
        delete o.minimumFractionDigits;
        delete o.maximumFractionDigits;
      }
      if (s.minimumSignificantDigits === undefined) {
        delete o.minimumSignificantDigits;
        delete o.maximumSignificantDigits;
      }
      return o;
    },
  };
  installConstructor('PluralRules', PluralRules, pluralMethods, { supportedLocalesOf: supportedLocalesOf });

  var rtfNew = native.rtfNew;
  var rtfFormat = native.rtfFormat;
  var RTF_UNITS = ['second', 'minute', 'hour', 'day', 'week', 'month', 'quarter', 'year'];
  var rtfSlots = new WeakMap();
  var rtfOf = slotsOf(WeakMap.prototype.get.bind(rtfSlots), 'RelativeTimeFormat');
  var setRtfSlots = WeakMap.prototype.set.bind(rtfSlots);

  function RelativeTimeFormat() {
    var self = this;
    construct(self, new.target, RelativeTimeFormat, 'RelativeTimeFormat');
    var requested = canonicalizeLocaleList(arguments[0]);
    var options = coerceOptionsToObject(arguments[1]);
    getOption(options, 'localeMatcher', ['lookup', 'best fit'], 'best fit');
    var nu = getOptionAny(options, 'numberingSystem');
    if (nu !== undefined && !isType(nu)) throw new RangeError('Invalid numberingSystem: ' + nu);
    var r = resolveLocale(requested, true, nu);
    var s = create(null);
    s.locale = r.locale;
    s.style = getOption(options, 'style', STYLES, 'long');
    s.numeric = getOption(options, 'numeric', ['always', 'auto'], 'always');
    s.numberingSystem = r.nu;
    s.handle = rtfNew(r.dataLocale, indexOf(STYLES, s.style), s.numeric === 'auto');
    setRtfSlots(self, s);
  }

  // SingularRelativeTimeUnit → index into RTF_UNITS, or RangeError.
  function rtfUnit(unit) {
    var i = indexOf(RTF_UNITS, unit);
    if (i < 0 && unit.length > 1 && unit[unit.length - 1] === 's') i = indexOf(RTF_UNITS, slice(unit, 0, -1));
    if (i < 0) throw new RangeError('Invalid unit argument: ' + unit);
    return i;
  }

  function rtfCall(rtf, method, value, unit, packed) {
    var s = rtfOf(rtf, method);
    value = +value; // ToNumber once: throws for Symbol and BigInt
    unit = toString(unit);
    if (!isFinite_(value)) throw new RangeError('Invalid value: must be finite');
    var u = rtfUnit(unit);
    var out = rtfFormat(s.handle, value, u, packed);
    return packed ? unpackParts(out, RTF_UNITS[u]) : out;
  }

  var rtfMethods = {
    format(value, unit) {
      return rtfCall(this, 'format', value, unit, false);
    },
    formatToParts(value, unit) {
      return rtfCall(this, 'formatToParts', value, unit, true);
    },
    resolvedOptions() {
      var s = rtfOf(this, 'resolvedOptions');
      return { locale: s.locale, style: s.style, numeric: s.numeric, numberingSystem: s.numberingSystem };
    },
  };
  installConstructor('RelativeTimeFormat', RelativeTimeFormat, rtfMethods, { supportedLocalesOf: supportedLocalesOf });

  var lfNew = native.lfNew;
  var lfFormat = native.lfFormat;
  var LIST_TYPES = ['conjunction', 'disjunction', 'unit'];
  var lfSlots = new WeakMap();
  var lfOf = slotsOf(WeakMap.prototype.get.bind(lfSlots), 'ListFormat');
  var setLfSlots = WeakMap.prototype.set.bind(lfSlots);

  function ListFormat() {
    var self = this;
    construct(self, new.target, ListFormat, 'ListFormat');
    var requested = canonicalizeLocaleList(arguments[0]);
    var options = getOptionsObject(arguments[1]);
    getOption(options, 'localeMatcher', ['lookup', 'best fit'], 'best fit');
    var s = create(null);
    s.locale = resolveLocale(requested).locale;
    s.type = getOption(options, 'type', LIST_TYPES, 'conjunction');
    s.style = getOption(options, 'style', STYLES, 'long');
    s.handle = lfNew(s.locale, indexOf(LIST_TYPES, s.type), indexOf(STYLES, s.style));
    setLfSlots(self, s);
  }

  var isArray = Array.isArray;
  var arrayValues = Array.prototype[iteratorSym];
  var arrayIteratorPrototype = getPrototypeOf([][iteratorSym]());
  var arrayIteratorNext = arrayIteratorPrototype.next;

  // StringListFromIterable. An array with untouched iteration is read directly: native reads it
  // again, so only getter-defined elements could tell. for-of closes the iterator on throw.
  function stringList(iterable) {
    if (iterable === undefined) return [];
    if (isArray(iterable) && iterable[iteratorSym] === arrayValues && arrayIteratorPrototype.next === arrayIteratorNext) {
      for (var i = 0; i < iterable.length; i++) {
        var item = iterable[i];
        if (typeof item !== 'string') throw new TypeError('Iterable yielded ' + item + ' which is not a string');
      }
      return iterable;
    }
    var list = [];
    for (var v of iterable) {
      if (typeof v !== 'string') throw new TypeError('Iterable yielded ' + v + ' which is not a string');
      append(list, v);
    }
    return list;
  }

  var lfMethods = {
    format(list) {
      var s = lfOf(this, 'format');
      return lfFormat(s.handle, stringList(list), false);
    },
    formatToParts(list) {
      var s = lfOf(this, 'formatToParts');
      return unpackParts(lfFormat(s.handle, stringList(list), true));
    },
    resolvedOptions() {
      var s = lfOf(this, 'resolvedOptions');
      return { locale: s.locale, type: s.type, style: s.style };
    },
  };
  installConstructor('ListFormat', ListFormat, lfMethods, { supportedLocalesOf: supportedLocalesOf });

  var setLocaleSlots = WeakMap.prototype.set.bind(localeSlots);
  var localeOf = slotsOf(getLocaleSlots, 'Locale');
  var LOCALE_KEYS = ['ca', 'co', 'fw', 'hc', 'kf', 'kn', 'nu'];
  var WEEKDAYS = { 0: 'sun', 1: 'mon', 2: 'tue', 3: 'wed', 4: 'thu', 5: 'fri', 6: 'sat', 7: 'sun' };
  var WEEKDAY_NUMBERS = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 7 };

  // The unicode_language_id subtags of a canonical tag; `end` is the index past them.
  function baseParts(tag) {
    var subtags = split(tag, '-');
    var r = { language: subtags[0], script: undefined, region: undefined, variants: undefined, end: 1 };
    var i = 1;
    if (i < subtags.length && isScript(subtags[i])) r.script = subtags[i++];
    if (i < subtags.length && isRegion(subtags[i])) r.region = subtags[i++];
    var start = i;
    while (i < subtags.length && isVariant(subtags[i])) i++;
    if (i > start) r.variants = join(arraySlice(subtags, start, i), '-');
    r.end = i;
    return r;
  }

  function baseName(tag) {
    var subtags = split(tag, '-');
    return join(arraySlice(subtags, 0, baseParts(tag).end), '-');
  }

  // GetOption with no value list: undefined or ToString(value).
  function getOptionAny(options, key) {
    var v = options[key];
    return v === undefined ? undefined : toString(v);
  }

  function updateLanguageId(tag, options) {
    var b = baseParts(tag);
    var language = options.language;
    language = language === undefined ? b.language : toString(language);
    if (!isLanguage(language)) throw new RangeError('Invalid language: ' + language);
    var script = options.script;
    script = script === undefined ? b.script : toString(script);
    if (script !== undefined && !isScript(script)) throw new RangeError('Invalid script: ' + script);
    var region = options.region;
    region = region === undefined ? b.region : toString(region);
    if (region !== undefined && !isRegion(region)) throw new RangeError('Invalid region: ' + region);
    var variants = options.variants;
    variants = variants === undefined ? b.variants : toString(variants);
    if (variants !== undefined) {
      if (variants === '') throw new RangeError('Invalid variants');
      var vs = split(toLowerCase(variants), '-');
      for (var i = 0; i < vs.length; i++) {
        if (!isVariant(vs[i]) || indexOf(vs, vs[i]) !== i) throw new RangeError('Invalid variants: ' + variants);
      }
    }
    var subtags = split(tag, '-');
    var rest = join(arraySlice(subtags, b.end), '-');
    var out = language;
    if (script !== undefined) out += '-' + script;
    if (region !== undefined) out += '-' + region;
    if (variants !== undefined) out += '-' + variants;
    return rest === '' ? out : out + '-' + rest;
  }

  // CanonicalizeUValue.
  function canonicalUValue(key, value) {
    var t = canonicalize('und-u-' + key + '-' + toLowerCase(value));
    if (t === undefined) return toLowerCase(value);
    var c = extensionComponents(unicodeExtension(t)).keywords;
    var i = keywordIndex(c, key);
    return i < 0 ? toLowerCase(value) : c[i][1];
  }

  function makeLocaleRecord(tag, opt) {
    var ext = unicodeExtension(tag);
    var comps = ext !== '' ? extensionComponents(ext) : { attributes: [], keywords: [] };
    var keywords = comps.keywords;
    var result = create(null);
    for (var k = 0; k < LOCALE_KEYS.length; k++) {
      var key = LOCALE_KEYS[k];
      var idx = keywordIndex(keywords, key);
      var value = idx >= 0 ? keywords[idx][1] : undefined;
      if (opt[key] !== undefined) {
        value = canonicalUValue(key, opt[key]);
        if (idx >= 0) keywords[idx][1] = value;
        else append(keywords, [key, value]);
      }
      result[key] = value;
    }
    var locale = ext === '' ? tag : slice(tag, 0, stringIndexOf(tag, ext)) + slice(tag, stringIndexOf(tag, ext) + ext.length);
    if (comps.attributes.length || keywords.length) {
      var u = '-u';
      for (var a = 0; a < comps.attributes.length; a++) u += '-' + comps.attributes[a];
      for (var w = 0; w < keywords.length; w++) u += '-' + keywords[w][0] + (keywords[w][1] !== '' ? '-' + keywords[w][1] : '');
      var x = stringIndexOf(locale, '-x-');
      locale = x < 0 ? locale + u : slice(locale, 0, x) + u + slice(locale, x);
    }
    result.locale = canonicalize(locale);
    // Read the values back from the canonical tag: canonicalization may rename them.
    var final = extensionComponents(unicodeExtension(result.locale)).keywords;
    for (var f = 0; f < LOCALE_KEYS.length; f++) {
      var i2 = keywordIndex(final, LOCALE_KEYS[f]);
      if (result[LOCALE_KEYS[f]] !== undefined && i2 >= 0) result[LOCALE_KEYS[f]] = final[i2][1];
    }
    return result;
  }

  function Locale(tag) {
    var self = this;
    construct(self, new.target, Locale, 'Locale');
    var options = arguments[1];
    if (typeof tag !== 'string' && !isObject(tag)) throw new TypeError('First argument to Intl.Locale must be a string or Locale object');
    var ls = isObject(tag) ? getLocaleSlots(tag) : undefined;
    tag = ls !== undefined ? ls.locale : toString(tag);
    options = coerceOptionsToObject(options);
    var canonical = canonicalize(tag);
    if (canonical === undefined) throw new RangeError('Incorrect locale information provided');
    var s = create(null);
    // Fast path, same result: no options means no option reads and no keywords to merge, and
    // UpdateLanguageId and MakeLocaleRecord return a canonical tag without -u- unchanged.
    if (arguments[1] === undefined && unicodeExtension(canonical) === '') {
      s.locale = canonical;
      s.numeric = false;
      setLocaleSlots(self, s);
      return;
    }
    tag = updateLanguageId(canonical, options);
    var opt = create(null);
    opt.ca = getOptionAny(options, 'calendar');
    if (opt.ca !== undefined && !isType(opt.ca)) throw new RangeError('Invalid calendar: ' + opt.ca);
    opt.co = getOptionAny(options, 'collation');
    if (opt.co !== undefined && !isType(opt.co)) throw new RangeError('Invalid collation: ' + opt.co);
    var fw = getOptionAny(options, 'firstDayOfWeek');
    if (fw !== undefined) {
      if (WEEKDAYS[fw] !== undefined && fw.length === 1) fw = WEEKDAYS[fw];
      if (!isType(fw)) throw new RangeError('Invalid firstDayOfWeek: ' + fw);
    }
    opt.fw = fw;
    opt.hc = getOption(options, 'hourCycle', ['h11', 'h12', 'h23', 'h24'], undefined);
    opt.kf = getOption(options, 'caseFirst', ['upper', 'lower', 'false'], undefined);
    var kn = options.numeric;
    opt.kn = kn === undefined ? undefined : '' + !!kn;
    opt.nu = getOptionAny(options, 'numberingSystem');
    if (opt.nu !== undefined && !isType(opt.nu)) throw new RangeError('Invalid numberingSystem: ' + opt.nu);
    var r = makeLocaleRecord(tag, opt);
    if (r.locale === undefined) throw new RangeError('Incorrect locale information provided');
    s.locale = r.locale;
    s.calendar = r.ca;
    s.collation = r.co;
    s.firstDayOfWeek = r.fw;
    s.hourCycle = r.hc;
    s.caseFirst = r.kf;
    s.numeric = r.kn === 'true' || r.kn === '';
    s.numberingSystem = r.nu;
    setLocaleSlots(self, s);
  }

  var execSubdivision = RegExp.prototype.exec.bind(/^([a-z]{2}|[0-9]{3})[a-z0-9]{1,4}$/);
  var toUpperCase = Function.prototype.call.bind(String.prototype.toUpperCase);

  // CanonicalUnicodeSubdivision: the region of an "sd"/"rg" keyword value ("gbeng" → "GB").
  function subdivisionRegion(tag, key) {
    var ext = unicodeExtension(tag);
    if (ext === '') return undefined;
    var kw = extensionComponents(ext).keywords;
    var i = keywordIndex(kw, key);
    var m = i < 0 ? null : execSubdivision(kw[i][1]);
    return m === null ? undefined : toUpperCase(m[1]);
  }

  // RegionPreference, collapsed to the one region to read data for.
  function dataRegion(tag) {
    var override = subdivisionRegion(tag, 'rg');
    if (override !== undefined) return override;
    var region = baseParts(tag).region;
    if (region === undefined) region = subdivisionRegion(tag, 'sd');
    if (region === undefined) {
      var max = localeMaximize(tag);
      region = max !== undefined ? baseParts(max).region : undefined;
    }
    return region === undefined ? '001' : region;
  }

  // ICU4X data has only each region's default calendar; this is CLDR calendarPreferenceData,
  // filtered to AvailableCalendars (no "islamic", "islamic-rgsa"). Other regions: gregory only.
  var ARAB = 'gregory islamic-civil islamic-tbla';
  var GULF = 'gregory islamic-umalqura islamic-civil islamic-tbla';
  var CHINA = 'gregory chinese';
  var CALENDARS = {
    AE: GULF, BH: GULF, KW: GULF, QA: GULF, BD: GULF,
    DJ: ARAB, DZ: ARAB, EH: ARAB, ER: ARAB, IQ: ARAB, JO: ARAB, KM: ARAB, LB: ARAB, LY: ARAB, MA: ARAB,
    MR: ARAB, OM: ARAB, PS: ARAB, SD: ARAB, SY: ARAB, TD: ARAB, TN: ARAB, YE: ARAB,
    AF: 'persian gregory islamic-civil islamic-tbla', IR: 'persian gregory islamic-civil islamic-tbla',
    EG: 'gregory coptic islamic-civil islamic-tbla', ET: 'gregory ethiopic',
    IL: 'gregory hebrew islamic-civil islamic-tbla', IN: 'gregory indian', JP: 'gregory japanese',
    KR: 'gregory dangi', SA: 'islamic-umalqura gregory', TH: 'buddhist gregory', TW: 'gregory roc chinese',
    CN: CHINA, CX: CHINA, HK: CHINA, MO: CHINA, SG: CHINA,
  };

  // ICU4X ships no CLDR timeData. Regions preferring a 12-hour clock, plus the
  // language-region entries that differ from their region; everything else is 24-hour.
  var H12_REGIONS = ' AE AG AS AU BB BD BH BM BN BS BT CA CO DJ DM DZ EG EH ER FM GM GU GY HN IN IQ JM JO KN KP KR KW KY LB LC LR LY MH MP MR MW MX MY NA NZ OM PG PH PK PR PS QA SA SD SL SO SS SY SZ TC TD TN TO TW UM US VC VG VI WS YE ZM ';
  var HOUR_CYCLE_OVERRIDES = { 'fr-CA': 'h23', 'en-001': 'h12', 'ar-001': 'h12' };

  function array(list) {
    var a = [];
    for (var i = 0; i < list.length; i++) append(a, list[i]);
    return a;
  }

  function subtags(s) {
    return s.subtags || (s.subtags = baseParts(s.locale));
  }
  function prefRegion(s) {
    return s.prefRegion || (s.prefRegion = dataRegion(s.locale));
  }

  // Getter syntax: named "get x" and not constructors, as the spec requires.
  var localeGetters = {
    get baseName() {
      var s = localeOf(this, 'baseName');
      return s.baseName || (s.baseName = baseName(s.locale));
    },
    get calendar() { return localeOf(this, 'calendar').calendar; },
    get caseFirst() { return localeOf(this, 'caseFirst').caseFirst; },
    get collation() { return localeOf(this, 'collation').collation; },
    get firstDayOfWeek() { return localeOf(this, 'firstDayOfWeek').firstDayOfWeek; },
    get hourCycle() { return localeOf(this, 'hourCycle').hourCycle; },
    get language() { return subtags(localeOf(this, 'language')).language; },
    get numberingSystem() { return localeOf(this, 'numberingSystem').numberingSystem; },
    get numeric() { return localeOf(this, 'numeric').numeric; },
    get region() { return subtags(localeOf(this, 'region')).region; },
    get script() { return subtags(localeOf(this, 'script')).script; },
    get variants() { return subtags(localeOf(this, 'variants')).variants; },
  };

  var localeMethods = {
    maximize() {
      var s = localeOf(this, 'maximize');
      var max = localeMaximize(s.locale);
      return new Locale(max === undefined ? s.locale : max);
    },
    minimize() {
      var s = localeOf(this, 'minimize');
      var min = localeMinimize(s.locale);
      return new Locale(min === undefined ? s.locale : min);
    },
    toString() {
      return localeOf(this, 'toString').locale;
    },
    getCalendars() {
      var s = localeOf(this, 'getCalendars');
      if (s.calendar !== undefined) return array([s.calendar]);
      var prefs = CALENDARS[prefRegion(s)];
      return array(prefs === undefined ? ['gregory'] : split(prefs, ' '));
    },
    getCollations() {
      var s = localeOf(this, 'getCollations');
      // No collation data is bundled; the spec's fallback list.
      return array(s.collation !== undefined ? [s.collation] : ['emoji', 'eor']);
    },
    getHourCycles() {
      var s = localeOf(this, 'getHourCycles');
      if (s.hourCycle !== undefined) return array([s.hourCycle]);
      var r = prefRegion(s);
      var byLanguage = HOUR_CYCLE_OVERRIDES[subtags(s).language + '-' + r];
      if (byLanguage !== undefined) return array([byLanguage]);
      return array([stringIndexOf(H12_REGIONS, ' ' + r + ' ') >= 0 ? 'h12' : 'h23']);
    },
    getNumberingSystems() {
      var s = localeOf(this, 'getNumberingSystems');
      return array([s.numberingSystem !== undefined ? s.numberingSystem : localeNumberingSystem(s.locale)]);
    },
    getTimeZones() {
      var s = localeOf(this, 'getTimeZones');
      var region = subtags(s).region;
      if (region === undefined) return undefined;
      var zones = regionTimeZones(region);
      return array(zones === '' ? [] : split(zones, ' '));
    },
    getTextInfo() {
      var s = localeOf(this, 'getTextInfo');
      var info = {};
      dataProp(info, 'direction', ['ltr', 'rtl', undefined][localeDirection(s.locale)]);
      return info;
    },
    getWeekInfo() {
      var s = localeOf(this, 'getWeekInfo');
      var w = localeWeekInfo('und-' + prefRegion(s));
      var firstDay = w & 0xff;
      if (s.firstDayOfWeek !== undefined && WEEKDAY_NUMBERS[s.firstDayOfWeek] !== undefined) {
        firstDay = WEEKDAY_NUMBERS[s.firstDayOfWeek];
      }
      var weekend = [];
      for (var d = 1; d <= 7; d++) if (w & (1 << (7 + d))) append(weekend, d);
      var info = {};
      dataProp(info, 'firstDay', firstDay);
      dataProp(info, 'weekend', weekend);
      return info;
    },
  };

  // Hermes's own Intl constructors and toLocale* methods read a lone Locale object as an empty
  // list. Hand them its tag instead, which CanonicalizeLocaleList treats the same way.
  function localeTag(v) {
    var s = isObject(v) ? getLocaleSlots(v) : undefined;
    return s !== undefined ? s.locale : v;
  }

  function patchable(o, k) {
    var d = getOwnPropertyDescriptor(o, k);
    return d !== undefined && typeof d.value === 'function' && d.writable && d.configurable ? d.value : undefined;
  }

  function acceptLocale(o, k, index) {
    var original = patchable(o, k);
    if (original === undefined) return;
    var wrapper = index === 0
      ? { m(locales, options) { return call(original, this, localeTag(locales), options); } }.m
      : { m(that, locales, options) { return call(original, this, that, localeTag(locales), options); } }.m;
    defineProperty(wrapper, 'name', { value: original.name });
    defineProperty(wrapper, 'length', { value: original.length });
    hidden(o, k, wrapper, true);
  }

  function acceptLocaleConstructor(name) {
    var Original = patchable(Intl, name);
    if (Original === undefined) return;
    var proto = Original.prototype;
    var constructorDesc = getOwnPropertyDescriptor(proto, 'constructor');
    if (constructorDesc === undefined || !constructorDesc.configurable) return;
    var Wrapped = function (locales, options) {
      locales = localeTag(locales);
      if (new.target === undefined) return call(Original, this, locales, options);
      if (new.target === Wrapped) return new Original(locales, options);
      return reflectConstruct(Original, [locales, options], new.target);
    };
    var statics = getOwnPropertyNames(Original);
    for (var i = 0; i < statics.length; i++) {
      if (statics[i] !== 'prototype') defineProperty(Wrapped, statics[i], getOwnPropertyDescriptor(Original, statics[i]));
    }
    defineProperty(Wrapped, 'prototype', { value: proto, writable: false });
    acceptLocale(Wrapped, 'supportedLocalesOf', 0);
    hidden(Intl, name, Wrapped, true);
    constructorDesc.value = Wrapped;
    defineProperty(proto, 'constructor', constructorDesc);
  }

  if (Intl.Locale === undefined) {
    // Hermes's own getCanonicalLocales cannot see these Locale objects; replace it with the spec's.
    hidden(Intl, 'getCanonicalLocales', {
      getCanonicalLocales(locales) {
        return canonicalizeLocaleList(locales);
      },
    }.getCanonicalLocales, true);
    acceptLocaleConstructor('NumberFormat');
    acceptLocaleConstructor('DateTimeFormat');
    acceptLocaleConstructor('Collator');
    acceptLocale(Number.prototype, 'toLocaleString', 0);
    if (typeof BigInt === 'function') acceptLocale(BigInt.prototype, 'toLocaleString', 0);
    acceptLocale(Date.prototype, 'toLocaleString', 0);
    acceptLocale(Date.prototype, 'toLocaleDateString', 0);
    acceptLocale(Date.prototype, 'toLocaleTimeString', 0);
    acceptLocale(String.prototype, 'localeCompare', 1);
    acceptLocale(String.prototype, 'toLocaleLowerCase', 0);
    acceptLocale(String.prototype, 'toLocaleUpperCase', 0);
    var getterNames = Object.getOwnPropertyNames(localeGetters);
    for (var g = 0; g < getterNames.length; g++) {
      var d = Object.getOwnPropertyDescriptor(localeGetters, getterNames[g]);
      d.enumerable = false;
      defineProperty(Locale.prototype, getterNames[g], d);
    }
  }
  installConstructor('Locale', Locale, localeMethods, {});
};
