import { e as effect, r as render_effect, u as untrack, q as queue_micro_task, S as STATE_SYMBOL } from "./T3HeJ6fH.js";
function is_bound_this(bound_value, element_or_component) {
  return bound_value === element_or_component || (bound_value == null ? void 0 : bound_value[STATE_SYMBOL]) === element_or_component;
}
function bind_this(element_or_component = {}, update, get_value, get_parts) {
  effect(() => {
    var old_parts;
    var parts;
    render_effect(() => {
      old_parts = parts;
      parts = [];
      untrack(() => {
        if (element_or_component !== get_value(...parts)) {
          update(element_or_component, ...parts);
          if (old_parts && is_bound_this(get_value(...old_parts), element_or_component)) {
            update(null, ...old_parts);
          }
        }
      });
    });
    return () => {
      queue_micro_task(() => {
        if (parts && is_bound_this(get_value(...parts), element_or_component)) {
          update(null, ...parts);
        }
      });
    };
  });
  return element_or_component;
}
const scriptRel = "modulepreload";
const assetsURL = function(dep, importerUrl) {
  return new URL(dep, importerUrl).href;
};
const seen = {};
const __vitePreload = function preload(baseModule, deps, importerUrl) {
  let promise = Promise.resolve();
  if (deps && deps.length > 0) {
    let allSettled = function(promises$2) {
      return Promise.all(promises$2.map((p) => Promise.resolve(p).then((value$1) => ({
        status: "fulfilled",
        value: value$1
      }), (reason) => ({
        status: "rejected",
        reason
      }))));
    };
    const links = document.getElementsByTagName("link"), cspNonceMeta = document.querySelector("meta[property=csp-nonce]"), cspNonce = (cspNonceMeta == null ? void 0 : cspNonceMeta.nonce) || (cspNonceMeta == null ? void 0 : cspNonceMeta.getAttribute("nonce"));
    promise = allSettled(deps.map((dep) => {
      dep = assetsURL(dep, importerUrl);
      if (dep in seen)
        return;
      seen[dep] = true;
      const isCss = dep.endsWith(".css"), cssSelector = isCss ? '[rel="stylesheet"]' : "";
      if (importerUrl)
        for (let i$1 = links.length - 1; i$1 >= 0; i$1--) {
          const link$1 = links[i$1];
          if (link$1.href === dep && (!isCss || link$1.rel === "stylesheet"))
            return;
        }
      else if (document.querySelector(`link[href="${dep}"]${cssSelector}`))
        return;
      const link = document.createElement("link");
      link.rel = isCss ? "stylesheet" : scriptRel;
      if (!isCss)
        link.as = "script";
      link.crossOrigin = "";
      link.href = dep;
      if (cspNonce)
        link.setAttribute("nonce", cspNonce);
      document.head.appendChild(link);
      if (isCss)
        return new Promise((res, rej) => {
          link.addEventListener("load", res);
          link.addEventListener("error", () => rej(Error(`Unable to preload CSS for ${dep}`)));
        });
    }));
  }
  function handlePreloadError(err$2) {
    const e$1 = new Event("vite:preloadError", { cancelable: true });
    e$1.payload = err$2;
    window.dispatchEvent(e$1);
    if (!e$1.defaultPrevented)
      throw err$2;
  }
  return promise.then((res) => {
    for (const item of res || []) {
      if (item.status !== "rejected")
        continue;
      handlePreloadError(item.reason);
    }
    return baseModule().catch(handlePreloadError);
  });
};
export {
  __vitePreload as _,
  bind_this as b
};
//# sourceMappingURL=C7pJgfXz.js.map
