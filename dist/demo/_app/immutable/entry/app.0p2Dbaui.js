const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["../nodes/0.vYWJ3zhz.js","../chunks/DIQkfzf6.js","../chunks/T3HeJ6fH.js","../chunks/BB02YFDg.js","../chunks/uuWi2k0i.js","../assets/toaster.xi9KzhT-.css","../chunks/CcvXDWxI.js","../assets/0.CyqF9K_m.css","../nodes/1.4XxPaUh2.js","../chunks/BActlzJV.js","../chunks/DOBfrr44.js","../chunks/By-IGkRb.js","../nodes/2.C3UkL-bm.js","../chunks/y7wTwufc.js","../chunks/C7pJgfXz.js","../chunks/nVpKcSPn.js","../assets/LlmSettingsPanel.DkKb93zC.css","../assets/2.DZSqN0Vj.css","../nodes/3.DgLBUxv1.js","../assets/3.DPutIy4k.css"])))=>i.map(i=>d[i]);
var __typeError = (msg) => {
  throw TypeError(msg);
};
var __accessCheck = (obj, member, msg) => member.has(obj) || __typeError("Cannot " + msg);
var __privateGet = (obj, member, getter) => (__accessCheck(obj, member, "read from private field"), getter ? getter.call(obj) : member.get(obj));
var __privateAdd = (obj, member, value) => member.has(obj) ? __typeError("Cannot add the same private member more than once") : member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
var __privateSet = (obj, member, value, setter) => (__accessCheck(obj, member, "write to private field"), setter ? setter.call(obj, value) : member.set(obj, value), value);
var _events, _instance;
import { b as bind_this, _ as __vitePreload } from "../chunks/C7pJgfXz.js";
import { y as hydrating, z as hydrate_next, x as block, E as EFFECT_TRANSPARENT, F as create_text, G as branch, I as current_batch, J as should_defer_append, M as hydrate_node, L as pause_effect, T as set, a7 as LEGACY_PROPS, g as get, ak as hydrate, al as mount, am as flushSync, O as define_property, an as unmount, Q as mutable_source, p as push, a as user_pre_effect, b as user_effect, ab as onMount, ao as state, a9 as tick, k as from_html, l as first_child, v as sibling, m as append, n as pop, ag as comment, o as child, s as reset, ai as user_derived, ah as text, t as template_effect, w as set_text } from "../chunks/T3HeJ6fH.js";
import "../chunks/DIQkfzf6.js";
import { p as prop, i as if_block } from "../chunks/CcvXDWxI.js";
function component(node, get_component, render_fn) {
  if (hydrating) {
    hydrate_next();
  }
  var anchor = node;
  var component2;
  var effect;
  var offscreen_fragment = null;
  var pending_effect = null;
  function commit() {
    if (effect) {
      pause_effect(effect);
      effect = null;
    }
    if (offscreen_fragment) {
      offscreen_fragment.lastChild.remove();
      anchor.before(offscreen_fragment);
      offscreen_fragment = null;
    }
    effect = pending_effect;
    pending_effect = null;
  }
  block(() => {
    if (component2 === (component2 = get_component())) return;
    var defer = should_defer_append();
    if (component2) {
      var target = anchor;
      if (defer) {
        offscreen_fragment = document.createDocumentFragment();
        offscreen_fragment.append(target = create_text());
        if (effect) {
          current_batch.skipped_effects.add(effect);
        }
      }
      pending_effect = branch(() => render_fn(target, component2));
    }
    if (defer) {
      current_batch.add_callback(commit);
    } else {
      commit();
    }
  }, EFFECT_TRANSPARENT);
  if (hydrating) {
    anchor = hydrate_node;
  }
}
function asClassComponent(component2) {
  return class extends Svelte4Component {
    /** @param {any} options */
    constructor(options) {
      super({
        component: component2,
        ...options
      });
    }
  };
}
class Svelte4Component {
  /**
   * @param {ComponentConstructorOptions & {
   *  component: any;
   * }} options
   */
  constructor(options) {
    /** @type {any} */
    __privateAdd(this, _events);
    /** @type {Record<string, any>} */
    __privateAdd(this, _instance);
    var _a, _b;
    var sources = /* @__PURE__ */ new Map();
    var add_source = (key, value) => {
      var s = mutable_source(value, false, false);
      sources.set(key, s);
      return s;
    };
    const props = new Proxy(
      { ...options.props || {}, $$events: {} },
      {
        get(target, prop2) {
          var _a2;
          return get((_a2 = sources.get(prop2)) != null ? _a2 : add_source(prop2, Reflect.get(target, prop2)));
        },
        has(target, prop2) {
          var _a2;
          if (prop2 === LEGACY_PROPS) return true;
          get((_a2 = sources.get(prop2)) != null ? _a2 : add_source(prop2, Reflect.get(target, prop2)));
          return Reflect.has(target, prop2);
        },
        set(target, prop2, value) {
          var _a2;
          set((_a2 = sources.get(prop2)) != null ? _a2 : add_source(prop2, value), value);
          return Reflect.set(target, prop2, value);
        }
      }
    );
    __privateSet(this, _instance, (options.hydrate ? hydrate : mount)(options.component, {
      target: options.target,
      anchor: options.anchor,
      props,
      context: options.context,
      intro: (_a = options.intro) != null ? _a : false,
      recover: options.recover
    }));
    if (!((_b = options == null ? void 0 : options.props) == null ? void 0 : _b.$$host) || options.sync === false) {
      flushSync();
    }
    __privateSet(this, _events, props.$$events);
    for (const key of Object.keys(__privateGet(this, _instance))) {
      if (key === "$set" || key === "$destroy" || key === "$on") continue;
      define_property(this, key, {
        get() {
          return __privateGet(this, _instance)[key];
        },
        /** @param {any} value */
        set(value) {
          __privateGet(this, _instance)[key] = value;
        },
        enumerable: true
      });
    }
    __privateGet(this, _instance).$set = /** @param {Record<string, any>} next */
    (next) => {
      Object.assign(props, next);
    };
    __privateGet(this, _instance).$destroy = () => {
      unmount(__privateGet(this, _instance));
    };
  }
  /** @param {Record<string, any>} props */
  $set(props) {
    __privateGet(this, _instance).$set(props);
  }
  /**
   * @param {string} event
   * @param {(...args: any[]) => any} callback
   * @returns {any}
   */
  $on(event, callback) {
    __privateGet(this, _events)[event] = __privateGet(this, _events)[event] || [];
    const cb = (...args) => callback.call(this, ...args);
    __privateGet(this, _events)[event].push(cb);
    return () => {
      __privateGet(this, _events)[event] = __privateGet(this, _events)[event].filter(
        /** @param {any} fn */
        (fn) => fn !== cb
      );
    };
  }
  $destroy() {
    __privateGet(this, _instance).$destroy();
  }
}
_events = new WeakMap();
_instance = new WeakMap();
const matchers = {};
var root_4 = from_html(`<div id="svelte-announcer" aria-live="assertive" aria-atomic="true" style="position: absolute; left: 0; top: 0; clip: rect(0 0 0 0); clip-path: inset(50%); overflow: hidden; white-space: nowrap; width: 1px; height: 1px"><!></div>`);
var root$1 = from_html(`<!> <!>`, 1);
function Root($$anchor, $$props) {
  push($$props, true);
  let components = prop($$props, "components", 23, () => []), data_0 = prop($$props, "data_0", 3, null), data_1 = prop($$props, "data_1", 3, null);
  {
    user_pre_effect(() => $$props.stores.page.set($$props.page));
  }
  user_effect(() => {
    $$props.stores;
    $$props.page;
    $$props.constructors;
    components();
    $$props.form;
    data_0();
    data_1();
    $$props.stores.page.notify();
  });
  let mounted = state(false);
  let navigated = state(false);
  let title = state(null);
  onMount(() => {
    const unsubscribe = $$props.stores.page.subscribe(() => {
      if (get(mounted)) {
        set(navigated, true);
        tick().then(() => {
          set(title, document.title || "untitled page", true);
        });
      }
    });
    set(mounted, true);
    return unsubscribe;
  });
  const Pyramid_1 = user_derived(() => $$props.constructors[1]);
  var fragment = root$1();
  var node = first_child(fragment);
  {
    var consequent = ($$anchor2) => {
      const Pyramid_0 = user_derived(() => $$props.constructors[0]);
      var fragment_1 = comment();
      var node_1 = first_child(fragment_1);
      component(node_1, () => get(Pyramid_0), ($$anchor3, Pyramid_0_1) => {
        bind_this(
          Pyramid_0_1($$anchor3, {
            get data() {
              return data_0();
            },
            get form() {
              return $$props.form;
            },
            get params() {
              return $$props.page.params;
            },
            children: ($$anchor4, $$slotProps) => {
              var fragment_2 = comment();
              var node_2 = first_child(fragment_2);
              component(node_2, () => get(Pyramid_1), ($$anchor5, Pyramid_1_1) => {
                bind_this(
                  Pyramid_1_1($$anchor5, {
                    get data() {
                      return data_1();
                    },
                    get form() {
                      return $$props.form;
                    },
                    get params() {
                      return $$props.page.params;
                    }
                  }),
                  ($$value) => components()[1] = $$value,
                  () => {
                    var _a;
                    return (_a = components()) == null ? void 0 : _a[1];
                  }
                );
              });
              append($$anchor4, fragment_2);
            },
            $$slots: { default: true }
          }),
          ($$value) => components()[0] = $$value,
          () => {
            var _a;
            return (_a = components()) == null ? void 0 : _a[0];
          }
        );
      });
      append($$anchor2, fragment_1);
    };
    var alternate = ($$anchor2) => {
      const Pyramid_0 = user_derived(() => $$props.constructors[0]);
      var fragment_3 = comment();
      var node_3 = first_child(fragment_3);
      component(node_3, () => get(Pyramid_0), ($$anchor3, Pyramid_0_2) => {
        bind_this(
          Pyramid_0_2($$anchor3, {
            get data() {
              return data_0();
            },
            get form() {
              return $$props.form;
            },
            get params() {
              return $$props.page.params;
            }
          }),
          ($$value) => components()[0] = $$value,
          () => {
            var _a;
            return (_a = components()) == null ? void 0 : _a[0];
          }
        );
      });
      append($$anchor2, fragment_3);
    };
    if_block(node, ($$render) => {
      if ($$props.constructors[1]) $$render(consequent);
      else $$render(alternate, false);
    });
  }
  var node_4 = sibling(node, 2);
  {
    var consequent_2 = ($$anchor2) => {
      var div = root_4();
      var node_5 = child(div);
      {
        var consequent_1 = ($$anchor3) => {
          var text$1 = text();
          template_effect(() => set_text(text$1, get(title)));
          append($$anchor3, text$1);
        };
        if_block(node_5, ($$render) => {
          if (get(navigated)) $$render(consequent_1);
        });
      }
      reset(div);
      append($$anchor2, div);
    };
    if_block(node_4, ($$render) => {
      if (get(mounted)) $$render(consequent_2);
    });
  }
  append($$anchor, fragment);
  pop();
}
const root = asClassComponent(Root);
const nodes = [
  () => __vitePreload(() => import("../nodes/0.vYWJ3zhz.js"), true ? __vite__mapDeps([0,1,2,3,4,5,6,7]) : void 0, import.meta.url),
  () => __vitePreload(() => import("../nodes/1.4XxPaUh2.js"), true ? __vite__mapDeps([8,1,9,2,10,11]) : void 0, import.meta.url),
  () => __vitePreload(() => import("../nodes/2.C3UkL-bm.js"), true ? __vite__mapDeps([12,13,1,9,2,6,14,15,3,16,4,5,11,17]) : void 0, import.meta.url),
  () => __vitePreload(() => import("../nodes/3.DgLBUxv1.js"), true ? __vite__mapDeps([18,1,9,2,15,6,3,16,19]) : void 0, import.meta.url)
];
const server_loads = [];
const dictionary = {
  "/": [2],
  "/settings": [3]
};
const hooks = {
  handleError: (({ error }) => {
    console.error(error);
  }),
  reroute: (() => {
  }),
  transport: {}
};
const decoders = Object.fromEntries(Object.entries(hooks.transport).map(([k, v]) => [k, v.decode]));
const hash = false;
const decode = (type, value) => decoders[type](value);
export {
  decode,
  decoders,
  dictionary,
  hash,
  hooks,
  matchers,
  nodes,
  root,
  server_loads
};
//# sourceMappingURL=app.0p2Dbaui.js.map
