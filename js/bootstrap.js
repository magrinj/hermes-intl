// Spec shell for the Intl constructors Hermes lacks; data comes from `native.*`. Intrinsics are
// captured up front so built-ins patched later cannot change behaviour (test262 "tainting").
module.exports = function (native, global) {
  // Also a worklet, under react-native-worklets' Babel plugin (src/index.js installOnWorkletRuntime).
  'worklet';
  'use strict';

  var Intl = global.Intl;
  if (typeof Intl !== 'object' || Intl === null) {
    // Hermes built without Intl.
    Intl = {};
    Object.defineProperty(Intl, Symbol.toStringTag, { value: 'Intl', configurable: true });
    Object.defineProperty(global, 'Intl', { value: Intl, writable: true, configurable: true });
  }
  // The engine's own Intl.Locale, if it ships one: its toString checks the brand and returns [[Locale]].
  var engineLocaleToString = typeof Intl.Locale === 'function' ? Intl.Locale.prototype.toString : undefined;

  var ObjectPrototype = Object.prototype;
  var create = Object.create;
  var defineProperty = Object.defineProperty;
  var getOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
  var getOwnPropertyNames = Object.getOwnPropertyNames;
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
  var PART_TYPES = ['literal', 'integer', 'group', 'decimal', 'fraction', 'element', 'minusSign', 'unit', 'plusSign',
    'percentSign', 'currency', 'compact', 'exponentSeparator', 'exponentMinusSign', 'exponentInteger', 'nan', 'infinity',
    'approximatelySign'];
  // formatRangeToParts sources, in bits 5 and 6 of a part's kind.
  var PART_SOURCES = [undefined, 'startRange', 'endRange', 'shared'];
  // A part's unit for DurationFormat, in bits 7 and up of its kind.
  var PART_UNITS = ['year', 'month', 'week', 'day', 'hour', 'minute', 'second', 'millisecond', 'microsecond', 'nanosecond'];

  // Declared up front: Intl.Locale objects are accepted wherever a locale list is.
  var localeSlots = new WeakMap();
  var getLocaleSlots = WeakMap.prototype.get.bind(localeSlots);

  // The [[Locale]] of an Intl.Locale object, ours or the engine's, else undefined.
  function localeTagOf(v) {
    if (!isObject(v)) return undefined;
    var s = getLocaleSlots(v);
    if (s !== undefined) return s.locale;
    if (engineLocaleToString === undefined) return undefined;
    try {
      return call(engineLocaleToString, v);
    } catch (e) {
      return undefined;
    }
  }

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
    if (typeof locales === 'string' || localeTagOf(locales) !== undefined) {
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
        var tag = localeTagOf(el);
        if (tag === undefined) tag = canonicalize(toString(el));
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
      var type = PART_TYPES[kind & 31];
      var source = PART_SOURCES[(kind >> 5) & 3];
      var u = kind >> 7 ? PART_UNITS[(kind >> 7) - 1] : kind !== 0 ? unit : undefined;
      append(result, source !== undefined ? { type: type, value: value, source: source }
        : u !== undefined ? { type: type, value: value, unit: u }
        : { type: type, value: value });
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

  function installConstructor(name, ctor, methods, statics, replace) {
    if (Intl[name] !== undefined && !replace) return;
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

  // StringListFromIterable. An array with untouched iteration is read by index, skipping the
  // iterator, but copied: native must get the strings checked here, not a getter's next value.
  // for-of closes the iterator on throw.
  function stringList(iterable) {
    if (iterable === undefined) return [];
    var list = [];
    if (isArray(iterable) && iterable[iteratorSym] === arrayValues && arrayIteratorPrototype.next === arrayIteratorNext) {
      for (var i = 0; i < iterable.length; i++) {
        var item = iterable[i];
        if (typeof item !== 'string') throw new TypeError('Iterable yielded ' + item + ' which is not a string');
        append(list, item);
      }
      return list;
    }
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

  // Intl.NumberFormat, in place of Hermes's own where it has no formatToParts: on Apple platforms,
  // where it also ignores compact notation, signDisplay, roundingMode and -u-nu-.
  var HermesNumberFormat = Intl.NumberFormat;
  var ownNumberFormat = typeof native.nfNew === 'function' &&
    (typeof HermesNumberFormat !== 'function' || typeof HermesNumberFormat.prototype.formatToParts !== 'function');
  var nfNew = native.nfNew;
  var nfFormat = native.nfFormat;
  var nfFormatRange = native.nfFormatRange;
  var currencyDigits = native.currencyDigits;
  var NF_STYLES = ['decimal', 'percent', 'currency', 'unit'];
  var CURRENCY_DISPLAYS = ['code', 'symbol', 'narrowSymbol', 'name'];
  var GROUPINGS = ['auto', 'always', 'min2', false];
  var SIGN_DISPLAYS = ['auto', 'never', 'always', 'exceptZero', 'negative'];
  var SANCTIONED_UNITS = ['acre', 'bit', 'byte', 'celsius', 'centimeter', 'day', 'degree', 'fahrenheit', 'fluid-ounce',
    'foot', 'gallon', 'gigabit', 'gigabyte', 'gram', 'hectare', 'hour', 'inch', 'kilobit', 'kilobyte', 'kilogram',
    'kilometer', 'liter', 'megabit', 'megabyte', 'meter', 'microsecond', 'mile', 'mile-scandinavian', 'milliliter',
    'millimeter', 'millisecond', 'minute', 'month', 'nanosecond', 'ounce', 'percent', 'petabyte', 'pound', 'second',
    'stone', 'terabit', 'terabyte', 'week', 'yard', 'year'];
  // IsWellFormedCurrencyCode, without a RegExp: NumberFormat must leave RegExp.$_ untouched.
  function isCurrencyCode(c) {
    if (c.length !== 3) return false;
    for (var i = 0; i < 3; i++) {
      var u = charCodeAt(c, i) | 0x20;
      if (u < 0x61 || u > 0x7a) return false;
    }
    return true;
  }
  var nfSlots = new WeakMap();
  var getNfSlots = WeakMap.prototype.get.bind(nfSlots);
  var setNfSlots = WeakMap.prototype.set.bind(nfSlots);
  var nfOf = slotsOf(getNfSlots, 'NumberFormat');
  // %Intl%.[[FallbackSymbol]], for the legacy constructor mode (ECMA-402 4.3 Note 1).
  var fallbackSymbol = Symbol('IntlLegacyConstructedSymbol');

  // IsWellFormedUnitIdentifier.
  function isWellFormedUnit(unit) {
    if (indexOf(SANCTIONED_UNITS, unit) >= 0) return true;
    var i = stringIndexOf(unit, '-per-');
    return i >= 0 && indexOf(SANCTIONED_UNITS, slice(unit, 0, i)) >= 0 && indexOf(SANCTIONED_UNITS, slice(unit, i + 5)) >= 0;
  }

  // GetBooleanOrStringNumberFormatOption.
  function booleanOrStringOption(options, key, values, fallback) {
    var v = options[key];
    if (v === undefined) return fallback;
    if (v === true) return true;
    if (!v) return false;
    v = toString(v);
    if (indexOf(values, v) < 0) throw new RangeError('Value ' + v + ' out of range for ' + key);
    return v;
  }

  // InitializeNumberFormat.
  function initNumberFormat(locales, options) {
    var requested = canonicalizeLocaleList(locales);
    options = coerceOptionsToObject(options);
    getOption(options, 'localeMatcher', ['lookup', 'best fit'], 'best fit');
    var nu = getOptionAny(options, 'numberingSystem');
    if (nu !== undefined && !isType(nu)) throw new RangeError('Invalid numberingSystem: ' + nu);
    var r = resolveLocale(requested, true, nu);
    var s = create(null);
    s.locale = r.locale;
    s.numberingSystem = r.nu;
    // SetNumberFormatUnitOptions.
    s.style = getOption(options, 'style', NF_STYLES, 'decimal');
    var currency = getOptionAny(options, 'currency');
    if (currency === undefined) {
      if (s.style === 'currency') throw new TypeError('Currency code is required with currency style.');
    } else if (!isCurrencyCode(currency)) {
      throw new RangeError('Invalid currency code: ' + currency);
    }
    var currencyDisplay = getOption(options, 'currencyDisplay', CURRENCY_DISPLAYS, 'symbol');
    var currencySign = getOption(options, 'currencySign', ['standard', 'accounting'], 'standard');
    var unit = getOptionAny(options, 'unit');
    if (unit === undefined) {
      if (s.style === 'unit') throw new TypeError('Unit is required with unit style.');
    } else if (!isWellFormedUnit(unit)) {
      throw new RangeError('Invalid unit argument: ' + unit);
    }
    var unitDisplay = getOption(options, 'unitDisplay', ['short', 'narrow', 'long'], 'short');
    if (s.style === 'currency') {
      s.currency = toUpperCase(currency);
      s.currencyDisplay = currencyDisplay;
      s.currencySign = currencySign;
    }
    if (s.style === 'unit') {
      s.unit = unit;
      s.unitDisplay = unitDisplay;
    }
    s.notation = getOption(options, 'notation', NOTATIONS, 'standard');
    var mnfdDefault = 0;
    var mxfdDefault = s.style === 'percent' ? 0 : 3;
    if (s.style === 'currency' && s.notation === 'standard') mnfdDefault = mxfdDefault = currencyDigits(s.currency);
    setDigitOptions(s, options, mnfdDefault, mxfdDefault, s.notation);
    var compactDisplay = getOption(options, 'compactDisplay', ['short', 'long'], 'short');
    var defaultUseGrouping = 'auto';
    if (s.notation === 'compact') {
      s.compactDisplay = compactDisplay;
      defaultUseGrouping = 'min2';
    }
    var useGrouping = booleanOrStringOption(options, 'useGrouping', ['min2', 'auto', 'always', 'true', 'false'], defaultUseGrouping);
    if (useGrouping === 'true' || useGrouping === 'false') useGrouping = defaultUseGrouping;
    if (useGrouping === true) useGrouping = 'always';
    s.useGrouping = useGrouping;
    s.signDisplay = getOption(options, 'signDisplay', SIGN_DISPLAYS, 'auto');
    s.handle = nfNew(
      r.dataLocale,
      false,
      indexOf(NOTATIONS, s.notation),
      compactDisplay === 'long',
      s.minimumFractionDigits === undefined ? 0 : s.minimumFractionDigits,
      s.maximumFractionDigits === undefined ? 3 : s.maximumFractionDigits,
      s.minimumSignificantDigits === undefined ? 1 : s.minimumSignificantDigits,
      s.maximumSignificantDigits === undefined ? 21 : s.maximumSignificantDigits,
      s.roundingType,
      s.roundingIncrement,
      indexOf(ROUNDING_MODES, s.roundingMode),
      s.trailingZeroDisplay === 'stripIfInteger',
      indexOf(NF_STYLES, s.style),
      s.currency === undefined ? '' : s.currency,
      indexOf(CURRENCY_DISPLAYS, currencyDisplay),
      currencySign === 'accounting',
      s.unit === undefined ? '' : s.unit,
      indexOf(['long', 'short', 'narrow'], unitDisplay),
      indexOf(GROUPINGS, useGrouping),
      indexOf(SIGN_DISPLAYS, s.signDisplay),
      s.minimumIntegerDigits
    );
    return s;
  }

  // OrdinaryHasInstance(%Intl.NumberFormat%, o).
  function isNumberFormatInstance(o) {
    for (var p = getPrototypeOf(o); p !== null; p = getPrototypeOf(p)) {
      if (p === NumberFormat.prototype) return true;
    }
    return false;
  }

  function NumberFormat() {
    var self = this;
    if (new.target === undefined) self = create(NumberFormat.prototype);
    else construct(self, new.target, NumberFormat, 'NumberFormat');
    setNfSlots(self, initNumberFormat(arguments[0], arguments[1]));
    // ChainNumberFormat: Intl.NumberFormat.call(o) on an o inheriting from the prototype.
    if (new.target === undefined && isObject(this) && isNumberFormatInstance(this)) {
      defineProperty(this, fallbackSymbol, { value: self });
      return this;
    }
    return self;
  }

  // UnwrapNumberFormat.
  function unwrapNumberFormat(nf, method) {
    if (isObject(nf) && getNfSlots(nf) === undefined && isNumberFormatInstance(nf)) nf = nf[fallbackSymbol];
    return nfOf(nf, method);
  }

  function nfRange(nf, method, start, end, packed) {
    var s = nfOf(nf, method);
    if (start === undefined || end === undefined) throw new TypeError('start and end are required');
    var x = toIntlMV(start);
    var y = toIntlMV(end);
    if (x !== x || y !== y) throw new RangeError('start and end must not be NaN');
    var out = nfFormatRange(s.handle, x, y, packed);
    return packed ? unpackParts(out) : out;
  }

  var nfMethods = {
    formatToParts(value) {
      var s = nfOf(this, 'formatToParts');
      return unpackParts(nfFormat(s.handle, toIntlMV(value), true));
    },
    formatRange(start, end) {
      return nfRange(this, 'formatRange', start, end, false);
    },
    formatRangeToParts(start, end) {
      return nfRange(this, 'formatRangeToParts', start, end, true);
    },
    resolvedOptions() {
      var s = unwrapNumberFormat(this, 'resolvedOptions');
      // Literal in the spec's key order; keys whose slot is unset are removed (order is kept).
      var o = {
        locale: s.locale,
        numberingSystem: s.numberingSystem,
        style: s.style,
        currency: s.currency,
        currencyDisplay: s.currencyDisplay,
        currencySign: s.currencySign,
        unit: s.unit,
        unitDisplay: s.unitDisplay,
        minimumIntegerDigits: s.minimumIntegerDigits,
        minimumFractionDigits: s.minimumFractionDigits,
        maximumFractionDigits: s.maximumFractionDigits,
        minimumSignificantDigits: s.minimumSignificantDigits,
        maximumSignificantDigits: s.maximumSignificantDigits,
        useGrouping: s.useGrouping,
        notation: s.notation,
        compactDisplay: s.compactDisplay,
        signDisplay: s.signDisplay,
        roundingIncrement: s.roundingIncrement,
        roundingMode: s.roundingMode,
        roundingPriority: s.roundingPriority,
        trailingZeroDisplay: s.trailingZeroDisplay,
      };
      var keys = ['currency', 'currencyDisplay', 'currencySign', 'unit', 'unitDisplay', 'minimumFractionDigits',
        'maximumFractionDigits', 'minimumSignificantDigits', 'maximumSignificantDigits', 'compactDisplay'];
      for (var i = 0; i < keys.length; i++) if (o[keys[i]] === undefined) delete o[keys[i]];
      return o;
    },
  };

  if (ownNumberFormat) {
    installConstructor('NumberFormat', NumberFormat, nfMethods, { supportedLocalesOf: supportedLocalesOf }, true);
    // A getter returning a bound function, made once per instance. A method, renamed: Hermes gives
    // getter syntax functions a prototype property.
    var formatGetter = {
      format() {
        var s = unwrapNumberFormat(this, 'format');
        if (s.boundFormat === undefined) {
          s.boundFormat = [(value) => nfFormat(s.handle, toIntlMV(value), false)][0];
        }
        return s.boundFormat;
      },
    }.format;
    defineProperty(formatGetter, 'name', { value: 'get format' });
    defineProperty(NumberFormat.prototype, 'format', { get: formatGetter, enumerable: false, configurable: true });
    var numberValueOf = Number.prototype.valueOf;
    hidden(Number.prototype, 'toLocaleString', {
      toLocaleString() {
        var x = call(numberValueOf, this);
        return nfFormat(initNumberFormat(arguments[0], arguments[1]).handle, x, false);
      },
    }.toLocaleString, true);
    if (typeof BigInt === 'function') {
      var bigintValueOf = BigInt.prototype.valueOf;
      hidden(BigInt.prototype, 'toLocaleString', {
        toLocaleString() {
          var x = call(bigintValueOf, this);
          return nfFormat(initNumberFormat(arguments[0], arguments[1]).handle, '' + x, false);
        },
      }.toLocaleString, true);
    }
  }
  var segNew = native.segNew;
  var segBreaks = native.segBreaks;
  var GRANULARITIES = ['grapheme', 'word', 'sentence'];
  var segmenterSlots = new WeakMap();
  var segmenterOf = slotsOf(WeakMap.prototype.get.bind(segmenterSlots), 'Segmenter');
  var setSegmenterSlots = WeakMap.prototype.set.bind(segmenterSlots);
  var segmentsSlots = new WeakMap();
  var getSegmentsSlots = WeakMap.prototype.get.bind(segmentsSlots);
  var setSegmentsSlots = WeakMap.prototype.set.bind(segmentsSlots);
  var segmentIteratorSlots = new WeakMap();
  var getSegmentIteratorSlots = WeakMap.prototype.get.bind(segmentIteratorSlots);
  var setSegmentIteratorSlots = WeakMap.prototype.set.bind(segmentIteratorSlots);

  function Segmenter() {
    var self = this;
    construct(self, new.target, Segmenter, 'Segmenter');
    var requested = canonicalizeLocaleList(arguments[0]);
    var options = getOptionsObject(arguments[1]);
    getOption(options, 'localeMatcher', ['lookup', 'best fit'], 'best fit');
    var s = create(null);
    s.locale = resolveLocale(requested).locale;
    s.granularity = getOption(options, 'granularity', GRANULARITIES, 'grapheme');
    s.handle = segNew(s.locale, indexOf(GRANULARITIES, s.granularity));
    setSegmenterSlots(self, s);
  }

  var Uint32Array_ = Uint32Array;
  var typedArrayLength = getOwnPropertyDescriptor(getPrototypeOf(Uint32Array.prototype), 'length').get;

  // The end of each segment, with the word-like flag at bit 30 (rust/src/segmenter.rs), for the
  // whole string on first use.
  function segmentEnds(seg) {
    if (seg.ends === undefined) {
      seg.ends = new Uint32Array_(segBreaks(seg.segmenter.handle, seg.string));
      seg.count = call(typedArrayLength, seg.ends);
    }
    return seg.ends;
  }

  // CreateSegmentDataObject for segment i, which starts at `start`.
  function segmentData(seg, i, start) {
    var e = segmentEnds(seg)[i];
    var segment = slice(seg.string, start, e & 0x3fffffff);
    if (seg.segmenter.granularity !== 'word') return { segment: segment, index: start, input: seg.string };
    return { segment: segment, index: start, input: seg.string, isWordLike: e >= 0x40000000 };
  }

  var segmentsOf = slotsOf(getSegmentsSlots, 'Segmenter.Segments');
  var SegmentsPrototype = create(ObjectPrototype);
  var IteratorPrototype = getPrototypeOf(arrayIteratorPrototype);
  var SegmentIteratorPrototype = create(IteratorPrototype);
  var segmentsMethods = {
    containing(index) {
      var seg = segmentsOf(this, 'containing');
      var n = +index;
      n = n !== n ? 0 : trunc(n);
      if (n < 0 || n >= seg.string.length) return undefined;
      // The first segment that ends after n.
      var ends = segmentEnds(seg);
      var lo = 0;
      var hi = seg.count;
      while (lo < hi) {
        var mid = (lo + hi) >> 1;
        if ((ends[mid] & 0x3fffffff) > n) hi = mid;
        else lo = mid + 1;
      }
      return segmentData(seg, lo, lo === 0 ? 0 : ends[lo - 1] & 0x3fffffff);
    },
    [iteratorSym]() {
      var seg = segmentsOf(this, '[Symbol.iterator]');
      var it = create(SegmentIteratorPrototype);
      setSegmentIteratorSlots(it, { segments: seg, index: 0, start: 0 });
      return it;
    },
  };
  hidden(SegmentsPrototype, 'containing', segmentsMethods.containing, true);
  // Hermes leaves computed method names empty.
  defineProperty(segmentsMethods[iteratorSym], 'name', { value: '[Symbol.iterator]' });
  hidden(SegmentsPrototype, iteratorSym, segmentsMethods[iteratorSym], true);
  var segmentIteratorMethods = {
    next() {
      var it = getSegmentIteratorSlots(this);
      if (it === undefined) throw new TypeError('%SegmentIterator%.prototype.next called on incompatible receiver');
      var seg = it.segments;
      var ends = segmentEnds(seg);
      if (it.index >= seg.count) return { value: undefined, done: true };
      var data = segmentData(seg, it.index, it.start);
      it.start = ends[it.index++] & 0x3fffffff;
      return { value: data, done: false };
    },
  };
  hidden(SegmentIteratorPrototype, 'next', segmentIteratorMethods.next, true);
  defineProperty(SegmentIteratorPrototype, Symbol.toStringTag, { value: 'Segmenter String Iterator', configurable: true });

  var segmenterMethods = {
    segment(string) {
      var s = segmenterOf(this, 'segment');
      var segments = create(SegmentsPrototype);
      setSegmentsSlots(segments, { segmenter: s, string: toString(string), ends: undefined, count: 0 });
      return segments;
    },
    resolvedOptions() {
      var s = segmenterOf(this, 'resolvedOptions');
      return { locale: s.locale, granularity: s.granularity };
    },
  };
  installConstructor('Segmenter', Segmenter, segmenterMethods, { supportedLocalesOf: supportedLocalesOf });
  var dnNew = native.dnNew;
  var dnName = native.dnOf;
  var DN_TYPES = ['language', 'region', 'script', 'currency', 'calendar', 'dateTimeField'];
  var DATE_TIME_FIELDS = ['era', 'year', 'quarter', 'month', 'weekOfYear', 'weekday', 'day', 'dayPeriod', 'hour', 'minute', 'second', 'timeZoneName'];
  var dnSlots = new WeakMap();
  var dnOf = slotsOf(WeakMap.prototype.get.bind(dnSlots), 'DisplayNames');
  var setDnSlots = WeakMap.prototype.set.bind(dnSlots);
  // unicode_language_id in BCP 47 syntax: no "root", no leading script.
  var isLanguageId = tester(/^([a-z]{2,3}|[a-z]{5,8})(-[a-z]{4})?(-([a-z]{2}|[0-9]{3}))?(-([a-z0-9]{5,8}|[0-9][a-z0-9]{3}))*$/i);
  var isCurrency = tester(/^[a-z]{3}$/i);

  function DisplayNames(locales, options) {
    var self = this;
    construct(self, new.target, DisplayNames, 'DisplayNames');
    var requested = canonicalizeLocaleList(locales);
    options = getOptionsObject(options);
    getOption(options, 'localeMatcher', ['lookup', 'best fit'], 'best fit');
    var s = create(null);
    s.locale = resolveLocale(requested).locale;
    s.style = getOption(options, 'style', STYLES, 'long');
    s.type = getOption(options, 'type', DN_TYPES, undefined);
    if (s.type === undefined) throw new TypeError('Intl.DisplayNames requires a type');
    s.fallback = getOption(options, 'fallback', ['code', 'none'], 'code');
    var languageDisplay = getOption(options, 'languageDisplay', ['dialect', 'standard'], 'dialect');
    if (s.type === 'language') s.languageDisplay = languageDisplay;
    s.handle = dnNew(s.locale, indexOf(DN_TYPES, s.type), indexOf(STYLES, s.style), languageDisplay === 'dialect');
    setDnSlots(self, s);
  }

  // CanonicalCodeForDisplayNames.
  function canonicalCode(type, code) {
    var c;
    if (type === 'language') {
      if (isLanguageId(code)) c = canonicalize(code);
    } else if (type === 'region') {
      if (isRegion(code)) c = toUpperCase(code);
    } else if (type === 'script') {
      if (isScript(code)) c = toUpperCase(slice(code, 0, 1)) + toLowerCase(slice(code, 1));
    } else if (type === 'calendar') {
      if (isType(code)) c = toLowerCase(code);
    } else if (type === 'dateTimeField') {
      if (indexOf(DATE_TIME_FIELDS, code) >= 0) c = code;
    } else if (isCurrency(code)) {
      c = toUpperCase(code);
    }
    if (c === undefined) throw new RangeError('Invalid code for Intl.DisplayNames: ' + code);
    return c;
  }

  var dnMethods = {
    of(code) {
      var s = dnOf(this, 'of');
      code = canonicalCode(s.type, toString(code));
      var name = dnName(s.handle, code);
      if (name !== undefined) return name;
      return s.fallback === 'code' ? code : undefined;
    },
    resolvedOptions() {
      var s = dnOf(this, 'resolvedOptions');
      var o = { locale: s.locale, style: s.style, type: s.type, fallback: s.fallback, languageDisplay: s.languageDisplay };
      if (s.languageDisplay === undefined) delete o.languageDisplay;
      return o;
    },
  };
  installConstructor('DisplayNames', DisplayNames, dnMethods, { supportedLocalesOf: supportedLocalesOf });

  var dfNew = native.dfNew;
  var dfFormat = native.dfFormat;
  var dfValid = native.dfValid;
  var dfTwoDigitHours = native.dfTwoDigitHours;
  var DURATION_UNITS = ['years', 'months', 'weeks', 'days', 'hours', 'minutes', 'seconds', 'milliseconds', 'microseconds', 'nanoseconds'];
  // Shared with rust/src/duration.rs.
  var DURATION_STYLES = ['long', 'short', 'narrow', 'numeric', '2-digit', 'fractional'];
  var BASE_STYLES = ['long', 'short', 'narrow', 'digital'];
  var dfSlots = new WeakMap();
  var dfOf = slotsOf(WeakMap.prototype.get.bind(dfSlots), 'DurationFormat');
  var setDfSlots = WeakMap.prototype.set.bind(dfSlots);

  // GetDurationUnitOptions for unit i of DURATION_UNITS: [style, display].
  function durationUnitOptions(i, options, baseStyle, prevStyle, twoDigitHours) {
    var unit = DURATION_UNITS[i];
    var values = i < 4 ? STYLES : i < 7 ? ['long', 'short', 'narrow', 'numeric', '2-digit'] : ['long', 'short', 'narrow', 'numeric'];
    var style = getOption(options, unit, values, undefined);
    var displayDefault = 'always';
    if (style === undefined) {
      if (baseStyle === 'digital') {
        style = i < 4 ? 'short' : 'numeric';
        if (i < 4 || i > 6) displayDefault = 'auto';
      } else if (prevStyle === 'fractional' || prevStyle === 'numeric' || prevStyle === '2-digit') {
        style = 'numeric';
        if (i !== 5 && i !== 6) displayDefault = 'auto';
      } else {
        style = baseStyle;
        displayDefault = 'auto';
      }
    }
    if (style === 'numeric' && i > 6) {
      style = 'fractional';
      displayDefault = 'auto';
    }
    var display = getOption(options, unit + 'Display', ['auto', 'always'], displayDefault);
    if (display === 'always' && style === 'fractional') throw new RangeError(unit + ' cannot be shown always as a fraction');
    if (prevStyle === 'fractional' && style !== 'fractional') throw new RangeError(unit + ' must be fractional');
    if (prevStyle === 'numeric' || prevStyle === '2-digit') {
      if (style !== 'fractional' && style !== 'numeric' && style !== '2-digit') throw new RangeError(unit + ' must be numeric');
      if (i === 5 || i === 6) style = '2-digit';
    }
    // [[TwoDigitHours]] is about the numeric style; the spec's step applies it to every style.
    if (i === 4 && twoDigitHours && style === 'numeric') style = '2-digit';
    return [style, display];
  }

  function DurationFormat() {
    var self = this;
    construct(self, new.target, DurationFormat, 'DurationFormat');
    var requested = canonicalizeLocaleList(arguments[0]);
    var options = getOptionsObject(arguments[1]);
    getOption(options, 'localeMatcher', ['lookup', 'best fit'], 'best fit');
    var nu = getOptionAny(options, 'numberingSystem');
    if (nu !== undefined && !isType(nu)) throw new RangeError('Invalid numberingSystem: ' + nu);
    var r = resolveLocale(requested, true, nu);
    var s = create(null);
    s.locale = r.locale;
    s.numberingSystem = r.nu;
    s.style = getOption(options, 'style', BASE_STYLES, 'short');
    s.styles = [];
    s.displays = [];
    var twoDigitHours = dfTwoDigitHours(r.dataLocale);
    var prevStyle = '';
    var packedStyles = 0;
    var always = 0;
    for (var i = 0; i < 10; i++) {
      var u = durationUnitOptions(i, options, s.style, prevStyle, twoDigitHours);
      append(s.styles, u[0]);
      append(s.displays, u[1]);
      if (i >= 4 && i <= 8) prevStyle = u[0];
      packedStyles |= indexOf(DURATION_STYLES, u[0]) << (3 * i);
      if (u[1] === 'always') always |= 1 << i;
    }
    s.fractionalDigits = getNumberOption(options, 'fractionalDigits', 0, 9, undefined);
    var fd = s.fractionalDigits === undefined ? -1 : s.fractionalDigits;
    s.handle = dfNew(r.dataLocale, indexOf(BASE_STYLES, s.style), packedStyles, always, fd);
    setDfSlots(self, s);
  }

  // ToDurationRecord reads the fields in alphabetical order; ORDER maps them to DURATION_UNITS.
  var DURATION_FIELDS = ['days', 'hours', 'microseconds', 'milliseconds', 'minutes', 'months', 'nanoseconds', 'seconds', 'weeks', 'years'];
  var DURATION_ORDER = [3, 4, 8, 7, 5, 1, 9, 6, 2, 0];

  function toDurationRecord(input) {
    if (!isObject(input)) {
      if (typeof input === 'string') throw new RangeError('Duration strings are not supported');
      throw new TypeError('Duration must be an object');
    }
    var d = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    var any = false;
    for (var k = 0; k < 10; k++) {
      var v = input[DURATION_FIELDS[k]];
      if (v !== undefined) {
        any = true;
        v = +v; // ToIntegerIfIntegral: throws for Symbol and BigInt
        if (!isFinite_(v) || trunc(v) !== v) throw new RangeError(DURATION_FIELDS[k] + ' must be an integer');
        d[DURATION_ORDER[k]] = v;
      }
    }
    if (!any) throw new TypeError('Duration must have at least one unit');
    if (!dfValid(d[0], d[1], d[2], d[3], d[4], d[5], d[6], d[7], d[8], d[9])) throw new RangeError('Invalid duration');
    return d;
  }

  function dfCall(df, method, duration, packed) {
    var s = dfOf(df, method);
    var d = toDurationRecord(duration);
    return dfFormat(s.handle, d[0], d[1], d[2], d[3], d[4], d[5], d[6], d[7], d[8], d[9], packed);
  }

  var dfMethods = {
    format(duration) {
      return dfCall(this, 'format', duration, false);
    },
    formatToParts(duration) {
      return unpackParts(dfCall(this, 'formatToParts', duration, true));
    },
    resolvedOptions() {
      var s = dfOf(this, 'resolvedOptions');
      var o = { locale: s.locale, numberingSystem: s.numberingSystem, style: s.style };
      for (var i = 0; i < 10; i++) {
        dataProp(o, DURATION_UNITS[i], s.styles[i] === 'fractional' ? 'numeric' : s.styles[i]);
        dataProp(o, DURATION_UNITS[i] + 'Display', s.displays[i]);
      }
      if (s.fractionalDigits !== undefined) dataProp(o, 'fractionalDigits', s.fractionalDigits);
      return o;
    },
  };
  installConstructor('DurationFormat', DurationFormat, dfMethods, { supportedLocalesOf: supportedLocalesOf });


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
  // list. Hand them its tag instead. Lists go through untouched: Hermes reads a Locale in one
  // through its toString, which returns the tag.
  function localeArg(v) {
    var tag = localeTagOf(v);
    return tag !== undefined ? tag : v;
  }

  function patchable(o, k) {
    var d = getOwnPropertyDescriptor(o, k);
    return d !== undefined && typeof d.value === 'function' && d.writable && d.configurable ? d.value : undefined;
  }

  function acceptLocale(o, k, index) {
    var original = patchable(o, k);
    if (original === undefined) return;
    var wrapper = index === 0
      ? { m(locales, options) { return call(original, this, localeArg(locales), options); } }.m
      : { m(that, locales, options) { return call(original, this, that, localeArg(locales), options); } }.m;
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
      if (new.target === undefined) return call(Original, this, localeArg(locales), options);
      // Hermes builds the object from its own prototype; a subclass expects new.target's.
      var proto = new.target.prototype;
      var obj = new Original(localeArg(locales), options);
      if (isObject(proto) && getPrototypeOf(obj) !== proto) setPrototypeOf(obj, proto);
      return obj;
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
    // Our NumberFormat takes Locale objects already.
    if (!ownNumberFormat) {
      acceptLocaleConstructor('NumberFormat');
      acceptLocale(Number.prototype, 'toLocaleString', 0);
      if (typeof BigInt === 'function') acceptLocale(BigInt.prototype, 'toLocaleString', 0);
    }
    acceptLocaleConstructor('DateTimeFormat');
    acceptLocaleConstructor('Collator');
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

  // Values Hermes's own constructors take are probed on first use: they differ between platforms.
  function probe(Ctor, candidates, accepts) {
    var out = [];
    for (var i = 0; i < candidates.length; i++) {
      var ok = typeof Ctor !== 'function';
      try {
        ok = ok || accepts(Ctor, candidates[i]);
      } catch (e) {}
      if (ok) append(out, candidates[i]);
    }
    return join(out, ' ');
  }

  function resolvesTo(Ctor, locale, key, value) {
    var options = create(null);
    options[key] = value;
    return call(Ctor.prototype.resolvedOptions, new Ctor(locale, options))[key] === value;
  }

  var DateTimeFormat = Intl.DateTimeFormat;
  var NumberFormat = Intl.NumberFormat;
  var Collator = Intl.Collator;
  var valueLists = create(null);
  // CLDR collations a Collator may take (not "standard" nor "search"), each with a locale that has it.
  var COLLATION_LOCALES = {
    big5han: 'zh', compat: 'ar', dict: 'si', direct: 'hi', ducet: 'en', emoji: 'en', eor: 'en', gb2312: 'zh',
    phonebk: 'de', phonetic: 'ln', pinyin: 'zh', reformed: 'sv', searchjl: 'ko', stroke: 'zh', trad: 'es',
    unihan: 'zh', zhuyin: 'zh',
  };
  var valueGetters = create(null);
  valueGetters.calendar = function () {
    var ids = 'buddhist chinese coptic dangi ethioaa ethiopic gregory hebrew indian islamic islamic-civil ' +
      'islamic-rgsa islamic-tbla islamic-umalqura iso8601 japanese persian roc';
    return probe(DateTimeFormat, split(ids, ' '), function (C, c) { return resolvesTo(C, 'en', 'calendar', c); });
  };
  valueGetters.collation = function () {
    return probe(Collator, getOwnPropertyNames(COLLATION_LOCALES), function (C, c) {
      return resolvesTo(C, COLLATION_LOCALES[c], 'collation', c);
    });
  };
  // ISO 4217 codes in current use (CLDR); Hermes's NumberFormat takes any well-formed code.
  valueGetters.currency = function () {
    return 'AED AFN ALL AMD ANG AOA ARS AUD AWG AZN BAM BBD BDT BGN BHD BIF BMD BND BOB BRL BSD BTN BWP BYN BZD ' +
      'CAD CDF CHF CLP CNY COP CRC CUC CUP CVE CZK DJF DKK DOP DZD EGP ERN ETB EUR FJD FKP GBP GEL GHS GIP ' +
      'GMD GNF GTQ GYD HKD HNL HRK HTG HUF IDR ILS INR IQD IRR ISK JMD JOD JPY KES KGS KHR KMF KPW KRW KWD ' +
      'KYD KZT LAK LBP LKR LRD LSL LYD MAD MDL MGA MKD MMK MNT MOP MRU MUR MVR MWK MXN MYR MZN NAD NGN NIO ' +
      'NOK NPR NZD OMR PAB PEN PGK PHP PKR PLN PYG QAR RON RSD RUB RWF SAR SBD SCR SDG SEK SGD SHP SLE SLL ' +
      'SOS SRD SSP STN SVC SYP SZL THB TJS TMT TND TOP TRY TTD TWD TZS UAH UGX USD UYU UZS VES VND VUV WST ' +
      'XAF XCD XCG XDR XOF XPF XSU YER ZAR ZMW ZWG ZWL';
  };
  valueGetters.numberingSystem = native.numberingSystems;
  valueGetters.timeZone = native.timeZones;
  valueGetters.unit = function () {
    var units = 'acre bit byte celsius centimeter day degree fahrenheit fluid-ounce foot gallon gigabit gigabyte ' +
      'gram hectare hour inch kilobit kilobyte kilogram kilometer liter megabit megabyte meter microsecond mile ' +
      'mile-scandinavian milliliter millimeter millisecond minute month nanosecond ounce percent petabyte pound ' +
      'second stone terabit terabyte week yard year';
    return probe(NumberFormat, split(units, ' '), function (C, u) {
      var options = create(null);
      options.style = 'unit';
      options.unit = u;
      new C('en', options);
      return true;
    });
  };

  if (Intl.supportedValuesOf === undefined) {
    hidden(Intl, 'supportedValuesOf', {
      supportedValuesOf(key) {
        key = toString(key);
        var get = valueGetters[key];
        if (get === undefined) throw new RangeError('Invalid key: ' + key);
        var list = valueLists[key];
        if (list === undefined) list = valueLists[key] = get();
        return list === '' ? [] : split(list, ' ');
      },
    }.supportedValuesOf, true);
  }
};
