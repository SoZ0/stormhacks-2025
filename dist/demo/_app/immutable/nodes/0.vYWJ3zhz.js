import "../chunks/DIQkfzf6.js";
import { ao as state, Z as proxy, g as get, a as user_pre_effect, am as flushSync, ai as user_derived, T as set, aW as onDestroy, b as user_effect, ab as onMount, p as push, k as from_html, o as child, s as reset, v as sibling, t as template_effect, w as set_text, m as append, n as pop, aX as props_id, aY as head, l as first_child, aZ as snippet, P as noop } from "../chunks/T3HeJ6fH.js";
import { c as attribute_effect, d as set_class, e as each, s as set_attribute } from "../chunks/BB02YFDg.js";
import { i as identity, a as isFunction, b as isEqual, e as ensure, M as MachineStatus, t as toArray, c as isString, w as warn, I as INIT_STATE, d as createScope, f as compact, m as machine, g as connect, h as group, j as toaster } from "../chunks/uuWi2k0i.js";
import { i as if_block, p as prop } from "../chunks/CcvXDWxI.js";
const ssr = false;
const prerender = false;
const _layout$1 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  prerender,
  ssr
}, Symbol.toStringTag, { value: "Module" }));
const favicon = "" + new URL("../assets/favicon.CA1ut2ny.png", import.meta.url).href;
function createNormalizer(fn) {
  return new Proxy({}, {
    get(_target, key) {
      if (key === "style")
        return (props) => {
          return fn({ style: props }).style;
        };
      return fn;
    }
  });
}
const propMap = {
  className: "class",
  defaultChecked: "checked",
  defaultValue: "value",
  htmlFor: "for",
  onBlur: "onfocusout",
  onChange: "oninput",
  onFocus: "onfocusin",
  onDoubleClick: "ondblclick"
};
function toStyleString(style) {
  let string = "";
  for (let key in style) {
    const value = style[key];
    if (value === null || value === void 0)
      continue;
    if (!key.startsWith("--"))
      key = key.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);
    string += `${key}:${value};`;
  }
  return string;
}
const preserveKeys = new Set("viewBox,className,preserveAspectRatio,fillRule,clipPath,clipRule,strokeWidth,strokeLinecap,strokeLinejoin,strokeDasharray,strokeDashoffset,strokeMiterlimit".split(","));
function toSvelteProp(key) {
  if (key in propMap)
    return propMap[key];
  if (preserveKeys.has(key))
    return key;
  return key.toLowerCase();
}
function toSveltePropValue(key, value) {
  if (key === "style" && typeof value === "object")
    return toStyleString(value);
  return value;
}
const normalizeProps = createNormalizer((props) => {
  const normalized = {};
  for (const key in props) {
    normalized[toSvelteProp(key)] = toSveltePropValue(key, props[key]);
  }
  return normalized;
});
function bindable(props) {
  var _a, _b;
  const initial = (_a = props().defaultValue) != null ? _a : props().value;
  const eq = (_b = props().isEqual) != null ? _b : Object.is;
  let value = state(proxy(initial));
  const controlled = user_derived(() => props().value !== void 0);
  let valueRef = { current: get(value) };
  let prevValue = { current: void 0 };
  user_pre_effect(() => {
    const v = get(controlled) ? props().value : get(value);
    valueRef = { current: v };
    prevValue = { current: v };
  });
  const setValueFn = (v) => {
    var _a2, _b2;
    const next = isFunction(v) ? v(valueRef.current) : v;
    const prev = prevValue.current;
    if (props().debug) {
      console.log(`[bindable > ${props().debug}] setValue`, { next, prev });
    }
    if (!get(controlled)) set(value, next, true);
    if (!eq(next, prev)) {
      (_b2 = (_a2 = props()).onChange) == null ? void 0 : _b2.call(_a2, next, prev);
    }
  };
  function get$1() {
    return get(controlled) ? props().value : get(value);
  }
  return {
    initial,
    ref: valueRef,
    get: get$1,
    set(val) {
      const exec = props().sync ? flushSync : identity;
      exec(() => setValueFn(val));
    },
    invoke(nextValue, prevValue2) {
      var _a2, _b2;
      (_b2 = (_a2 = props()).onChange) == null ? void 0 : _b2.call(_a2, nextValue, prevValue2);
    },
    hash(value2) {
      var _a2, _b2, _c;
      return (_c = (_b2 = (_a2 = props()).hash) == null ? void 0 : _b2.call(_a2, value2)) != null ? _c : String(value2);
    }
  };
}
bindable.cleanup = (fn) => {
  onDestroy(() => fn());
};
bindable.ref = (defaultValue) => {
  let value = defaultValue;
  return {
    get: () => value,
    set: (next) => {
      value = next;
    }
  };
};
function useRefs(refs) {
  const ref = proxy({ current: refs });
  return {
    get(key) {
      return ref.current[key];
    },
    set(key, value) {
      ref.current[key] = value;
    }
  };
}
const access$1 = (value) => {
  if (typeof value === "function") return value();
  return value;
};
const track = (deps, effect) => {
  let prevDeps = [];
  let isFirstRun = true;
  user_effect(() => {
    if (isFirstRun) {
      prevDeps = deps.map((d) => access$1(d));
      isFirstRun = false;
      return;
    }
    let changed = false;
    for (let i = 0; i < deps.length; i++) {
      if (!isEqual(prevDeps[i], access$1(deps[i]))) {
        changed = true;
        break;
      }
    }
    if (changed) {
      prevDeps = deps.map((d) => access$1(d));
      effect();
    }
  });
};
function access(userProps) {
  if (isFunction(userProps)) return userProps();
  return userProps;
}
function useMachine(machine2, userProps) {
  var _a, _b, _c, _d;
  const scope = user_derived(() => {
    const { id, ids, getRootNode } = access(userProps);
    return createScope({ id, ids, getRootNode });
  });
  const debug = (...args) => {
    if (machine2.debug) console.log(...args);
  };
  const props = user_derived(() => {
    var _a2, _b2;
    return (_b2 = (_a2 = machine2.props) == null ? void 0 : _a2.call(machine2, { props: compact(access(userProps)), scope: get(scope) })) != null ? _b2 : access(userProps);
  });
  const prop2 = useProp(() => get(props));
  const context = (_a = machine2.context) == null ? void 0 : _a.call(machine2, {
    prop: prop2,
    bindable,
    get scope() {
      return get(scope);
    },
    flush,
    getContext() {
      return ctx;
    },
    getComputed() {
      return computed;
    },
    getRefs() {
      return refs;
    },
    getEvent() {
      return getEvent();
    }
  });
  const ctx = {
    get(key) {
      return context == null ? void 0 : context[key].get();
    },
    set(key, value) {
      context == null ? void 0 : context[key].set(value);
    },
    initial(key) {
      return context == null ? void 0 : context[key].initial;
    },
    hash(key) {
      const current = context == null ? void 0 : context[key].get();
      return context == null ? void 0 : context[key].hash(current);
    }
  };
  let effects = /* @__PURE__ */ new Map();
  let transitionRef = { current: null };
  let previousEventRef = { current: null };
  let eventRef = proxy({ current: { type: "" } });
  const getEvent = () => ({
    ...eventRef.current,
    current() {
      return eventRef.current;
    },
    previous() {
      return previousEventRef.current;
    }
  });
  const getState = () => ({
    ...state2,
    hasTag(tag) {
      var _a2, _b2;
      const currentState = state2.get();
      return !!((_b2 = (_a2 = machine2.states[currentState]) == null ? void 0 : _a2.tags) == null ? void 0 : _b2.includes(tag));
    },
    matches(...values) {
      const currentState = state2.get();
      return values.includes(currentState);
    }
  });
  const refs = useRefs((_c = (_b = machine2.refs) == null ? void 0 : _b.call(machine2, { prop: prop2, context: ctx })) != null ? _c : {});
  const getParams = () => ({
    state: getState(),
    context: ctx,
    event: getEvent(),
    prop: prop2,
    send,
    action,
    guard,
    track,
    refs,
    computed,
    flush,
    scope: get(scope),
    choose
  });
  const action = (keys) => {
    const strs = isFunction(keys) ? keys(getParams()) : keys;
    if (!strs) return;
    const fns = strs.map((s) => {
      var _a2, _b2;
      const fn = (_b2 = (_a2 = machine2.implementations) == null ? void 0 : _a2.actions) == null ? void 0 : _b2[s];
      if (!fn) warn(`[zag-js] No implementation found for action "${JSON.stringify(s)}"`);
      return fn;
    });
    for (const fn of fns) {
      fn == null ? void 0 : fn(getParams());
    }
  };
  const guard = (str) => {
    var _a2, _b2;
    if (isFunction(str)) return str(getParams());
    return (_b2 = (_a2 = machine2.implementations) == null ? void 0 : _a2.guards) == null ? void 0 : _b2[str](getParams());
  };
  const effect = (keys) => {
    const strs = isFunction(keys) ? keys(getParams()) : keys;
    if (!strs) return;
    const fns = strs.map((s) => {
      var _a2, _b2;
      const fn = (_b2 = (_a2 = machine2.implementations) == null ? void 0 : _a2.effects) == null ? void 0 : _b2[s];
      if (!fn) warn(`[zag-js] No implementation found for effect "${JSON.stringify(s)}"`);
      return fn;
    });
    const cleanups = [];
    for (const fn of fns) {
      const cleanup = fn == null ? void 0 : fn(getParams());
      if (cleanup) cleanups.push(cleanup);
    }
    return () => cleanups.forEach((fn) => fn == null ? void 0 : fn());
  };
  const choose = (transitions) => {
    return toArray(transitions).find((t) => {
      let result = !t.guard;
      if (isString(t.guard)) result = !!guard(t.guard);
      else if (isFunction(t.guard)) result = t.guard(getParams());
      return result;
    });
  };
  const computed = (key) => {
    ensure(machine2.computed, () => `[zag-js] No computed object found on machine`);
    const fn = machine2.computed[key];
    return fn({
      context: ctx,
      event: getEvent(),
      prop: prop2,
      refs,
      scope: get(scope),
      computed
    });
  };
  const state2 = bindable(() => ({
    defaultValue: machine2.initialState({ prop: prop2 }),
    onChange(nextState, prevState) {
      var _a2, _b2, _c2, _d2;
      if (prevState) {
        const exitEffects = effects.get(prevState);
        exitEffects == null ? void 0 : exitEffects();
        effects.delete(prevState);
      }
      if (prevState) {
        action((_a2 = machine2.states[prevState]) == null ? void 0 : _a2.exit);
      }
      action((_b2 = transitionRef.current) == null ? void 0 : _b2.actions);
      const cleanup = effect((_c2 = machine2.states[nextState]) == null ? void 0 : _c2.effects);
      if (cleanup) effects.set(nextState, cleanup);
      if (prevState === INIT_STATE) {
        action(machine2.entry);
        const cleanup2 = effect(machine2.effects);
        if (cleanup2) effects.set(INIT_STATE, cleanup2);
      }
      action((_d2 = machine2.states[nextState]) == null ? void 0 : _d2.entry);
    }
  }));
  let status = MachineStatus.NotStarted;
  onMount(() => {
    const started = status === MachineStatus.Started;
    status = MachineStatus.Started;
    debug(started ? "rehydrating..." : "initializing...");
    state2.invoke(state2.initial, INIT_STATE);
  });
  onDestroy(() => {
    debug("unmounting...");
    status = MachineStatus.Stopped;
    effects.forEach((fn) => fn == null ? void 0 : fn());
    effects = /* @__PURE__ */ new Map();
    transitionRef.current = null;
    action(machine2.exit);
  });
  const send = (event) => {
    var _a2, _b2, _c2, _d2;
    if (status !== MachineStatus.Started) return;
    previousEventRef.current = eventRef.current;
    eventRef.current = event;
    let currentState = state2.get();
    const transitions = (_c2 = (_a2 = machine2.states[currentState].on) == null ? void 0 : _a2[event.type]) != null ? _c2 : (_b2 = machine2.on) == null ? void 0 : _b2[event.type];
    const transition = choose(transitions);
    if (!transition) return;
    transitionRef.current = transition;
    const target = (_d2 = transition.target) != null ? _d2 : currentState;
    const changed = target !== currentState;
    if (changed) {
      state2.set(target);
    } else if (transition.reenter && !changed) {
      state2.invoke(currentState, currentState);
    } else {
      action(transition.actions);
    }
  };
  (_d = machine2.watch) == null ? void 0 : _d.call(machine2, getParams());
  return {
    get state() {
      return getState();
    },
    send,
    context: ctx,
    prop: prop2,
    get scope() {
      return get(scope);
    },
    refs,
    computed,
    get event() {
      return getEvent();
    },
    getStatus: () => status
  };
}
function useProp(value) {
  return function get2(key) {
    return value()[key];
  };
}
function flush(fn) {
  flushSync(() => {
    queueMicrotask(() => fn());
  });
}
var root_1$1 = from_html(`<button>&times;</button>`);
var root$2 = from_html(`<div><div data-testid="toast-message"><span> </span> <span> </span></div> <!></div>`);
function Toast($$anchor, $$props) {
  push($$props, true);
  const service = useMachine(machine, () => ({
    ...$$props.toast,
    parent: $$props.parent,
    index: $$props.index
  }));
  const api = user_derived(() => connect(service, normalizeProps));
  const rxState = user_derived(() => {
    switch (get(api).type) {
      case "success":
        return $$props.stateSuccess;
      case "warning":
        return $$props.stateWarning;
      case "error":
        return $$props.stateError;
      default:
        return $$props.stateInfo;
    }
  });
  var div = root$2();
  attribute_effect(
    div,
    ($0) => {
      var _a, _b, _c, _d, _e, _f;
      return {
        class: `${(_a = $$props.base) != null ? _a : ""} ${(_b = $$props.width) != null ? _b : ""} ${(_c = $$props.padding) != null ? _c : ""} ${(_d = $$props.rounded) != null ? _d : ""} ${(_e = get(rxState)) != null ? _e : ""} ${(_f = $$props.classes) != null ? _f : ""}`,
        ...$0,
        "data-testid": "toast-root"
      };
    },
    [() => get(api).getRootProps()],
    void 0,
    "svelte-16nkmum"
  );
  var div_1 = child(div);
  var span = child(div_1);
  attribute_effect(
    span,
    ($0) => {
      var _a, _b;
      return {
        class: `${(_a = $$props.titleBase) != null ? _a : ""} ${(_b = $$props.titleClasses) != null ? _b : ""}`,
        ...$0,
        "data-testid": "toast-title"
      };
    },
    [() => get(api).getTitleProps()],
    void 0,
    "svelte-16nkmum"
  );
  var text = child(span, true);
  reset(span);
  var span_1 = sibling(span, 2);
  attribute_effect(
    span_1,
    ($0) => {
      var _a, _b;
      return {
        class: `${(_a = $$props.descriptionBase) != null ? _a : ""} ${(_b = $$props.descriptionClasses) != null ? _b : ""}`,
        ...$0,
        "data-testid": "toast-description"
      };
    },
    [() => get(api).getDescriptionProps()],
    void 0,
    "svelte-16nkmum"
  );
  var text_1 = child(span_1, true);
  reset(span_1);
  reset(div_1);
  var node = sibling(div_1, 2);
  {
    var consequent = ($$anchor2) => {
      var button = root_1$1();
      attribute_effect(
        button,
        ($0) => {
          var _a, _b;
          return {
            class: `${(_a = $$props.btnDismissBase) != null ? _a : ""} ${(_b = $$props.btnDismissClasses) != null ? _b : ""}`,
            title: $$props.btnDismissTitle,
            "aria-label": $$props.btnDismissAriaLabel,
            ...$0,
            "data-testid": "toast-dismiss"
          };
        },
        [() => get(api).getCloseTriggerProps()],
        void 0,
        "svelte-16nkmum"
      );
      append($$anchor2, button);
    };
    if_block(node, ($$render) => {
      if (get(api).closable) $$render(consequent);
    });
  }
  reset(div);
  template_effect(() => {
    var _a, _b;
    set_class(div_1, 1, `${(_a = $$props.messageBase) != null ? _a : ""} ${(_b = $$props.messageClasses) != null ? _b : ""}`);
    set_text(text, get(api).title);
    set_text(text_1, get(api).description);
  });
  append($$anchor, div);
  pop();
}
var root$1 = from_html(`<div></div>`);
function Toaster($$anchor, $$props) {
  const id = props_id();
  push($$props, true);
  const base = prop($$props, "base", 3, "flex justify-between items-center gap-3"), width = prop($$props, "width", 3, "min-w-xs"), padding = prop($$props, "padding", 3, "p-3"), rounded = prop($$props, "rounded", 3, "rounded-container"), classes = prop($$props, "classes", 3, ""), messageBase = prop($$props, "messageBase", 3, "grid"), messageClasses = prop($$props, "messageClasses", 3, ""), titleBase = prop($$props, "titleBase", 3, "font-semibold"), titleClasses = prop($$props, "titleClasses", 3, ""), descriptionBase = prop($$props, "descriptionBase", 3, "text-sm"), descriptionClasses = prop($$props, "descriptionClasses", 3, ""), btnDismissBase = prop($$props, "btnDismissBase", 3, "btn-icon hover:preset-tonal"), btnDismissClasses = prop($$props, "btnDismissClasses", 3, ""), btnDismissTitle = prop($$props, "btnDismissTitle", 3, "Dismiss"), btnDismissAriaLabel = prop($$props, "btnDismissAriaLabel", 3, "Dismiss"), stateInfo = prop($$props, "stateInfo", 3, "preset-outlined-surface-200-800 preset-filled-surface-50-950"), stateSuccess = prop($$props, "stateSuccess", 3, "preset-filled-success-500"), stateWarning = prop($$props, "stateWarning", 3, "preset-filled-warning-500"), stateError = prop($$props, "stateError", 3, "preset-filled-error-500");
  const service = useMachine(group.machine, () => ({ id, store: $$props.toaster }));
  const api = user_derived(() => group.connect(service, normalizeProps));
  var div = root$1();
  attribute_effect(div, ($0) => ({ ...$0, "data-testid": "toaster-root" }), [() => get(api).getGroupProps()]);
  each(div, 23, () => get(api).getToasts(), (toast) => toast.id, ($$anchor2, toast, index, $$array) => {
    Toast($$anchor2, {
      get base() {
        return base();
      },
      get width() {
        return width();
      },
      get padding() {
        return padding();
      },
      get rounded() {
        return rounded();
      },
      get classes() {
        return classes();
      },
      get messageBase() {
        return messageBase();
      },
      get messageClasses() {
        return messageClasses();
      },
      get titleBase() {
        return titleBase();
      },
      get titleClasses() {
        return titleClasses();
      },
      get descriptionBase() {
        return descriptionBase();
      },
      get descriptionClasses() {
        return descriptionClasses();
      },
      get btnDismissBase() {
        return btnDismissBase();
      },
      get btnDismissClasses() {
        return btnDismissClasses();
      },
      get btnDismissTitle() {
        return btnDismissTitle();
      },
      get btnDismissAriaLabel() {
        return btnDismissAriaLabel();
      },
      get stateInfo() {
        return stateInfo();
      },
      get stateError() {
        return stateError();
      },
      get stateWarning() {
        return stateWarning();
      },
      get stateSuccess() {
        return stateSuccess();
      },
      get toast() {
        return get(toast);
      },
      get index() {
        return get(index);
      },
      get parent() {
        return service;
      }
    });
  });
  reset(div);
  append($$anchor, div);
  pop();
}
var root_1 = from_html(`<link rel="icon" type="image/png"/>`);
var root = from_html(`<!> <!>`, 1);
function _layout($$anchor, $$props) {
  var fragment = root();
  head(($$anchor2) => {
    var link = root_1();
    template_effect(() => set_attribute(link, "href", favicon));
    append($$anchor2, link);
  });
  var node = first_child(fragment);
  snippet(node, () => {
    var _a;
    return (_a = $$props.children) != null ? _a : noop;
  });
  var node_1 = sibling(node, 2);
  Toaster(node_1, {
    get toaster() {
      return toaster;
    },
    classes: "z-[100]"
  });
  append($$anchor, fragment);
}
export {
  _layout as component,
  _layout$1 as universal
};
//# sourceMappingURL=0.vYWJ3zhz.js.map
